import {
  assessCultureTicket,
  cultureTaipeiDateTime,
} from './culture-nearby.mjs';
import { evaluateRealtimeFreshness } from './realtime-freshness.mjs';

export const LIVE_REFRESH_POLICY = Object.freeze({
  timeoutMs: 4_000,
  youBikeCacheMs: 60_000,
  cultureCacheMs: 10 * 60_000,
});

const YOU_BIKE_URL =
  'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json';
const CULTURE_NEARBY_URL =
  'https://cloud.culture.tw/frontsite/opendata/activityOpenDataJsonAction.do?method=doFindActivitiesNearBy&lat=25.07133&lon=121.52024&range=2';
const memoryCache = new Map();

const clean = (value) => String(value ?? '').trim();

function numberOrNull(value) {
  if (value === null || value === undefined || clean(value) === '') return null;
  const parsed = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumberOrNull(value) {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function distanceM(origin, latitude, longitude) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(latitude - origin.latitude);
  const deltaLongitude = radians(longitude - origin.longitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function safeHttpUrl(...values) {
  for (const value of values) {
    const candidate = clean(value);
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.toString();
      }
    } catch {
      // Ignore malformed upstream links while retaining the catalog row.
    }
  }
  return null;
}

function youBikeName(value) {
  return clean(value).replace(/^YouBike2\.0_/, '');
}

function coordinateKey(value) {
  const coordinate = numberOrNull(value);
  return coordinate === null ? '' : coordinate.toFixed(6);
}

function youBikeMatchKey(item) {
  return [
    'YOUBIKE',
    youBikeName(item.title),
    coordinateKey(item.latitude),
    coordinateKey(item.longitude),
  ].join('|');
}

function cultureMatchKey(item) {
  return [
    'MOC',
    clean(item.title),
    clean(item.availability?.startsAt),
    clean(item.availability?.endsAt),
    coordinateKey(item.latitude),
    coordinateKey(item.longitude),
  ].join('|');
}

function isYouBikeItem(item) {
  return (
    item.subjectType === 'PLACE' &&
    (item.tags?.includes('YouBike 站點') ||
      clean(item.source?.title).includes('YouBike'))
  );
}

function isCultureNearbyItem(item) {
  return (
    item.subjectType === 'OPPORTUNITY' &&
    item.source?.publisher === '文化部' &&
    (item.source?.title === '經緯度查詢附近未過期活動' ||
      clean(item.source?.url).includes('data.gov.tw/dataset/10044'))
  );
}

function stripInternalFields(item, preservedId) {
  const { _liveKey: ignored, ...catalogItem } = item;
  void ignored;
  return preservedId ? { ...catalogItem, id: preservedId } : catalogItem;
}

function replaceSourceItems(baseItems, liveItems, predicate, keyForBase) {
  const existingIds = new Map(
    baseItems
      .filter(predicate)
      .map((item) => [keyForBase(item), item.id]),
  );
  const retained = baseItems.filter((item) => !predicate(item));
  return [
    ...retained,
    ...liveItems.map((item) =>
      stripInternalFields(item, existingIds.get(item._liveKey)),
    ),
  ];
}

export function mergeLiveCatalogItems(baseItems, overlay = {}) {
  let merged = [...baseItems];
  if (Array.isArray(overlay.youBike)) {
    merged = replaceSourceItems(
      merged,
      overlay.youBike,
      isYouBikeItem,
      youBikeMatchKey,
    );
  }
  if (Array.isArray(overlay.cultureNearby)) {
    merged = replaceSourceItems(
      merged,
      overlay.cultureNearby,
      isCultureNearbyItem,
      cultureMatchKey,
    );
  }
  return merged;
}

export function normalizeYouBikeLiveRows(rows, options, fetchedAt) {
  const now = options.serverNow;
  const unique = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (String(row.act) === '0') continue;
    const externalId = clean(row.sno);
    const title = youBikeName(row.sna);
    const latitude = numberOrNull(row.latitude ?? row.lat);
    const longitude = numberOrNull(row.longitude ?? row.lng);
    if (!externalId || !title || latitude === null || longitude === null) {
      continue;
    }
    const itemDistanceM = distanceM(options.origin, latitude, longitude);
    if (itemDistanceM > options.radiusM) continue;

    const observedCandidate = cultureTaipeiDateTime(
      row.infoTime ?? row.mday ?? row.srcUpdateTime,
    );
    const observedAt =
      typeof observedCandidate === 'string' &&
      Number.isFinite(Date.parse(observedCandidate))
        ? observedCandidate
        : null;
    const validUntil = observedAt
      ? new Date(Date.parse(observedAt) + 5 * 60_000).toISOString()
      : null;
    const freshness = evaluateRealtimeFreshness({
      observedAt,
      validUntil,
      serverNow: now,
      selectedAt: options.at,
    });
    const availableRentBikes = nonNegativeNumberOrNull(
      row.available_rent_bikes ?? row.sbi,
    );
    const availableReturnBikes = nonNegativeNumberOrNull(
      row.available_return_bikes ?? row.bemp,
    );
    const verifiedFields = ['identity', 'location'];
    if (freshness.fresh && freshness.appliesToSelectedTime) {
      verifiedFields.push('realtimeAvailability');
    }

    const item = {
      id: `PLACE:YOUBIKE:${encodeURIComponent(externalId)}`,
      subjectType: 'PLACE',
      categoryKey: 'TRANSPORT',
      categoryLabel: '交通',
      kind: 'TRANSIT',
      title,
      provider: 'YouBike 站點',
      address: clean(row.ar) || null,
      latitude,
      longitude,
      distanceM: itemDistanceM,
      cost: {
        state: 'UNKNOWN',
        amountTwd: null,
        reason: '官方來源未提供可驗證的即時費率。',
      },
      verification: {
        status: 'VERIFIED',
        label: '地點已驗證',
        fields: verifiedFields,
      },
      availability: {
        state: 'UNKNOWN',
        startsAt: null,
        endsAt: null,
        text: '站點服務狀態以官方即時資料為準',
      },
      condition:
        freshness.fresh && freshness.appliesToSelectedTime
          ? '官方 YouBike 站點與有效期內即時車位；費率及車況以官方服務為準。'
          : freshness.fresh
            ? '官方 YouBike 站點；即時車位只代表查詢當下，不預測所選時段。'
            : '官方 YouBike 站點；即時車位資料已過期，費率及車況請至官方服務確認。',
      source: {
        title: 'YouBike 臺北市公共自行車即時資訊',
        publisher: '臺北市政府交通局',
        url: 'https://data.taipei/dataset/detail?id=c6bc8aed-557d-41d5-bfb1-8da24f78f2fb',
        verifiedAt: fetchedAt,
      },
      evidenceQuote: `${title}：可借 ${availableRentBikes ?? '未知'}、可還 ${availableReturnBikes ?? '未知'}；${observedAt ? `觀測 ${observedAt}` : '來源未提供可解析的觀測時間'}`,
      actionUrl:
        'https://www.youbike.com.tw/region/taipei/stations/?lang=zh_TW',
      tags: ['YouBike 站點'],
      realtime: {
        availableRentBikes,
        availableReturnBikes,
        observedAt,
        validUntil,
        fresh: freshness.fresh,
        appliesToSelectedTime: freshness.appliesToSelectedTime,
      },
    };
    item._liveKey = youBikeMatchKey(item);
    unique.set(item._liveKey, item);
  }

  return [...unique.values()];
}

