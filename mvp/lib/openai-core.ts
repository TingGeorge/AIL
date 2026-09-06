export type OpenAIEnvironment = {
  OPENAI_API_KEY?: unknown;
  OPENAI_MODEL?: unknown;
};

export type OpenAIConfiguration = {
  apiKey: string;
  model: string;
};

export type OpenAIErrorCode =
  | 'AI_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_UPSTREAM_ERROR'
  | 'AI_REQUEST_REJECTED'
  | 'AI_INVALID_RESPONSE';

export class OpenAIRequestError extends Error {
  readonly code: OpenAIErrorCode;
  readonly status: number | null;
  readonly requestId: string | null;

  constructor(
    code: OpenAIErrorCode,
    options: {
      status?: number;
      requestId?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(
      code,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'OpenAIRequestError';
    this.code = code;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
  }
}

export type StructuredResponseOptions<T> = {
  configuration: OpenAIConfiguration;
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

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_TIMEOUT_MS = 8_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function secretString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function readOpenAIConfiguration(
  environment: unknown,
): OpenAIConfiguration | null {
  if (!isRecord(environment)) return null;
  const apiKey = secretString(environment.OPENAI_API_KEY);
  const model = secretString(environment.OPENAI_MODEL);
  return apiKey && model ? { apiKey, model } : null;
}

function errorForStatus(status: number, requestId: string | null) {
  const code: OpenAIErrorCode =
    status === 429
      ? 'AI_RATE_LIMITED'
      : status >= 500
        ? 'AI_UPSTREAM_ERROR'
        : 'AI_REQUEST_REJECTED';
  return new OpenAIRequestError(code, { status, requestId });
}

function outputTextFromResponse(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.output)) return null;
  for (const outputItem of value.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (
        isRecord(contentItem) &&
        contentItem.type === 'output_text' &&
        typeof contentItem.text === 'string'
      ) {
        return contentItem.text;
      }
    }
  }
  return null;
}

function safeTokenCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function usageFromResponse(value: unknown) {
  if (!isRecord(value) || !isRecord(value.usage)) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  return {
    inputTokens: safeTokenCount(value.usage.input_tokens),
    outputTokens: safeTokenCount(value.usage.output_tokens),
    totalTokens: safeTokenCount(value.usage.total_tokens),
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
  request: RequestInit,
  deadline: number,
  now: () => number,
) {
  const remainingMs = deadline - now();
  if (remainingMs <= 0) throw new OpenAIRequestError('AI_TIMEOUT');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
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
      throw new OpenAIRequestError('AI_TIMEOUT', { cause: error });
    }
    throw new OpenAIRequestError('AI_UNAVAILABLE', { cause: error });
  }
}

export async function createOpenAIStructuredResponse<T>(
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
  const request: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.configuration.apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-Request-Id': clientRequestId,
    },
    body: JSON.stringify({
      model: options.configuration.model,
      store: false,
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: 'low' },
      instructions: options.instructions,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: JSON.stringify(options.input) },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: options.schemaName,
          strict: true,
          schema: options.schema,
        },
      },
      tools: [],
      tool_choice: 'none',
      parallel_tool_calls: false,
    }),
  };

  let response: Response | null = null;
  let finishActiveRequest = () => {};
  let activeRequestTimedOut = () => false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fetched = await fetchWithinDeadline(
      fetchImpl,
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

    const requestId = response.headers.get('x-request-id');
    const shouldRetry =
      attempt === 0 && (response.status === 429 || response.status >= 500);
    if (!shouldRetry) throw errorForStatus(response.status, requestId);

    const remainingMs = deadline - now();
    const delayMs = Math.min(
      Math.max(0, remainingMs - 1),
      50 + Math.floor(random() * 100),
    );
    if (delayMs <= 0) throw new OpenAIRequestError('AI_TIMEOUT');
    await sleep(delayMs);
  }

  if (!response?.ok) throw new OpenAIRequestError('AI_UPSTREAM_ERROR');
  const requestId = response.headers.get('x-request-id');
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const timedOut = activeRequestTimedOut() || now() >= deadline;
    throw new OpenAIRequestError(
      timedOut ? 'AI_TIMEOUT' : 'AI_INVALID_RESPONSE',
      {
        requestId,
        cause: error,
      },
    );
  } finally {
    finishActiveRequest();
  }
  if (activeRequestTimedOut() || now() >= deadline) {
    throw new OpenAIRequestError('AI_TIMEOUT', { requestId });
  }
  const outputText = outputTextFromResponse(payload);
  if (outputText === null) {
    throw new OpenAIRequestError('AI_INVALID_RESPONSE', { requestId });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(outputText);
  } catch (error) {
    throw new OpenAIRequestError('AI_INVALID_RESPONSE', {
      requestId,
      cause: error,
    });
  }
  const data = options.validate(decoded);
  if (data === null) {
    throw new OpenAIRequestError('AI_INVALID_RESPONSE', { requestId });
  }
  return {
    data,
    requestId,
    clientRequestId,
    usage: usageFromResponse(payload),
  };
}
