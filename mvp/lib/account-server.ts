import { env } from 'cloudflare:workers';
import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  ACCOUNT_USERNAME_PATTERN,
  type AccountDataEnvelope,
  type AccountUser,
} from '@/lib/account-contract';

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

export type AccountDatabase = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown[]>;
};

type CredentialRow = {
  user_id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  status: string;
  nickname: string | null;
  avatar_ref: string | null;
};

type SessionRow = {
  session_id: string;
  user_id: string;
  username: string;
  nickname: string | null;
  avatar_ref: string | null;
  expires_at: string;
};

type StateRow = { state_json: string; updated_at: string };

const encoder = new TextEncoder();
const passwordIterations = 210_000;
const sessionTtlMs = 30 * 60 * 1_000;
const defaultAvatar = '#c9ff36';
const maximumStateBytes = 750_000;
const fakeSalt = 'dGhpcy1pcy1hLXRpbWluZy1zYWx0';

export class AccountServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function accountDatabase() {
  const candidate = (env as unknown as { DB?: unknown }).DB;
  if (
    candidate &&
    typeof candidate === 'object' &&
    'prepare' in candidate &&
    'batch' in candidate &&
    typeof (candidate as AccountDatabase).prepare === 'function' &&
    typeof (candidate as AccountDatabase).batch === 'function'
  ) {
    return candidate as AccountDatabase;
  }
  return null;
}

export function normalizeUsername(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateAccountInput(input: {
  username?: unknown;
  password?: unknown;
  nickname?: unknown;
}) {
  const username = normalizeUsername(input.username);
  const password = typeof input.password === 'string' ? input.password : '';
  const nickname =
    typeof input.nickname === 'string' && input.nickname.trim()
      ? input.nickname.trim().slice(0, 30)
      : username;
  if (!ACCOUNT_USERNAME_PATTERN.test(username)) {
    throw new AccountServerError(
      400,
      'invalid_username',
      '帳號需為 3–30 個小寫英數字、底線或連字號。',
    );
  }
  if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH || password.length > 128) {
    throw new AccountServerError(
      400,
      'invalid_password',
      `密碼至少需要 ${ACCOUNT_PASSWORD_MIN_LENGTH} 個字元。`,
    );
  }
  return { username, password, nickname };
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value: string) {
  return bytesToBase64Url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(value)),
    ),
  );
}

export async function derivePasswordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64UrlToBytes(salt),
      iterations: passwordIterations,
    },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function safeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function toUser(
  row: Pick<CredentialRow, 'user_id' | 'username' | 'nickname' | 'avatar_ref'>,
): AccountUser {
  return {
    id: row.user_id,
    username: row.username,
    nickname: row.nickname || row.username,
    avatar: row.avatar_ref || defaultAvatar,
  };
}

async function readAccountData(db: AccountDatabase, userId: string) {
  const row = await db
    .prepare(
      'SELECT state_json, updated_at FROM account_state WHERE user_id = ?',
    )
    .bind(userId)
    .first<StateRow>();
  if (!row) return { state: {}, updatedAt: null } satisfies AccountDataEnvelope;
  try {
    const state = JSON.parse(row.state_json) as unknown;
    return {
      state:
        state && typeof state === 'object' && !Array.isArray(state)
          ? (state as Record<string, unknown>)
          : {},
      updatedAt: row.updated_at,
    } satisfies AccountDataEnvelope;
  } catch {
    return {
      state: {},
      updatedAt: row.updated_at,
    } satisfies AccountDataEnvelope;
  }
}

async function createSession(db: AccountDatabase, userId: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlMs).toISOString();
  await db
    .prepare(
      'INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)',
    )
    .bind(crypto.randomUUID(), userId, tokenHash, now.toISOString(), expiresAt)
    .run();
  return { token, expiresAt };
}

