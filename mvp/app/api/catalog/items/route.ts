import { env } from 'cloudflare:workers';
import {
  CatalogItemIdsError,
  parseCatalogItemIds,
  selectCatalogItemsByIds,
} from '@/lib/catalog-item-lookup';
import {
  loadCatalogFromD1,
  loadCatalogFromSnapshot,
  YUANSHAN_COVERAGE,
  type D1DatabaseLike,
} from '@/lib/catalog-server';
import type { CatalogItemsResponse } from '@/lib/catalog-contract';

export const dynamic = 'force-dynamic';

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

function responseFor(
  payload: Awaited<ReturnType<typeof loadCatalogFromSnapshot>>,
  ids: string[],
) {
  const selected = selectCatalogItemsByIds(payload.items, ids);
  return {
    source: payload.source,
    fallback: payload.fallback,
    syncedAt: payload.syncedAt,
    items: selected.items,
    missingIds: selected.missingIds,
    warnings: payload.warnings,
  } satisfies CatalogItemsResponse;
}

export async function GET(request: Request) {
  let ids: string[];
  try {
    ids = parseCatalogItemIds(new URL(request.url).searchParams.get('ids'));
  } catch (error) {
    if (error instanceof CatalogItemIdsError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: 400 },
      );
    }
    throw error;
  }

  if (ids.length === 0) {
    return Response.json(
      {
        source: databaseBinding() ? 'd1' : 'snapshot',
        fallback: !databaseBinding(),
        syncedAt: null,
        items: [],
        missingIds: [],
        warnings: [],
      } satisfies CatalogItemsResponse,
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const now = new Date();
  const options = {
    category: 'ALL' as const,
    origin: YUANSHAN_COVERAGE.center,
    radiusM: YUANSHAN_COVERAGE.radiusM,
    at: now,
    serverNow: now,
    eventWindowDays: 30,
    freeOnly: false,
    // The lookup filters by exact id after normalization, so it must not use
    // the search endpoint's per-category result cap.
    limit: 10_000,
  };
  const database = databaseBinding();

  if (!database) {
    const payload = await loadCatalogFromSnapshot(options);
    return Response.json(responseFor(payload, ids), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    const payload = await loadCatalogFromD1(database, options);
    return Response.json(responseFor(payload, ids), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    const payload = await loadCatalogFromSnapshot(
      options,
      'D1 暫時無法查詢，已改用最近一次官方資料快照。',
    );
    return Response.json(responseFor(payload, ids), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
