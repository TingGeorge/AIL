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

export const DEFAULT_EVENT_WINDOW_DAYS = 7;
export const MAX_EVENT_WINDOW_DAYS = 30;

export type CatalogCategoryKey = (typeof catalogCategories)[number]['key'];
export type CatalogCategoryLabel = (typeof catalogCategories)[number]['label'];

export const categoryLabels = catalogCategories.map(
  (category) => category.label,
) as CatalogCategoryLabel[];

export type CatalogCategorySummary = {
  key: CatalogCategoryKey;
  label: CatalogCategoryLabel;
  count: number;
  verifiedCount: number;
  sources: Array<{
    title: string;
    publisher: string;
    url: string | null;
  }>;
};

export type CatalogDataSource =
  | 'd1'
  | 'snapshot'
  | 'unconfigured'
  | 'error';

export type CatalogSummaryResponse = {
  source: CatalogDataSource;
  categories: CatalogCategorySummary[];
  syncedAt: string | null;
  eventWindow: CatalogEventWindow;
};

export type CatalogEventWindow = {
  startsAt: string;
  endsAt: string;
  days: number;
};

export type CatalogCost =
  | {
      state: 'FREE';
      amountTwd: 0;
      reason: string;
    }
  | {
      state: 'KNOWN';
      amountTwd: number;
      reason: string;
    }
  | {
      state: 'UNKNOWN';
      amountTwd: null;
      reason: string;
    };

export type CatalogAvailability = {
  state: 'CURRENT' | 'UPCOMING' | 'UNKNOWN';
  startsAt: string | null;
  endsAt: string | null;
  text: string;
};

export type CatalogVerifiedField =
  | 'identity'
  | 'location'
  | 'schedule'
  | 'cost'
  | 'realtimeAvailability';

export type CatalogVerification = {
  status: 'VERIFIED' | 'PARTIAL';
  label: string;
  fields: CatalogVerifiedField[];
};

export type CatalogItem = {
  id: string;
  subjectType: 'PLACE' | 'OPPORTUNITY';
  categoryKey: CatalogCategoryKey;
  categoryLabel: CatalogCategoryLabel;
  kind: string;
  title: string;
  provider: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceM: number | null;
  cost: CatalogCost;
  availability: CatalogAvailability;
  verification: CatalogVerification;
  condition: string;
  source: {
    title: string;
    publisher: string;
    url: string | null;
    verifiedAt: string | null;
  };
  evidenceQuote: string;
  actionUrl: string | null;
  tags: string[];
  realtime: {
    availableRentBikes: number | null;
    availableReturnBikes: number | null;
    observedAt: string | null;
    validUntil: string | null;
    fresh: boolean;
    appliesToSelectedTime: boolean;
  } | null;
};

export type CatalogSearchResponse = {
  source: CatalogDataSource;
  fallback: boolean;
  syncedAt: string | null;
  eventWindow: CatalogEventWindow;
  coverage: {
    center: { latitude: number; longitude: number };
    radiusM: number;
  };
  items: CatalogItem[];
  facets: CatalogCategorySummary[];
  warnings: string[];
};

export type CatalogItemsResponse = Pick<
  CatalogSearchResponse,
  'source' | 'fallback' | 'syncedAt' | 'items' | 'warnings'
> & {
  missingIds: string[];
};
