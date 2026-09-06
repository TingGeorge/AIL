import {
  catalogCategories,
  type CatalogCategoryKey,
  type CatalogDataSource,
  type CatalogItem,
  type CatalogSearchResponse,
  type CatalogVerifiedField,
} from '@/lib/catalog-contract';
import { evaluateRealtimeFreshness } from '@/lib/realtime-freshness.mjs';
import { opportunityVerificationPresentation } from '@/lib/verification-copy.mjs';
import { mergeLiveCatalogItems } from '@/lib/catalog-live-refresh.mjs';

export const YUANSHAN_COVERAGE = {
  center: { latitude: 25.07133, longitude: 121.52024 },
  radiusM: 2_000,
} as const;

export type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  all: <T>() => Promise<{ results?: T[] }>;
};

export type D1DatabaseLike = {
  prepare: (query: string) => D1StatementLike;
};

export type CatalogSearchOptions = {
  category: CatalogCategoryKey | 'ALL';
  origin: { latitude: number; longitude: number };
  radiusM: number;
  at: Date;
  serverNow: Date;
  eventWindowDays: number;
  freeOnly: boolean;
  limit: number;
};

export type LiveCatalogOverlay = {
  youBike?: CatalogItem[];
  cultureNearby?: CatalogItem[];
  warnings?: string[];
};

function eventWindowEnd(options: CatalogSearchOptions) {
  return new Date(
    options.at.getTime() + options.eventWindowDays * 24 * 60 * 60 * 1_000,
  );
}

type PlaceRow = {
  id: string;
  kind: string;
  name: string;
  address_text: string | null;
  lat_e6: number | null;
  lng_e6: number | null;
  provider: string | null;
  canonical_url: string | null;
  last_checked_at: string | null;
  evidence_quote: string | null;
  realtime_json: string | null;
  realtime_valid_until: string | null;
};

type OpportunityRow = {
  id: string;
  name: string;
  category: string;
  starts_at: string;
  ends_at: string;
  direct_cost_twd: number | null;
  verification_status: string;
  action_url: string | null;
  last_verified_at: string | null;
  place_id: string | null;
  place_name: string | null;
  address_text: string | null;
  lat_e6: number | null;
  lng_e6: number | null;
  publisher_name: string | null;
  canonical_url: string | null;
};

type SnapshotPlace = {
  id: string;
  kind: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  provider?: string | null;
  sourceTitle?: string | null;
  publisher?: string | null;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
  attributes?: Record<string, unknown> | null;
  evidenceQuote?: string | null;
};

type SnapshotOpportunity = {
  id: string;
  name: string;
  category: string;
  placeId: string | null;
  startsAt: string;
  endsAt: string;
  directCostTwd: number | null;
  verificationStatus: string;
  actionUrl: string | null;
  sourceId?: string | null;
  sourceTitle?: string | null;
  publisher?: string | null;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
};

type Snapshot = {
  meta: { completedAt?: string | null };
  places: SnapshotPlace[];
  opportunities: SnapshotOpportunity[];
};

let snapshotPromise: Promise<Snapshot> | null = null;

function loadSnapshotData() {
  snapshotPromise ??= import('@/data/yuanshan-open-data.snapshot.json').then(
    (module) => module.default as unknown as Snapshot,
  );
  return snapshotPromise;
}

const providerDetails: Record<
  string,
  { title: string; publisher: string; kindLabel: string }
> = {
  TAIPEI_RESTAURANT_REGISTRY: {
    title: '設址臺北市所營事業含餐館業清冊',
    publisher: '臺北市商業處',
    kindLabel: '官方餐飲登記',
  },
  TAIPEI_MARKET: {
    title: '臺北市公有市場清冊',
    publisher: '臺北市市場處',
    kindLabel: '市場／民生採買點',
  },
  TAIPEI_PHARMACY: {
    title: '臺北市藥局',
    publisher: '臺北市政府衛生局',
    kindLabel: '藥局／民生補給',
  },
  TAIPEI_FREE_WIFI: {
    title: '臺北公眾區免費無線上網熱點',
    publisher: '臺北市政府資訊局',
    kindLabel: '免費 Wi-Fi',
  },
  TAIPEI_DRINKING_WATER: {
    title: '臺北市飲水臺資料',
    publisher: '臺北自來水事業處',
    kindLabel: '飲水臺',
  },
  TAIPEI_COOLING_SPOT: {
    title: '臺北市涼適點',
    publisher: '臺北市政府',
    kindLabel: '涼適點',
  },
  TAIPEI_YOUBIKE: {
    title: 'YouBike 臺北市公共自行車即時資訊',
    publisher: '臺北市政府交通局',
    kindLabel: 'YouBike 站點',
  },
};