export function normalizeCultureNearbyLiveRows(rows, options) {
  const windowEnd =
    options.at.getTime() + options.eventWindowDays * 24 * 60 * 60_000;
  const unique = new Map();

  for (const event of Array.isArray(rows) ? rows : []) {
    const eventId = clean(event.UID);
    const title = clean(event.title);
    if (!eventId || !title || !Array.isArray(event.showInfo)) continue;

    for (const [index, show] of event.showInfo.entries()) {
      const latitude = numberOrNull(show.latitude);
      const longitude = numberOrNull(show.longitude);
      const startsAt = cultureTaipeiDateTime(show.time);
      const endsAt = cultureTaipeiDateTime(show.endTime);
      const startsAtMs =
        typeof startsAt === 'string' ? Date.parse(startsAt) : Number.NaN;
      const endsAtMs =
        typeof endsAt === 'string' ? Date.parse(endsAt) : Number.NaN;
      if (
        latitude === null ||
        longitude === null ||
        !Number.isFinite(startsAtMs) ||
        !Number.isFinite(endsAtMs) ||
        endsAtMs < startsAtMs ||
        endsAtMs - startsAtMs > 370 * 24 * 60 * 60_000 ||
        endsAtMs <= options.at.getTime() ||
        startsAtMs >= windowEnd
      ) {
        continue;
      }
      const itemDistanceM = distanceM(options.origin, latitude, longitude);
      if (itemDistanceM > options.radiusM) continue;

      const ticket = assessCultureTicket({
        onSales: show.onSales,
        price: show.price,
      });
      if (ticket.verificationStatus === 'CONFLICTED') continue;
      const locationName =
        clean(show.locationName) || clean(show.location) || '文化活動場地';
      const actionUrl = safeHttpUrl(event.sourceWebPromote, event.webSales);
      const item = {
        id: `OPPORTUNITY:MOC:${encodeURIComponent(eventId)}:${index}`,
        subjectType: 'OPPORTUNITY',
        categoryKey: 'EVENT',
        categoryLabel: '活動',
        kind: 'EVENT',
        title,
        provider: locationName,
        address: clean(show.location) || null,
        latitude,
        longitude,
        distanceM: itemDistanceM,
        cost:
          ticket.directCostTwd === 0
            ? {
                state: 'FREE',
                amountTwd: 0,
                reason: '文化部平台票價原文明示免費；現場其他消費另計。',
              }
            : {
                state: 'UNKNOWN',
                amountTwd: null,
                reason: '文化部平台未提供可驗證票價。',
              },
        verification: {
          status: 'PARTIAL',
          label: '官方來源',
          fields: [],
        },
        availability: {
          state: startsAtMs <= options.at.getTime() ? 'CURRENT' : 'UPCOMING',
          startsAt,
          endsAt,
          text: `${startsAtMs <= options.at.getTime() ? '進行中' : '即將舉行'}｜${startsAt} ～ ${endsAt}`,
        },
        condition:
          '文化部官方平台來源；活動內容、場次與票價尚未由本服務交叉驗證，請查看來源頁。',
        source: {
          title: '經緯度查詢附近未過期活動',
          publisher: '文化部',
          url: 'https://data.gov.tw/dataset/10044',
          verifiedAt: null,
        },
        evidenceQuote: `${title}｜${startsAt}–${endsAt}｜${locationName}｜${ticket.priceText || '票價未提供'}`,
        actionUrl,
        tags: ['文化部開放資料'],
        realtime: null,
      };
      item._liveKey = cultureMatchKey(item);
      unique.set(item._liveKey, item);
    }
  }

  return [...unique.values()];
}

