import { env } from 'cloudflare:workers';
import {
  handleSearchParseRequest,
  type AiInvocationOptions,
  type AiInvoker,
} from '@/lib/ai-handlers';
import {
  consumeAiRateLimit,
  type AiRateLimitDatabaseLike,
} from '@/lib/ai-rate-limit';
import {
  createGeminiStructuredResponse,
  readGeminiConfiguration,
} from '@/lib/gemini-server';

export const dynamic = 'force-dynamic';

function aiInvoker(): AiInvoker | null {
  const configuration = readGeminiConfiguration(env);
  if (!configuration) return null;
  return async <T>(options: AiInvocationOptions<T>) => {
    const result = await createGeminiStructuredResponse<T>({
      ...options,
      configuration,
    });
    return result.data;
  };
}

function rateLimitDatabase() {
  const candidate = (env as unknown as { DB?: unknown }).DB;
  return candidate &&
    typeof candidate === 'object' &&
    'prepare' in candidate &&
    typeof (candidate as AiRateLimitDatabaseLike).prepare === 'function'
    ? (candidate as AiRateLimitDatabaseLike)
    : null;
}

export async function POST(request: Request) {
  const decision = await consumeAiRateLimit(
    rateLimitDatabase(),
    'ai',
    request.headers,
  );
  if (decision.reason === 'limit_exceeded') {
    return Response.json(
      {
        error: 'AI_RATE_LIMITED',
        message: 'AI 使用次數已達每分鐘上限，請稍後再試。',
        retryAfterSeconds: decision.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Cache-Control': 'private, no-store',
          'Retry-After': String(decision.retryAfterSeconds),
        },
      },
    );
  }
  return handleSearchParseRequest(request, {
    invoke: decision.allowed ? aiInvoker() : null,
  });
}
