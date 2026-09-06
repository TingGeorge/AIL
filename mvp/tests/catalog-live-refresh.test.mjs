import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearLiveCatalogCacheForTests,
  loadLiveCatalogOverlay,
  mergeLiveCatalogItems,
  normalizeCultureNearbyLiveRows,
  normalizeYouBikeLiveRows,
} from '../lib/catalog-live-refresh.mjs';

const serverNow = new Date('2026-09-05T15:00:00.000Z');
const options = {
  category: 'ALL',
  origin: { latitude: 25.07133, longitude: 121.52024 },
  radiusM: 2_000,
  at: serverNow,
  serverNow,
  eventWindowDays: 7,
  freeOnly: false,
  limit: 50,
};

const youBikeRow = {
  sno: '500101001',
  sna: 'YouBike2.0_捷運圓山站（1號出口）',
  ar: '酒泉街／捷運圓山站 1 號出口',
  latitude: 25.07133,
  longitude: 121.52024,
  act: 1,
  infoTime: '2026-09-05 23:00:00',
  available_rent_bikes: 7,
  available_return_bikes: 12,
};

test('marks current YouBike values fresh only with a valid upstream observation time', () => {
  const [item] = normalizeYouBikeLiveRows(
    [youBikeRow],
    options,
    serverNow.toISOString(),
  );

  assert.equal(item.realtime.fresh, true);
  assert.equal(item.realtime.appliesToSelectedTime, true);
  assert.equal(item.realtime.availableRentBikes, 7);
  assert.deepEqual(item.verification.fields, [
    'identity',
    'location',
    'realtimeAvailability',
  ]);

  const [withoutObservation] = normalizeYouBikeLiveRows(
    [{ ...youBikeRow, infoTime: '' }],
    options,
    serverNow.toISOString(),
  );
  assert.equal(withoutObservation.realtime.observedAt, null);
  assert.equal(withoutObservation.realtime.fresh, false);
  assert.deepEqual(withoutObservation.verification.fields, [
    'identity',
    'location',
  ]);
});

test('splits Culture showInfo and never infers free admission from onSales=N', () => {
  const rows = [
    {
      UID: 'culture-1',
      title: '圓山文化活動',
      sourceWebPromote: 'https://example.gov.tw/culture-1',
      showInfo: [
        {
          time: '2026/09/06 10:00:00',
          endTime: '2026/09/06 12:00:00',
          locationName: '圓山文化場地',
          location: '臺北市中山區',
          latitude: '25.07133',
          longitude: '121.52024',
          onSales: 'N',
          price: '',
        },
        {
          time: '2026/09/07 10:00:00',
          endTime: '2026/09/07 12:00:00',
          locationName: '圓山文化場地',
          location: '臺北市中山區',
          latitude: '25.07133',
          longitude: '121.52024',
          onSales: 'N',
          price: '免費入場',
        },
      ],
    },
  ];

  const items = normalizeCultureNearbyLiveRows(rows, options);
  assert.equal(items.length, 2);
  assert.equal(items[0].cost.state, 'UNKNOWN');
  assert.equal(items[0].cost.amountTwd, null);
  assert.equal(items[1].cost.state, 'FREE');
  assert.equal(items[1].cost.amountTwd, 0);
  for (const item of items) {
    assert.equal(item.verification.status, 'PARTIAL');
    assert.equal(item.verification.label, '官方來源');
    assert.deepEqual(item.verification.fields, []);
    assert.equal(item.source.verifiedAt, null);
  }
});

test('live replacement preserves stable IDs and failed sources preserve snapshots', () => {
  const [live] = normalizeYouBikeLiveRows(
    [youBikeRow],
    options,
    serverNow.toISOString(),
  );
  const { _liveKey, ...base } = live;
  assert.ok(_liveKey);
  base.id = 'PLACE:stable-youbike-id';
  base.realtime = { ...base.realtime, availableRentBikes: 1 };

  const replaced = mergeLiveCatalogItems([base], { youBike: [live] });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].id, 'PLACE:stable-youbike-id');
  assert.equal(replaced[0].realtime.availableRentBikes, 7);
  assert.equal('_liveKey' in replaced[0], false);

  const fallback = mergeLiveCatalogItems([base], {
    warnings: ['upstream failed'],
  });
  assert.deepEqual(fallback, [base]);
});