function categoryForPlace(
  kind: string,
  provider: string | null | undefined,
): CatalogCategoryKey | null {
  if (kind === 'RESTAURANT') return 'FOOD';
  if (kind === 'STORE' && provider === 'TAIPEI_PHARMACY')
    return 'DAILY_GOODS';
  if (kind === 'PUBLIC_RESOURCE') return 'FREE_RESOURCE';
  if (kind === 'TRANSIT') return 'TRANSPORT';
  return null;
}

function categoryForOpportunity(category: string): CatalogCategoryKey | null {
  if (category === 'EVENT' || category === 'CULTURE') return 'EVENT';
  if (category === 'PUBLIC_RESOURCE' || category === 'FREE_RESOURCE')
    return 'FREE_RESOURCE';
  if (category === 'TRANSPORT') return 'TRANSPORT';
  if (category === 'FOOD') return 'FOOD';
  return null;
}

function labelForCategory(key: CatalogCategoryKey) {
  return catalogCategories.find((category) => category.key === key)?.label ?? '活動';
}

function distanceM(
  origin: { latitude: number; longitude: number },
  latitude: number | null,
  longitude: number | null,
) {
  if (latitude === null || longitude === null) return null;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(latitude - origin.latitude);
  const deltaLongitude = radians(longitude - origin.longitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function safeJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function placeCost(provider: string | null) {
  if (provider === 'TAIPEI_FREE_WIFI') {
    return {
      state: 'FREE' as const,
      amountTwd: 0 as const,
      reason: '官方資料名稱明確標示為免費無線上網服務；其他現場消費另計。',
    };
  }
  return {
    state: 'UNKNOWN' as const,
    amountTwd: null,
    reason: '官方來源未提供可驗證的品項價格或即時費率。',
  };
}

function placeCondition(
  category: CatalogCategoryKey,
  realtimeFresh: boolean,
  realtimeAppliesToSelectedTime: boolean,
) {
  if (category === 'FOOD')
    return '官方餐飲登記地點；菜單、價格與即時營業狀態待店家確認。';
  if (category === 'DAILY_GOODS')
    return '官方藥局資料；商品、庫存、價格與營業狀態待藥局確認。';
  if (category === 'TRANSPORT')
    return realtimeFresh && realtimeAppliesToSelectedTime
      ? '官方 YouBike 站點與有效期內即時車位；費率及車況以官方服務為準。'
      : realtimeFresh
        ? '官方 YouBike 站點；即時車位只代表查詢當下，不預測所選時段。'
      : '官方 YouBike 站點；即時車位資料已過期，費率及車況請至官方服務確認。';
  return '官方公共資源地點；開放時段與現場使用條件請由來源頁確認。';
}

function buildPlaceItem(
  row: {
    id: string;
    kind: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    provider: string | null;
    sourceTitle: string | null;
    publisher: string | null;
    sourceUrl: string | null;
    verifiedAt: string | null;
    evidenceQuote: string | null;
    realtimeJson?: string | null;
    realtimeValidUntil?: string | null;
  },
  options: CatalogSearchOptions,
): CatalogItem | null {
  const categoryKey = categoryForPlace(row.kind, row.provider);
  if (!categoryKey) return null;
  const calculatedDistance = distanceM(
    options.origin,
    row.latitude,
    row.longitude,
  );
  if (calculatedDistance === null || calculatedDistance > options.radiusM)
    return null;

  const realtimeValue = safeJson(row.realtimeJson ?? null);
  const realtimeValidUntil = row.realtimeValidUntil ?? null;
  const realtimeObservedAt =
    typeof realtimeValue?.observedAt === 'string'
      ? realtimeValue.observedAt
      : null;
  const realtimeFreshness = realtimeValue
    ? evaluateRealtimeFreshness({
        observedAt: realtimeObservedAt,
        validUntil: realtimeValidUntil,
        serverNow: options.serverNow,
        selectedAt: options.at,
      })
    : { fresh: false, appliesToSelectedTime: false };
  const realtimeFresh = realtimeFreshness.fresh;
  const provider = row.provider ? providerDetails[row.provider] : null;
  const cost = placeCost(row.provider);
  const identityVerified = Boolean(
    row.evidenceQuote && row.sourceUrl && row.verifiedAt,
  );
  const verifiedFields: CatalogVerifiedField[] = identityVerified
    ? ['identity', 'location']
    : [];
  if (cost.state !== 'UNKNOWN') verifiedFields.push('cost');
  if (realtimeFresh && realtimeFreshness.appliesToSelectedTime)
    verifiedFields.push('realtimeAvailability');
  const realtime = realtimeValue
    ? {
        availableRentBikes:
          typeof realtimeValue.availableRentBikes === 'number'
            ? realtimeValue.availableRentBikes
            : null,
        availableReturnBikes:
          typeof realtimeValue.availableReturnBikes === 'number'
            ? realtimeValue.availableReturnBikes
            : null,
        observedAt: realtimeObservedAt,
        validUntil: realtimeValidUntil,
        fresh: realtimeFresh,
        appliesToSelectedTime: realtimeFreshness.appliesToSelectedTime,
      }
    : null;

  return {
    id: `PLACE:${row.id}`,
    subjectType: 'PLACE',
    categoryKey,
    categoryLabel: labelForCategory(categoryKey),
    kind: row.kind,
    title: row.name,
    provider: provider?.kindLabel ?? row.publisher ?? '官方開放資料',
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceM: calculatedDistance,
    cost,
    verification: {
      status: identityVerified ? 'VERIFIED' : 'PARTIAL',
      label: identityVerified ? '地點已驗證' : '官方來源',
      fields: verifiedFields,
    },
    availability: {
      state: 'UNKNOWN',
      startsAt: null,
      endsAt: null,
      text: '營業／開放時段待確認',
    },
    condition: placeCondition(
      categoryKey,
      realtimeFresh,
      realtimeFreshness.appliesToSelectedTime,
    ),
    source: {
      title: row.sourceTitle ?? provider?.title ?? '官方開放資料',
      publisher: row.publisher ?? provider?.publisher ?? '臺北市政府',
      url: row.sourceUrl,
      verifiedAt: row.verifiedAt,
    },
    evidenceQuote:
      row.evidenceQuote ??
      [row.name, row.address].filter(Boolean).join(' — '),
    actionUrl: row.sourceUrl,
    tags: provider ? [provider.kindLabel] : [],
    realtime,
  } satisfies CatalogItem;
}

function buildOpportunityItem(
  row: {
    id: string;
    name: string;
    category: string;
    startsAt: string;
    endsAt: string;
    directCostTwd: number | null;
    verificationStatus: string;
    actionUrl: string | null;
    placeName: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    sourceTitle: string | null;
    publisher: string | null;
    sourceUrl: string | null;
    verifiedAt: string | null;
  },
  options: CatalogSearchOptions,
): CatalogItem | null {
  const categoryKey = categoryForOpportunity(row.category);
  if (!categoryKey) return null;
  const endTime = Date.parse(row.endsAt);
  if (!Number.isFinite(endTime) || endTime <= options.at.getTime()) return null;
  const windowEnd = eventWindowEnd(options).getTime();
  const startTime = Date.parse(row.startsAt);
  if (!Number.isFinite(startTime) || startTime >= windowEnd) return null;
  const calculatedDistance = distanceM(
    options.origin,
    row.latitude,
    row.longitude,
  );
  if (calculatedDistance === null || calculatedDistance > options.radiusM)
    return null;
  const isCurrent = startTime <= options.at.getTime();
  const verificationPresentation = opportunityVerificationPresentation(
    row.verificationStatus,
  );
  const sourceVerified = Boolean(
    verificationPresentation.verified &&
      row.verifiedAt &&
      (row.sourceUrl || row.actionUrl),
  );
  const verifiedFields: CatalogVerifiedField[] = sourceVerified
    ? ['identity', 'location', 'schedule']
    : [];
  const cost =
    row.directCostTwd === 0
      ? {
          state: 'FREE' as const,
          amountTwd: 0 as const,
          reason: '官方來源明確記錄直接費用為 0 元；現場選購另計。',
        }
      : typeof row.directCostTwd === 'number'
        ? {
            state: 'KNOWN' as const,
            amountTwd: row.directCostTwd,
            reason: '依官方來源記錄的直接費用。',
          }
        : {
            state: 'UNKNOWN' as const,
            amountTwd: null,
            reason: '官方來源未提供可驗證費用。',
          };
  if (sourceVerified && cost.state !== 'UNKNOWN') verifiedFields.push('cost');

  return {
    id: `OPPORTUNITY:${row.id}`,
    subjectType: 'OPPORTUNITY',
    categoryKey,
    categoryLabel: labelForCategory(categoryKey),
    kind: row.category,
    title: row.name,
    provider: row.placeName ?? row.publisher ?? '官方活動',
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceM: calculatedDistance,
    cost,
    verification: {
      status: sourceVerified ? 'VERIFIED' : 'PARTIAL',
      label: sourceVerified
        ? verificationPresentation.label
        : verificationPresentation.verified
          ? '來源資料不完整'
          : verificationPresentation.label,
      fields: verifiedFields,
    },
    availability: {
      state: isCurrent ? 'CURRENT' : 'UPCOMING',
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      text: `${isCurrent ? '進行中' : '即將舉行'}｜${row.startsAt} ～ ${row.endsAt}`,
    },
    condition: verificationPresentation.condition,
    source: {
      title: row.sourceTitle ?? '官方活動資訊',
      publisher: row.publisher ?? '官方活動單位',
      url: row.sourceUrl ?? row.actionUrl,
      verifiedAt: row.verifiedAt,
    },
    evidenceQuote: `${row.name}；活動期間 ${row.startsAt} ～ ${row.endsAt}。`,
    actionUrl: row.actionUrl ?? row.sourceUrl,
    tags: verificationPresentation.tags,
    realtime: null,
  } satisfies CatalogItem;
}

function finishResponse(
  source: CatalogDataSource,
  syncedAt: string | null,
  candidates: CatalogItem[],
  options: CatalogSearchOptions,
  warnings: string[],
): CatalogSearchResponse {
  const withinMode = options.freeOnly
    ? candidates.filter((item) => item.cost.state === 'FREE')
    : candidates;
  const facets = catalogCategories.map((category) => {
    const categoryItems = withinMode.filter(
      (item) => item.categoryKey === category.key,
    );
    const sources = new Map<
      string,
      { title: string; publisher: string; url: string | null }
    >();
    for (const item of categoryItems) {
      const sourceKey =
        item.source.url?.trim() ||
        `${item.source.publisher.trim()}\u0000${item.source.title.trim()}`;
      if (!sources.has(sourceKey)) {
        sources.set(sourceKey, {
          title: item.source.title,
          publisher: item.source.publisher,
          url: item.source.url,
        });
      }
    }
    return {
      key: category.key,
      label: category.label,
      count: categoryItems.length,
      verifiedCount: categoryItems.filter(
        (item) => item.verification.status === 'VERIFIED',
      ).length,
      sources: [...sources.values()].sort((left, right) =>
        left.title.localeCompare(right.title, 'zh-TW'),
      ),
    };
  });
  const selected =
    options.category === 'ALL'
      ? withinMode
      : withinMode.filter((item) => item.categoryKey === options.category);
  selected.sort((left, right) => {
    const availabilityOrder = { CURRENT: 0, UPCOMING: 1, UNKNOWN: 2 } as const;
    const availabilityDelta =
      availabilityOrder[left.availability.state] -
      availabilityOrder[right.availability.state];
    if (availabilityDelta !== 0) return availabilityDelta;
    return (left.distanceM ?? Number.MAX_SAFE_INTEGER) -
      (right.distanceM ?? Number.MAX_SAFE_INTEGER);
  });

  const items =
    options.category === 'ALL'
      ? catalogCategories
          .flatMap((category) =>
            selected
              .filter((item) => item.categoryKey === category.key)
              .slice(0, Math.max(1, Math.ceil(options.limit / 5))),
          )
          .slice(0, options.limit)
      : selected.slice(0, options.limit);

  return {
    source,
    fallback: source !== 'd1',
    syncedAt,
    eventWindow: {
      startsAt: options.at.toISOString(),
      endsAt: eventWindowEnd(options).toISOString(),
      days: options.eventWindowDays,
    },
    coverage: YUANSHAN_COVERAGE,
    items,
    facets,
    warnings,
  };
}

export async function loadCatalogFromD1(
  database: D1DatabaseLike,
  options: CatalogSearchOptions,
  liveOverlay: LiveCatalogOverlay = {},
) {
  const realtimeSql = `
    WITH latest_run AS (
      SELECT id
      FROM import_runs
      WHERE status = 'COMPLETED'
      ORDER BY completed_at DESC
      LIMIT 1
    ), latest_realtime AS (
      SELECT subject_id, claimed_value_json, valid_until,
             ROW_NUMBER() OVER (
               PARTITION BY subject_id
               ORDER BY verified_at DESC, id DESC
             ) AS row_number
      FROM evidence_assertions
      WHERE subject_type = 'PLACE'
        AND field_key = 'realtime_availability'
        AND verification_status IN (
          'CORROBORATED', 'PROVIDER_CONFIRMED', 'OFFICIAL_CONFIRMED'
        )
    ), latest_identity AS (
      SELECT subject_id, evidence_quote,
             ROW_NUMBER() OVER (
               PARTITION BY subject_id
               ORDER BY verified_at DESC, id DESC
             ) AS row_number
      FROM evidence_assertions
      WHERE subject_type = 'PLACE'
        AND field_key = 'identity'
        AND verification_status IN (
          'CORROBORATED', 'PROVIDER_CONFIRMED', 'OFFICIAL_CONFIRMED'
        )
    )
    SELECT p.id, p.kind, p.name, p.address_text, p.lat_e6, p.lng_e6,
           x.provider, x.canonical_url, x.last_checked_at,
           identity.evidence_quote,
           realtime.claimed_value_json AS realtime_json,
           realtime.valid_until AS realtime_valid_until
    FROM places p
    LEFT JOIN external_place_refs x ON x.place_id = p.id
    LEFT JOIN latest_identity identity
      ON identity.subject_id = p.id AND identity.row_number = 1
    LEFT JOIN latest_realtime realtime
      ON realtime.subject_id = p.id AND realtime.row_number = 1
    WHERE p.status <> 'PERM_CLOSED'
      AND p.lat_e6 IS NOT NULL
      AND p.lng_e6 IS NOT NULL
      AND p.kind IN ('RESTAURANT', 'STORE', 'PUBLIC_RESOURCE', 'TRANSIT')
      AND (p.kind <> 'STORE' OR x.provider = 'TAIPEI_PHARMACY')
      AND EXISTS (
        SELECT 1
        FROM import_items imported
        WHERE imported.run_id = (SELECT id FROM latest_run)
          AND imported.subject_type = 'PLACE'
          AND imported.subject_id = p.id
          AND imported.status = 'IMPORTED'
      )`;
  const opportunitySql = `
    WITH latest_run AS (
      SELECT id
      FROM import_runs
      WHERE status = 'COMPLETED'
      ORDER BY completed_at DESC
      LIMIT 1
    )
    SELECT o.id, o.name, o.category, o.starts_at, o.ends_at,
           o.direct_cost_twd, o.verification_status, o.action_url,
           o.last_verified_at, o.place_id, p.name AS place_name,
           p.address_text, p.lat_e6, p.lng_e6,
           s.publisher_name, s.canonical_url
    FROM opportunities o
    LEFT JOIN places p ON p.id = o.place_id
    LEFT JOIN sources s ON s.id = o.source_id
    WHERE (
      o.verification_status IN (
        'CORROBORATED', 'PROVIDER_CONFIRMED', 'OFFICIAL_CONFIRMED'
      )
      OR (
        o.source_id = 'src_moc_nearby_activities'
        AND o.verification_status = 'UNVERIFIED'
      )
    )
      AND unixepoch(o.ends_at) > unixepoch(?)
      AND unixepoch(o.starts_at) < unixepoch(?)
      AND EXISTS (
        SELECT 1
        FROM import_items imported
        WHERE imported.run_id = (SELECT id FROM latest_run)
          AND imported.subject_type = 'OPPORTUNITY'
          AND imported.subject_id = o.id
          AND imported.status = 'IMPORTED'
      )`;
  const syncSql = `
    SELECT completed_at
    FROM import_runs
    WHERE status = 'COMPLETED'
    ORDER BY completed_at DESC
    LIMIT 1`;

  const [placeResult, opportunityResult, syncResult] = await Promise.all([
    database.prepare(realtimeSql).all<PlaceRow>(),
    database
      .prepare(opportunitySql)
      .bind(options.at.toISOString(), eventWindowEnd(options).toISOString())
      .all<OpportunityRow>(),
    database.prepare(syncSql).all<{ completed_at: string | null }>(),
  ]);

  const placeItems = (placeResult.results ?? [])
    .map((row) =>
      buildPlaceItem(
        {
          id: row.id,
          kind: row.kind,
          name: row.name,
          address: row.address_text,
          latitude: row.lat_e6 === null ? null : row.lat_e6 / 1_000_000,
          longitude: row.lng_e6 === null ? null : row.lng_e6 / 1_000_000,
          provider: row.provider,
          sourceTitle: null,
          publisher: row.provider
            ? (providerDetails[row.provider]?.publisher ?? null)
            : null,
          sourceUrl: row.canonical_url,
          verifiedAt: row.last_checked_at,
          evidenceQuote: row.evidence_quote,
          realtimeJson: row.realtime_json,
          realtimeValidUntil: row.realtime_valid_until,
        },
        options,
      ),
    )
    .filter((item): item is CatalogItem => item !== null);
  const opportunityItems = (opportunityResult.results ?? [])
    .map((row) =>
      buildOpportunityItem(
        {
          id: row.id,
          name: row.name,
          category: row.category,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          directCostTwd: row.direct_cost_twd,
          verificationStatus: row.verification_status,
          actionUrl: row.action_url,
          placeName: row.place_name,
          address: row.address_text,
          latitude: row.lat_e6 === null ? null : row.lat_e6 / 1_000_000,
          longitude: row.lng_e6 === null ? null : row.lng_e6 / 1_000_000,
          sourceTitle: null,
          publisher: row.publisher_name,
          sourceUrl: row.canonical_url,
          verifiedAt: row.last_verified_at,
        },
        options,
      ),
    )
    .filter((item): item is CatalogItem => item !== null);

  const syncedAt = syncResult.results?.[0]?.completed_at ?? null;
  if (!syncedAt) {
    throw new Error('CATALOG_D1_HAS_NO_COMPLETED_IMPORT');
  }

  return finishResponse(
    'd1',
    syncedAt,
    mergeLiveCatalogItems([...placeItems, ...opportunityItems], liveOverlay),
    options,
    liveOverlay.warnings ?? [],
  );
}

export async function loadCatalogFromSnapshot(
  options: CatalogSearchOptions,
  warning = '目前使用最近一次官方資料快照；即時資訊可能已過期。',
  liveOverlay: LiveCatalogOverlay = {},
) {
  const snapshot = await loadSnapshotData();
  const placesById = new Map(snapshot.places.map((place) => [place.id, place]));
  const placeItems = snapshot.places
    .map((place) =>
      buildPlaceItem(
        {
          id: place.id,
          kind: place.kind,
          name: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
          provider: place.provider ?? null,
          sourceTitle: place.sourceTitle ?? null,
          publisher: place.publisher ?? null,
          sourceUrl: place.sourceUrl ?? null,
          verifiedAt: place.verifiedAt ?? null,
          evidenceQuote: place.evidenceQuote ?? null,
        },
        options,
      ),
    )
    .filter((item): item is CatalogItem => item !== null);
  const opportunityItems = snapshot.opportunities
    .filter(
      (opportunity) =>
        [
          'CORROBORATED',
          'PROVIDER_CONFIRMED',
          'OFFICIAL_CONFIRMED',
        ].includes(opportunity.verificationStatus) ||
        (opportunity.sourceId === 'src_moc_nearby_activities' &&
          opportunity.verificationStatus === 'UNVERIFIED'),
    )
    .map((opportunity) => {
      const place = opportunity.placeId
        ? placesById.get(opportunity.placeId)
        : null;
      return buildOpportunityItem(
        {
          id: opportunity.id,
          name: opportunity.name,
          category: opportunity.category,
          startsAt: opportunity.startsAt,
          endsAt: opportunity.endsAt,
          directCostTwd: opportunity.directCostTwd,
          verificationStatus: opportunity.verificationStatus,
          actionUrl: opportunity.actionUrl,
          placeName: place?.name ?? null,
          address: place?.address ?? null,
          latitude: place?.latitude ?? null,
          longitude: place?.longitude ?? null,
          sourceTitle: opportunity.sourceTitle ?? null,
          publisher: opportunity.publisher ?? null,
          sourceUrl: opportunity.sourceUrl ?? null,
          verifiedAt: opportunity.verifiedAt ?? null,
        },
        options,
      );
    })
    .filter((item): item is CatalogItem => item !== null);

  return finishResponse(
    'snapshot',
    snapshot.meta.completedAt ?? null,
    mergeLiveCatalogItems([...placeItems, ...opportunityItems], liveOverlay),
    options,
    [warning, ...(liveOverlay.warnings ?? [])],
  );
}
