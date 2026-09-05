export const catalogCategories = [
  {
    key: 'FOOD',
    label: '食品',
    shortLabel: '食品',
    placeKinds: ['RESTAURANT'],
  },
  {
    key: 'DAILY_GOODS',
    label: '日用品',
    shortLabel: '日用品',
    placeKinds: ['STORE'],
  },
  {
    key: 'FREE_RESOURCE',
    label: '免費／公益資源',
    shortLabel: '免費／公益',
    placeKinds: ['PUBLIC_RESOURCE'],
  },
  {
    key: 'EVENT',
    label: '活動',
    shortLabel: '活動',
    placeKinds: ['VENUE'],
  },
  {
    key: 'TRANSPORT',
    label: '交通',
    shortLabel: '交通',
    placeKinds: ['TRANSIT'],
  },
] as const;

export type CatalogCategoryKey = (typeof catalogCategories)[number]['key'];
export type CatalogCategoryLabel = (typeof catalogCategories)[number]['label'];
export type CatalogPlaceKind =
  (typeof catalogCategories)[number]['placeKinds'][number];

export const categoryLabels = catalogCategories.map(
  (category) => category.label,
) as CatalogCategoryLabel[];

export const placeKindToCategory = Object.fromEntries(
  catalogCategories.flatMap((category) =>
    category.placeKinds.map((kind) => [kind, category.key]),
  ),
) as Record<CatalogPlaceKind, CatalogCategoryKey>;

export const opportunityCategoryToCategory: Record<
  string,
  CatalogCategoryKey
> = {
  EVENT: 'EVENT',
  CULTURE: 'EVENT',
  PUBLIC_RESOURCE: 'FREE_RESOURCE',
  FREE_RESOURCE: 'FREE_RESOURCE',
  TRANSPORT: 'TRANSPORT',
  FOOD: 'FOOD',
};

export type CatalogCategorySummary = {
  key: CatalogCategoryKey;
  label: CatalogCategoryLabel;
  count: number;
};

export type CatalogSummaryResponse = {
  source: 'd1' | 'unconfigured' | 'error';
  categories: CatalogCategorySummary[];
  syncedAt: string | null;
};
