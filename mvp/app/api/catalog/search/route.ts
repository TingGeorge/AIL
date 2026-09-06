import { env } from 'cloudflare:workers';
import {
  catalogCategories,
  DEFAULT_EVENT_WINDOW_DAYS,
  MAX_EVENT_WINDOW_DAYS,
  type CatalogCategoryKey,
} from '@/lib/catalog-contract';
import {
  loadCatalogFromD1,
  loadCatalogFromSnapshot,
  YUANSHAN_COVERAGE,
  type D1DatabaseLike,
} from '@/lib/catalog-server';
import { loadLiveCatalogOverlay } from '@/lib/catalog-live-refresh.mjs';

export const dynamic = 'force-dynamic';

const categoryKeys = new Set<CatalogCategoryKey>(
  catalogCategories.map((category) => category.key),
);

function databaseBinding() {
  const candidate = (env as unknown as { DB?: unknown }).DB;
  if (
    candidate &&
    typeof candidate === 'object' &&
    'prepare' in candidate &&
    typeof (candidate as D1DatabaseLike).prepare === 'function'
  ) {
    return candidate as D1DatabaseLike;
  }
  return null;
}

function numberParameter(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

async function search(parameters: URLSearchParams) {
  const requestedCategory = parameters.get('category') ?? 'ALL';
  if (
    requestedCategory !== 'ALL' &&
    !categoryKeys.has(requestedCategory as CatalogCategoryKey)
  ) {
    return Response.json(
      { error: 'INVALID_CATEGORY', message: 'Unsupported catalog category.' },
      { status: 400 },
    );
  }

  const latitude = numberParameter(
    parameters.get('lat'),
    YUANSHAN_COVERAGE.center.latitude,
    -90,
    90,
  );
  const longitude = numberParameter(
    parameters.get('lng'),
    YUANSHAN_COVERAGE.center.longitude,
    -180,
    180,
  );
  const serverNow = new Date();
  const atValue = parameters.get('at');
  const at = atValue ? new Date(atValue) : serverNow;
  if (Number.isNaN(at.getTime())) {
    return Response.json(
      { error: 'INVALID_TIME', message: 'at must be a valid RFC3339 time.' },
      { status: 400 },
    );
  }

  const options = {
    category: requestedCategory as CatalogCategoryKey | 'ALL',
    origin: { latitude, longitude },
    serverNow,
    radiusM: numberParameter(
      parameters.get('radiusM'),
      YUANSHAN_COVERAGE.radiusM,
      100,
      YUANSHAN_COVERAGE.radiusM,
    ),
    at,
    eventWindowDays: Math.round(
      numberParameter(
        parameters.get('eventWindowDays'),
        DEFAULT_EVENT_WINDOW_DAYS,
        1,
        MAX_EVENT_WINDOW_DAYS,
      ),
    ),
    freeOnly: parameters.get('freeOnly') === 'true',
    limit: Math.round(numberParameter(parameters.get('limit'), 50, 1, 100)),
  };

  const database = databaseBinding();
  const liveOverlay = await loadLiveCatalogOverlay(options);
  if (!database) {
    return Response.json(await loadCatalogFromSnapshot(options, undefined, liveOverlay), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    return Response.json(await loadCatalogFromD1(database, options, liveOverlay), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return Response.json(
      await loadCatalogFromSnapshot(
        options,
        'D1 暫時無法查詢，已改用最近一次官方資料快照。',
        liveOverlay,
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function GET(request: Request) {
  return search(new URL(request.url).searchParams);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json(
      { error: 'INVALID_BODY', message: 'Request body must be an object.' },
      { status: 400 },
    );
  }

  const parameters = new URLSearchParams();
  const values = body as Record<string, unknown>;
  for (const key of [
    'category',
    'lat',
    'lng',
    'radiusM',
    'at',
    'eventWindowDays',
    'freeOnly',
    'limit',
  ]) {
    const value = values[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parameters.set(key, String(value));
    }
  }
  return search(parameters);
}
