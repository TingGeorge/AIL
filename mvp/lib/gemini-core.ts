export type GeminiEnvironment = {
  GEMINI_API_KEY?: unknown;
  GEMINI_MODEL?: unknown;
};

export type GeminiConfiguration = {
  apiKey: string;
  model: string;
};

export type GeminiErrorCode =
  | 'AI_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_UPSTREAM_ERROR'
  | 'AI_REQUEST_REJECTED'
  | 'AI_INVALID_RESPONSE';

export class GeminiRequestError extends Error {
  readonly code: GeminiErrorCode;
  readonly status: number | null;
  readonly requestId: string | null;

  constructor(
    code: GeminiErrorCode,
    options: { status?: number; requestId?: string | null; cause?: unknown } = {},
  ) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'GeminiRequestError';
    this.code = code;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
  }
}

export type StructuredResponseOptions<T> = {
  configuration: GeminiConfiguration;
  instructions: string;
  input: unknown;
  schemaName: string;
  schema: Readonly<Record<string, unknown>>;
  validate: (value: unknown) => T | null;
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  createClientRequestId?: () => string;
};

export type StructuredResponseResult<T> = {
  data: T;
  requestId: string | null;
  clientRequestId: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

const GEMINI_MODELS_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 8_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function secretString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function readGeminiConfiguration(
  environment: unknown,
): GeminiConfiguration | null {
  if (!isRecord(environment)) return null;
  const apiKey = secretString(environment.GEMINI_API_KEY);
  const model = secretString(environment.GEMINI_MODEL);
  return apiKey && model ? { apiKey, model } : null;
}

function requestIdFromResponse(response: Response) {
  return (
    response.headers.get('x-goog-request-id') ??
    response.headers.get('x-request-id')
  );
}

function errorForStatus(status: number, requestId: string | null) {
  const code: GeminiErrorCode =
    status === 429
      ? 'AI_RATE_LIMITED'
      : status >= 500
        ? 'AI_UPSTREAM_ERROR'
        : 'AI_REQUEST_REJECTED';
  return new GeminiRequestError(code, { status, requestId });
}

function outputTextFromResponse(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return null;
  const candidate = value.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content)) return null;
  const parts = candidate.content.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
    .join('');
  return text.length > 0 ? text : null;
}

function safeTokenCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function usageFromResponse(value: unknown) {
  if (!isRecord(value) || !isRecord(value.usageMetadata)) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  return {
    inputTokens: safeTokenCount(value.usageMetadata.promptTokenCount),
    outputTokens: safeTokenCount(value.usageMetadata.candidatesTokenCount),
    totalTokens: safeTokenCount(value.usageMetadata.totalTokenCount),
  };
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function fallbackClientRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `ail-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function fetchWithinDeadline(
  fetchImpl: typeof fetch,
  url: string,
  request: RequestInit,
  deadline: number,
  now: () => number,
) {
  const remainingMs = deadline - now();
  if (remainingMs <= 0) throw new GeminiRequestError('AI_TIMEOUT');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetchImpl(url, {
      ...request,
      signal: controller.signal,
    });
    return {
      response,
      finish: () => clearTimeout(timeout),
      timedOut: () => controller.signal.aborted,
    };
  } catch (error) {
    clearTimeout(timeout);
    if (controller.signal.aborted || now() >= deadline) {
      throw new GeminiRequestError('AI_TIMEOUT', { cause: error });
    }
    throw new GeminiRequestError('AI_UNAVAILABLE', { cause: error });
  }
}

export async function createGeminiStructuredResponse<T>(
  options: StructuredResponseOptions<T>,
): Promise<StructuredResponseResult<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = Math.min(
    DEFAULT_TIMEOUT_MS,
    Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  );
  const deadline = now() + timeoutMs;
  const clientRequestId =
    options.createClientRequestId?.() ?? fallbackClientRequestId();
  const maxOutputTokens = Math.min(
    1_000,
    Math.max(100, options.maxOutputTokens ?? 500),
  );
  const url = `${GEMINI_MODELS_URL}/${encodeURIComponent(
    options.configuration.model,
  )}:generateContent`;
  const request: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': options.configuration.apiKey,
      'X-Client-Request-Id': clientRequestId,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.instructions }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(options.input) }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: options.schema,
        maxOutputTokens,
        temperature: 0.1,
      },
    }),
  };

  let response: Response | null = null;
  let finishActiveRequest = () => {};
  let activeRequestTimedOut = () => false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fetched = await fetchWithinDeadline(
      fetchImpl,
      url,
      request,
      deadline,
      now,
    );
    response = fetched.response;
    if (response.ok) {
      finishActiveRequest = fetched.finish;
      activeRequestTimedOut = fetched.timedOut;
      break;
    }
    fetched.finish();

    const requestId = requestIdFromResponse(response);
    const shouldRetry =
      attempt === 0 && (response.status === 429 || response.status >= 500);
    if (!shouldRetry) throw errorForStatus(response.status, requestId);

    const remainingMs = deadline - now();
    const delayMs = Math.min(
      Math.max(0, remainingMs - 1),
      50 + Math.floor(random() * 100),
    );
    if (delayMs <= 0) throw new GeminiRequestError('AI_TIMEOUT');
    await sleep(delayMs);
  }

  if (!response?.ok) throw new GeminiRequestError('AI_UPSTREAM_ERROR');
  const requestId = requestIdFromResponse(response);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const timedOut = activeRequestTimedOut() || now() >= deadline;
    throw new GeminiRequestError(
      timedOut ? 'AI_TIMEOUT' : 'AI_INVALID_RESPONSE',
      { requestId, cause: error },
    );
  } finally {
    finishActiveRequest();
  }
  if (activeRequestTimedOut() || now() >= deadline) {
    throw new GeminiRequestError('AI_TIMEOUT', { requestId });
  }
  const outputText = outputTextFromResponse(payload);
  if (outputText === null) {
    throw new GeminiRequestError('AI_INVALID_RESPONSE', { requestId });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(outputText);
  } catch (error) {
    throw new GeminiRequestError('AI_INVALID_RESPONSE', {
      requestId,
      cause: error,
    });
  }
  const data = options.validate(decoded);
  if (data === null) {
    throw new GeminiRequestError('AI_INVALID_RESPONSE', { requestId });
  }
  return {
    data,
    requestId,
    clientRequestId,
    usage: usageFromResponse(payload),
  };
}
