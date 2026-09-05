import { env } from 'cloudflare:workers';
import {
  catalogCategories,
  opportunityCategoryToCategory,
  placeKindToCategory,
  type CatalogCategoryKey,
  type CatalogSummaryResponse,
} from '@/lib/catalog-contract';

export const dynamic = 'force-dynamic';

type CountRow = { kind: string; count: number };
type OpportunityCountRow = { category: string; count: number };
type D1Like = {
  prepare: (query: string) => {
    all: <T>() => Promise<{ results?: T[] }>;
  };
};

const findDatabase = () =>
  Object.values(env as unknown as Record<string, unknown>).find(
    (binding): binding is D1Like =>
      Boolean(
        binding &&
          typeof binding === 'object' &&
          'prepare' in binding &&
          typeof (binding as D1Like).prepare === 'function',
      ),
  );

const emptyCategories = () =>
  catalogCategories.map((category) => ({
    key: category.key,
    label: category.label,
    count: 0,
  }));

export async function GET() {
  const database = findDatabase();
  if (!database) {
    return Response.json(
      {
        source: 'unconfigured',
        categories: emptyCategories(),
        syncedAt: null,
      } satisfies CatalogSummaryResponse,
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const [placeResult, opportunityResult] = await Promise.all([
      database
        .prepare(
          `SELECT kind, COUNT(*) AS count
           FROM places
           WHERE status <> 'PERM_CLOSED'
           GROUP BY kind`,
        )
        .all<CountRow>(),
      database
        .prepare(
          `SELECT category, COUNT(*) AS count
           FROM opportunities
           WHERE verification_status NOT IN ('REJECTED', 'EXPIRED')
           GROUP BY category`,
        )
        .all<OpportunityCountRow>(),
    ]);

    const counts = Object.fromEntries(
      catalogCategories.map((category) => [category.key, 0]),
    ) as Record<CatalogCategoryKey, number>;

    for (const row of placeResult.results ?? []) {
      const key = placeKindToCategory[row.kind as keyof typeof placeKindToCategory];
      if (key) counts[key] += Number(row.count) || 0;
    }
    for (const row of opportunityResult.results ?? []) {
      const key = opportunityCategoryToCategory[row.category];
      if (key) counts[key] += Number(row.count) || 0;
    }

    return Response.json(
      {
        source: 'd1',
        categories: catalogCategories.map((category) => ({
          key: category.key,
          label: category.label,
          count: counts[category.key],
        })),
        syncedAt: new Date().toISOString(),
      } satisfies CatalogSummaryResponse,
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        source: 'error',
        categories: emptyCategories(),
        syncedAt: null,
      } satisfies CatalogSummaryResponse,
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