test('Culture replacement recognizes the D1 canonical source URL', () => {
  const [live] = normalizeCultureNearbyLiveRows(
    [
      {
        UID: 'culture-d1-match',
        title: '可穩定合併的文化活動',
        showInfo: [
          {
            time: '2026/09/06 14:00:00',
            endTime: '2026/09/06 16:00:00',
            locationName: '圓山文化場地',
            location: '臺北市中山區',
            latitude: '25.07133',
            longitude: '121.52024',
            onSales: 'N',
            price: '',
          },
        ],
      },
    ],
    options,
  );
  const { _liveKey, ...base } = live;
  assert.ok(_liveKey);
  base.id = 'OPPORTUNITY:stable-culture-id';
  base.source = {
    ...base.source,
    title: '官方活動資訊',
    url: 'https://data.gov.tw/dataset/10044',
  };

  const replaced = mergeLiveCatalogItems([base], {
    cultureNearby: [live],
  });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].id, 'OPPORTUNITY:stable-culture-id');
  assert.equal(replaced[0].source.verifiedAt, null);
  assert.equal(replaced[0].verification.label, '官方來源');
});

test('upstream failures return warnings without an empty replacement array', async () => {
  clearLiveCatalogCacheForTests();
  const overlay = await loadLiveCatalogOverlay(options, {
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
    nowMs: serverNow.getTime(),
    timeoutMs: 50,
  });

  assert.equal(overlay.youBike, undefined);
  assert.equal(overlay.cultureNearby, undefined);
  assert.equal(overlay.warnings.length, 2);
  assert.match(overlay.warnings[0], /保留資料庫快照/);
  assert.match(overlay.warnings[1], /保留資料庫快照/);
});

test('an empty Culture payload preserves the D1 activity snapshot', async () => {
  clearLiveCatalogCacheForTests();
  const overlay = await loadLiveCatalogOverlay(
    { ...options, category: 'EVENT' },
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [],
      }),
      nowMs: serverNow.getTime(),
    },
  );

  assert.equal(overlay.cultureNearby, undefined);
  assert.equal(overlay.warnings.length, 1);
  assert.match(overlay.warnings[0], /文化部活動刷新失敗/);
  assert.match(overlay.warnings[0], /保留資料庫快照/);

  const base = [{ id: 'OPPORTUNITY:d1-activity' }];
  assert.deepEqual(mergeLiveCatalogItems(base, overlay), base);
});

test('unrelated categories do not call live feeds', async () => {
  clearLiveCatalogCacheForTests();
  let calls = 0;
  const overlay = await loadLiveCatalogOverlay(
    { ...options, category: 'FOOD' },
    {
      fetchImpl: async () => {
        calls += 1;
        throw new Error('should not be called');
      },
      nowMs: serverNow.getTime(),
    },
  );

  assert.equal(calls, 0);
  assert.deepEqual(overlay, { warnings: [] });
});

test('caches validated YouBike payloads and falls back after an expired refresh fails', async () => {
  clearLiveCatalogCacheForTests();
  let calls = 0;
  let shouldFail = false;
  const rows = Array.from({ length: 1_000 }, (_, index) => ({
    ...youBikeRow,
    sno: `cache-${index}`,
    sna: `YouBike2.0_快取測試站 ${index}`,
  }));
  const fetchImpl = async () => {
    calls += 1;
    if (shouldFail) throw new Error('refresh failed');
    return {
      ok: true,
      status: 200,
      json: async () => rows,
    };
  };
  const transportOptions = { ...options, category: 'TRANSPORT' };

  const first = await loadLiveCatalogOverlay(transportOptions, {
    fetchImpl,
    nowMs: serverNow.getTime(),
  });
  shouldFail = true;
  const cached = await loadLiveCatalogOverlay(transportOptions, {
    fetchImpl,
    nowMs: serverNow.getTime() + 30_000,
  });
  const expired = await loadLiveCatalogOverlay(transportOptions, {
    fetchImpl,
    nowMs: serverNow.getTime() + 61_000,
  });

  assert.equal(first.youBike.length, 1_000);
  assert.equal(cached.youBike.length, 1_000);
  assert.equal(calls, 2);
  assert.equal(expired.youBike, undefined);
  assert.equal(expired.warnings.length, 1);
});
