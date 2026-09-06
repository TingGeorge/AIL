import { env } from 'cloudflare:workers';
import {
  DEFAULT_EVENT_WINDOW_DAYS,
  type CatalogSummaryResponse,
} from '@/lib/catalog-contract';
import {
  loadCatalogFromD1,
  loadCatalogFromSnapshot,
  YUANSHAN_COVERAGE,
  type D1DatabaseLike,
} from '@/lib/catalog-server';
import { loadLiveCatalogOverlay } from '@/lib/catalog-live-refresh.mjs';

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

export async function GET() {
  const serverNow = new Date();
  const options = {
    category: 'ALL' as const,
    origin: YUANSHAN_COVERAGE.center,
    radiusM: YUANSHAN_COVERAGE.radiusM,
    at: serverNow,
    serverNow,
    eventWindowDays: DEFAULT_EVENT_WINDOW_DAYS,
    freeOnly: false,
    limit: 1,
  };
  const database = databaseBinding();
  const liveOverlay = await loadLiveCatalogOverlay(options);
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

  return Response.json(
    {
      source: catalog.source,
      categories: catalog.facets,
      syncedAt: catalog.syncedAt,
      eventWindow: catalog.eventWindow,
    } satisfies CatalogSummaryResponse,
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