async function fetchJsonCached(
  key,
  url,
  ttlMs,
  validate,
  { fetchImpl, nowMs, timeoutMs },
) {
  const existing = memoryCache.get(key);
  if (existing?.data && existing.freshUntil > nowMs) {
    return { data: existing.data, fetchedAt: existing.fetchedAt };
  }
  if (existing?.promise) return existing.promise;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const pending = (async () => {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    validate(data);
    const fetchedAt = new Date(nowMs).toISOString();
    memoryCache.set(key, {
      data,
      fetchedAt,
      freshUntil: nowMs + ttlMs,
    });
    return { data, fetchedAt };
  })();
  memoryCache.set(key, { ...existing, promise: pending });

  try {
    return await pending;
  } catch (error) {
    if (existing?.data) memoryCache.set(key, existing);
    else memoryCache.delete(key);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadLiveCatalogOverlay(options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const nowMs = dependencies.nowMs ?? options.serverNow.getTime();
  const timeoutMs = dependencies.timeoutMs ?? LIVE_REFRESH_POLICY.timeoutMs;
  const overlay = { warnings: [] };
  const tasks = [];

  if (options.category === 'ALL' || options.category === 'TRANSPORT') {
    tasks.push(
      fetchJsonCached(
        'youbike',
        YOU_BIKE_URL,
        LIVE_REFRESH_POLICY.youBikeCacheMs,
        (data) => {
          if (!Array.isArray(data) || data.length < 1_000) {
            throw new Error('unexpected station payload');
          }
        },
        { fetchImpl, nowMs, timeoutMs },
      )
        .then(({ data, fetchedAt }) => {
          overlay.youBike = normalizeYouBikeLiveRows(data, options, fetchedAt);
        })
        .catch((error) => {
          overlay.warnings.push(
            `YouBike 即時刷新失敗，保留資料庫快照（${error.message}）。`,
          );
        }),
    );
  }

  if (options.category === 'ALL' || options.category === 'EVENT') {
    tasks.push(
      fetchJsonCached(
        'culture-nearby',
        CULTURE_NEARBY_URL,
        LIVE_REFRESH_POLICY.cultureCacheMs,
        (data) => {
          if (!Array.isArray(data) || data.length === 0) {
            throw new Error('unexpected activity payload');
          }
        },
        { fetchImpl, nowMs, timeoutMs },
      )
        .then(({ data }) => {
          overlay.cultureNearby = normalizeCultureNearbyLiveRows(data, options);
        })
        .catch((error) => {
          overlay.warnings.push(
            `文化部活動刷新失敗，保留資料庫快照（${error.message}）。`,
          );
        }),
    );
  }

  await Promise.all(tasks);
  return overlay;
}

export function clearLiveCatalogCacheForTests() {
  memoryCache.clear();
}
