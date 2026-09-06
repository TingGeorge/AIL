export const AI_RATE_LIMIT_WINDOW_MS = 60_000;
export const AI_RATE_LIMIT_MAX_REQUESTS = 10;
export const AI_RATE_LIMIT_SESSION_HEADER = 'x-all-in-life-session';

export type AiRateLimitStatementLike = {
  bind: (...values: unknown[]) => AiRateLimitStatementLike;
  first: <T>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

export type AiRateLimitDatabaseLike = {
  prepare: (query: string) => AiRateLimitStatementLike;
};

export type AiRateLimitHeaderReader = {
  get: (name: string) => string | null;
};

export type AiRateLimitDecision = {
  allowed: boolean;
  reason: 'allowed' | 'limit_exceeded' | 'unavailable';
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type AiRateLimitOptions = {
  nowMs?: number;
  limit?: number;
  windowMs?: number;
};

type AiRateLimitRow = {
  window_started_at: number;
  request_count: number;
  expires_at: number;
};

const UPSERT_RATE_LIMIT_WINDOW = `
  INSERT INTO ai_rate_limit_windows (
    bucket_key,
    window_started_at,
    request_count,
    expires_at
  ) VALUES (?, ?, 1, ?)
  ON CONFLICT(bucket_key) DO UPDATE SET
    window_started_at = excluded.window_started_at,
    request_count = CASE
      WHEN ai_rate_limit_windows.window_started_at = excluded.window_started_at
        THEN ai_rate_limit_windows.request_count + 1
      ELSE 1
    END,
    expires_at = excluded.expires_at
  WHERE ai_rate_limit_windows.window_started_at <> excluded.window_started_at
    OR ai_rate_limit_windows.request_count < ?
  RETURNING window_started_at, request_count, expires_at
`;

const DELETE_EXPIRED_RATE_LIMIT_WINDOWS = `
  DELETE FROM ai_rate_limit_windows
  WHERE expires_at <= ?
`;

function boundedHeader(value: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.slice(0, 512);
}

function rateLimitIdentity(headers: AiRateLimitHeaderReader) {
  const connectingIp = boundedHeader(headers.get('CF-Connecting-IP'));
  if (connectingIp) return `ip\u0000${connectingIp}`;

  const sessionId = boundedHeader(headers.get(AI_RATE_LIMIT_SESSION_HEADER));
  if (sessionId) return `session\u0000${sessionId}`;

  return 'anonymous';
}

function hexDigest(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createAiRateLimitBucketKey(
  scope: string,
  headers: AiRateLimitHeaderReader,
) {
  const normalizedScope = scope.trim();
  if (normalizedScope.length < 1 || normalizedScope.length > 120) {
    throw new TypeError('Invalid AI rate-limit scope.');
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable.');
  }

  const material = `all-in-life-ai-rate-limit-v1\u0000${normalizedScope}\u0000${rateLimitIdentity(headers)}`;
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(material),
  );
  return `v1:${hexDigest(digest)}`;
}

function validPositiveInteger(value: number, maximum: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function unavailableDecision(limit: number): AiRateLimitDecision {
  return {
    allowed: false,
    reason: 'unavailable',
    limit,
    remaining: 0,
    retryAfterSeconds: 0,
  };
}

export async function consumeAiRateLimit(
  database: AiRateLimitDatabaseLike | null | undefined,
  scope: string,
  headers: AiRateLimitHeaderReader,
  options: AiRateLimitOptions = {},
): Promise<AiRateLimitDecision> {
  const limit = options.limit ?? AI_RATE_LIMIT_MAX_REQUESTS;
  const windowMs = options.windowMs ?? AI_RATE_LIMIT_WINDOW_MS;
  const nowMs = options.nowMs ?? Date.now();

  if (
    !database ||
    !validPositiveInteger(limit, 10_000) ||
    !validPositiveInteger(windowMs, 86_400_000) ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0
  ) {
    return unavailableDecision(
      validPositiveInteger(limit, 10_000) ? limit : AI_RATE_LIMIT_MAX_REQUESTS,
    );
  }

  try {
    const bucketKey = await createAiRateLimitBucketKey(scope, headers);
    const windowStartedAt = Math.floor(nowMs / windowMs) * windowMs;
    const expiresAt = windowStartedAt + windowMs;
    const row = await database
      .prepare(UPSERT_RATE_LIMIT_WINDOW)
      .bind(bucketKey, windowStartedAt, expiresAt, limit)
      .first<AiRateLimitRow>();

    if (row === null) {
      return {
        allowed: false,
        reason: 'limit_exceeded',
        limit,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - nowMs) / 1_000)),
      };
    }

    if (
      row.window_started_at !== windowStartedAt ||
      row.expires_at !== expiresAt ||
      !Number.isSafeInteger(row.request_count) ||
      row.request_count < 1 ||
      row.request_count > limit
    ) {
      return unavailableDecision(limit);
    }

    return {
      allowed: true,
      reason: 'allowed',
      limit,
      remaining: limit - row.request_count,
      retryAfterSeconds: 0,
    };
  } catch {
    return unavailableDecision(limit);
  }
}

export async function pruneExpiredAiRateLimitWindows(
  database: AiRateLimitDatabaseLike,
  nowMs = Date.now(),
) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new TypeError('Invalid AI rate-limit cleanup time.');
  }
  return database.prepare(DELETE_EXPIRED_RATE_LIMIT_WINDOWS).bind(nowMs).run();
}
