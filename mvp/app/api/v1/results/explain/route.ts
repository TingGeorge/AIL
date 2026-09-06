import { env } from 'cloudflare:workers';
import {
  handleResultsExplainRequest,
  readBoundedJsonBody,
  type AiInvocationOptions,
  type AiInvoker,
} from '@/lib/ai-handlers';
import {
  catalogOptionsForExplain,
  parsePublicResultsExplainRequest,
  rebuildTrustedExplainRequest,
} from '@/lib/ai-explain-catalog';
import {
  consumeAiRateLimit,
  type AiRateLimitDatabaseLike,
} from '@/lib/ai-rate-limit';
import { loadLiveCatalogOverlay } from '@/lib/catalog-live-refresh.mjs';
import {
  loadCatalogFromD1,
  loadCatalogFromSnapshot,
  type D1DatabaseLike,
} from '@/lib/catalog-server';
import {
  createOpenAIStructuredResponse,
  readOpenAIConfiguration,
} from '@/lib/openai-server';

export const dynamic = 'force-dynamic';

function aiInvoker(): AiInvoker | null {
  const configuration = readOpenAIConfiguration(env);
  if (!configuration) return null;
  return async <T>(options: AiInvocationOptions<T>) => {
    const result = await createOpenAIStructuredResponse<T>({
      ...options,
      configuration,
    });
    return result.data;
  };
}

type ExplainDatabase = AiRateLimitDatabaseLike & D1DatabaseLike;

function databaseBinding(): ExplainDatabase | null {
  const candidate = (env as unknown as { DB?: unknown }).DB;
  return candidate &&
    typeof candidate === 'object' &&
    'prepare' in candidate &&
    typeof (candidate as ExplainDatabase).prepare === 'function'
    ? (candidate as ExplainDatabase)
    : null;
}

function safeError(code: string, message: string, status: number) {
  return Response.json(
    { error: code, message },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(request: Request) {
  const database = databaseBinding();
  const decision = await consumeAiRateLimit(database, 'ai', request.headers);
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

  const body = await readBoundedJsonBody(request);
  if (!body.ok) return safeError('INVALID_BODY', body.message, 400);
  const publicRequest = parsePublicResultsExplainRequest(body.value);
  if (!publicRequest.ok) {
    return safeError(
      publicRequest.error.code,
      publicRequest.error.message,
      400,
    );
  }

  const serverNow = new Date();
  const options = catalogOptionsForExplain(publicRequest.value, serverNow);
  let liveOverlay = {};
  try {
    liveOverlay = await loadLiveCatalogOverlay(options);
  } catch {
    // The persisted catalog remains the trust source when live refresh fails.
  }

  let catalog;
  if (!database) {
    catalog = await loadCatalogFromSnapshot(options, undefined, liveOverlay);
  } else {
    try {
      catalog = await loadCatalogFromD1(database, options, liveOverlay);
    } catch {
      catalog = await loadCatalogFromSnapshot(options, undefined, liveOverlay);
    }
  }
  const trusted = rebuildTrustedExplainRequest(
    publicRequest.value,
    catalog.items,
  );
  if (!trusted.ok) {
    return safeError(trusted.error.code, trusted.error.message, 409);
  }

  const trustedRequest = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trusted.value),
  });
  return handleResultsExplainRequest(trustedRequest, {
    invoke: decision.allowed ? aiInvoker() : null,
  });
}