export async function registerAccount(
  db: AccountDatabase,
  input: { username?: unknown; password?: unknown; nickname?: unknown },
) {
  const { username, password, nickname } = validateAccountInput(input);
  const duplicate = await db
    .prepare('SELECT user_id FROM auth_credentials WHERE username = ?')
    .bind(username)
    .first<{ user_id: string }>();
  if (duplicate) {
    throw new AccountServerError(409, 'username_taken', '這個帳號已被使用。');
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const salt = randomToken(16);
  const passwordHash = await derivePasswordHash(password, salt);
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO users (id, auth_subject, email, status, created_at, updated_at, deleted_at) VALUES (?, ?, NULL, 'ACTIVE', ?, ?, NULL)",
        )
        .bind(userId, `username:${username}`, now, now),
      db
        .prepare(
          "INSERT INTO profiles (user_id, display_name, nickname, avatar_ref, home_area_id, default_party_size, cp_preset, onboarding_completed_at, updated_at) VALUES (?, ?, ?, ?, NULL, 1, 'BALANCED', NULL, ?)",
        )
        .bind(userId, nickname, nickname, defaultAvatar, now),
      db
        .prepare(
          'INSERT INTO auth_credentials (user_id, username, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(userId, username, passwordHash, salt, now, now),
      db
        .prepare(
          "INSERT INTO account_state (user_id, state_json, updated_at) VALUES (?, '{}', ?)",
        )
        .bind(userId, now),
    ]);
  } catch {
    throw new AccountServerError(409, 'username_taken', '這個帳號已被使用。');
  }

  const session = await createSession(db, userId);
  return {
    user: { id: userId, username, nickname, avatar: defaultAvatar },
    sessionToken: session.token,
    expiresAt: session.expiresAt,
    data: await readAccountData(db, userId),
  };
}

export async function loginAccount(
  db: AccountDatabase,
  input: { username?: unknown; password?: unknown },
) {
  const { username, password } = validateAccountInput(input);
  const row = await db
    .prepare(
      `SELECT c.user_id, c.username, c.password_hash, c.password_salt,
              u.status, p.nickname, p.avatar_ref
         FROM auth_credentials c
         JOIN users u ON u.id = c.user_id
         LEFT JOIN profiles p ON p.user_id = c.user_id
        WHERE c.username = ?`,
    )
    .bind(username)
    .first<CredentialRow>();
  const candidateHash = await derivePasswordHash(
    password,
    row?.password_salt ?? fakeSalt,
  );
  if (
    !row ||
    row.status !== 'ACTIVE' ||
    !safeEqual(candidateHash, row.password_hash)
  ) {
    throw new AccountServerError(
      401,
      'invalid_credentials',
      '帳號或密碼不正確。',
    );
  }
  const session = await createSession(db, row.user_id);
  return {
    user: toUser(row),
    sessionToken: session.token,
    expiresAt: session.expiresAt,
    data: await readAccountData(db, row.user_id),
  };
}

export async function authorizeAccount(db: AccountDatabase, request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  if (!token) {
    throw new AccountServerError(
      401,
      'authentication_required',
      '請先登入帳號。',
    );
  }
  const tokenHash = await sha256(token);
  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.user_id, c.username, p.nickname,
              p.avatar_ref, s.expires_at
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         JOIN auth_credentials c ON c.user_id = s.user_id
         LEFT JOIN profiles p ON p.user_id = s.user_id
        WHERE s.token_hash = ? AND s.revoked_at IS NULL
          AND s.expires_at > ? AND u.status = 'ACTIVE'`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionRow>();
  if (!row) {
    throw new AccountServerError(
      401,
      'session_expired',
      '登入已逾時，請重新登入。',
    );
  }
  return {
    sessionId: row.session_id,
    user: toUser(row),
    expiresAt: row.expires_at,
  };
}

export async function accountMe(db: AccountDatabase, request: Request) {
  const session = await authorizeAccount(db, request);
  return {
    user: session.user,
    expiresAt: session.expiresAt,
    data: await readAccountData(db, session.user.id),
  };
}

export async function revokeAccountSession(
  db: AccountDatabase,
  request: Request,
) {
  const session = await authorizeAccount(db, request);
  await db
    .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), session.sessionId)
    .run();
}

export async function writeAccountData(
  db: AccountDatabase,
  request: Request,
  state: unknown,
) {
  const session = await authorizeAccount(db, request);
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new AccountServerError(
      400,
      'invalid_account_data',
      '帳號資料格式不正確。',
    );
  }
  const stateJson = JSON.stringify(state);
  if (encoder.encode(stateJson).byteLength > maximumStateBytes) {
    throw new AccountServerError(
      413,
      'account_data_too_large',
      '帳號資料超過可儲存上限。',
    );
  }
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO account_state (user_id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json,
         updated_at = excluded.updated_at`,
    )
    .bind(session.user.id, stateJson, now)
    .run();
  return { state: state as Record<string, unknown>, updatedAt: now };
}

export function accountErrorResponse(error: unknown) {
  if (error instanceof AccountServerError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return Response.json(
    { error: 'account_service_unavailable', message: '帳號服務暫時無法使用。' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function missingAccountDatabaseResponse() {
  return Response.json(
    { error: 'account_database_unavailable', message: '帳號資料庫尚未啟用。' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
