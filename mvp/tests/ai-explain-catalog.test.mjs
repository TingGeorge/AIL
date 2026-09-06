import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogOptionsForExplain,
  parsePublicResultsExplainRequest,
  rebuildTrustedExplainRequest,
} from '../lib/ai-explain-catalog.ts';
import { validateResultsExplainModelOutput } from '../lib/ai-contract.ts';

const publicBody = {
  locale: 'zh-TW',
  candidateIds: ['PLACE:one'],
  search: {
    category: 'ALL',
    origin: { latitude: 25.07133, longitude: 121.52024 },
    radiusM: 2_000,
    at: '2026-09-06T12:00:00+08:00',
    eventWindowDays: 7,
    freeOnly: false,
    hardExclusions: ['堅果'],
    softPreferences: ['安靜'],
  },
};

function catalogItem(overrides = {}) {
  return {
    id: 'PLACE:one',
    subjectType: 'PLACE',
    categoryKey: 'FOOD',
    categoryLabel: '食品',
    kind: 'RESTAURANT',
    title: '可信候選',
    provider: '官方資料',
    address: '臺北市',
    latitude: 25.07,
    longitude: 121.52,
    distanceM: 650,
    cost: { state: 'KNOWN', amountTwd: 120, reason: '官方價格資料' },
    availability: {
      state: 'UPCOMING',
      startsAt: '2026-09-06T10:00:00.000Z',
      endsAt: '2026-09-06T12:00:00.000Z',
      text: '即將開放',
    },
    verification: {
      status: 'VERIFIED',
      label: '官方確認',
      fields: ['identity', 'location', 'schedule', 'cost'],
    },
    condition: '資訊已由官方來源確認',
    source: {
      title: '官方資料集',
      publisher: '政府機關',
      url: 'https://example.gov.tw/data',
      verifiedAt: '2026-09-06T00:00:00.000Z',
    },
    evidenceQuote: '公開資料內容',
    actionUrl: null,
    tags: ['安靜', '可外帶'],
    realtime: null,
    ...overrides,
  };
}

test('accepts only the fixed public ID and search contract', () => {
  const parsed = parsePublicResultsExplainRequest(publicBody);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.candidateIds, ['PLACE:one']);

  assert.equal(
    parsePublicResultsExplainRequest({
      locale: 'zh-TW',
      items: [{ id: 'PLACE:one', costTwd: 0 }],
      search: publicBody.search,
    }).ok,
    false,
  );
  assert.equal(
    parsePublicResultsExplainRequest({ ...publicBody, extra: true }).ok,
    false,
  );
  assert.equal(
    parsePublicResultsExplainRequest({
      ...publicBody,
      candidateIds: ['PLACE:one', 'PLACE:one'],
    }).ok,
    false,
  );
});

test('validates search bounds, RFC3339 time, and nested extra fields', () => {
  assert.equal(
    parsePublicResultsExplainRequest({
      ...publicBody,
      search: { ...publicBody.search, radiusM: 499 },
    }).ok,
    false,
  );
  assert.equal(
    parsePublicResultsExplainRequest({
      ...publicBody,
      search: { ...publicBody.search, at: '2026-09-06 12:00' },
    }).ok,
    false,
  );
  assert.equal(
    parsePublicResultsExplainRequest({
      ...publicBody,
      search: {
        ...publicBody.search,
        origin: { ...publicBody.search.origin, accuracy: 10 },
      },
    }).ok,
    false,
  );
});

test('creates catalog options with server time and a fixed limit of 100', () => {
  const request = parsePublicResultsExplainRequest(publicBody).value;
  const serverNow = new Date('2026-09-06T05:00:00.000Z');
  const options = catalogOptionsForExplain(request, serverNow);
  assert.equal(options.serverNow, serverNow);
  assert.equal(options.limit, 100);
  assert.equal(options.radiusM, 2_000);
  assert.equal(options.at.toISOString(), '2026-09-06T04:00:00.000Z');
});

test('rebuilds trusted facts in requested order without forwarding GPS', () => {
  const body = {
    ...publicBody,
    candidateIds: ['PLACE:two', 'PLACE:one'],
  };
  const request = parsePublicResultsExplainRequest(body).value;
  const first = catalogItem();
  const second = catalogItem({
    id: 'PLACE:two',
    title: '第二候選',
    cost: { state: 'FREE', amountTwd: 0, reason: '官方標示免費' },
    distanceM: 300,
  });
  const rebuilt = rebuildTrustedExplainRequest(request, [first, second]);
  assert.equal(rebuilt.ok, true);
  assert.deepEqual(
    rebuilt.value.items.map((item) => item.id),
    ['PLACE:two', 'PLACE:one'],
  );
  assert.equal(rebuilt.value.items[0].costTwd, 0);
  assert.deepEqual(rebuilt.value.items[0].preferenceMatches, ['安靜']);
  assert.deepEqual(rebuilt.value.items[0].verification.fields, [
    'identity',
    'location',
    'schedule',
    'cost',
  ]);
  assert.equal(JSON.stringify(rebuilt.value).includes('latitude'), false);
  assert.equal(JSON.stringify(rebuilt.value).includes('longitude'), false);
});

test('only forwards a schedule when both timestamps are source-verified RFC3339 values', () => {
  const request = parsePublicResultsExplainRequest(publicBody).value;
  const verified = rebuildTrustedExplainRequest(request, [catalogItem()]);
  assert.match(verified.value.items[0].schedule, /2026-09-06T10:00/);

  const unverified = rebuildTrustedExplainRequest(request, [
    catalogItem({
      verification: {
        status: 'PARTIAL',
        label: '官方來源',
        fields: ['identity', 'location'],
      },
    }),
  ]);
  assert.equal(unverified.value.items[0].schedule, null);

  const placeholder = rebuildTrustedExplainRequest(request, [
    catalogItem({
      availability: {
        state: 'UNKNOWN',
        startsAt: '待確認',
        endsAt: '待確認',
        text: '時段待確認',
      },
    }),
  ]);
  assert.equal(placeholder.value.items[0].schedule, null);
  assert.equal(
    validateResultsExplainModelOutput(
      {
        items: [{ id: 'PLACE:one', reasonCodes: ['SCHEDULE_KNOWN'] }],
      },
      placeholder.value,
    ),
    null,
  );
});

test('rejects missing, duplicated, excluded, out-of-radius, and mode-mismatched candidates', () => {
  const request = parsePublicResultsExplainRequest(publicBody).value;
  assert.equal(rebuildTrustedExplainRequest(request, []).ok, false);
  assert.equal(
    rebuildTrustedExplainRequest(request, [catalogItem(), catalogItem()]).ok,
    false,
  );
  assert.equal(
    rebuildTrustedExplainRequest(request, [
      catalogItem({ tags: ['堅果', '安靜'] }),
    ]).ok,
    false,
  );
  assert.equal(
    rebuildTrustedExplainRequest(request, [catalogItem({ distanceM: 2_001 })])
      .ok,
    false,
  );

  const freeOnlyRequest = parsePublicResultsExplainRequest({
    ...publicBody,
    search: { ...publicBody.search, freeOnly: true },
  }).value;
  assert.equal(
    rebuildTrustedExplainRequest(freeOnlyRequest, [catalogItem()]).ok,
    false,
  );
});
