import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createResultsExplainFallback,
  createResultsExplainSuccess,
  createSearchParseFallback,
  parseResultsExplainRequest,
  parseSearchParseRequest,
  resultsExplainOutputJsonSchema,
  searchParseOutputJsonSchema,
  validateResultsExplainModelOutput,
  validateSearchParseModelOutput,
} from '../lib/ai-contract.ts';

const validParseBody = {
  query: '今晚兩個人想在圓山附近吃便宜一點，不要堅果，最好安靜',
  locale: 'zh-TW',
  timezone: 'Asia/Taipei',
  defaults: {
    date: '2026-09-06',
    time: '19:00',
    category: 'FOOD',
    budgetTwd: null,
    partySize: 2,
    maxDistanceM: 2_000,
    hardExclusions: ['堅果'],
    softPreferences: ['安靜'],
    mobility: ['WALK'],
  },
};

const validModelOutput = {
  constraints: {
    query: 'model copy',
    date: '2026-09-06',
    time: '19:00',
    category: 'FOOD',
    budgetTwd: null,
    partySize: 2,
    maxDistanceM: 2_000,
    hardExclusions: ['堅果'],
    softPreferences: ['安靜'],
    mobility: ['WALK'],
  },
  assumptions: ['今晚依 Asia/Taipei 解析'],
  missingFields: ['budgetTwd'],
  confidence: 0.9,
};

const candidate = {
  id: 'candidate-1',
  category: 'FOOD',
  title: '候選餐點',
  costTwd: 100,
  distanceM: 600,
  schedule: '18:00–21:00',
  hardConstraintsPassed: true,
  tags: ['安靜'],
  verification: {
    status: 'VERIFIED',
    label: '官方確認',
    fields: ['identity', 'location', 'schedule', 'cost'],
  },
  preferenceMatches: ['安靜'],
  cpDimensions: {
    price: 80,
    food: 75,
    quality: null,
    convenience: 65,
    discount: null,
  },
  cautions: ['價格仍需到店前確認'],
};

test('normalizes valid parse input and rejects GPS, stale categories, and UI range mismatches', () => {
  const parsed = parseSearchParseRequest(validParseBody);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.defaults.partySize, 2);

  assert.equal(
    parseSearchParseRequest({ ...validParseBody, latitude: 25.07 }).ok,
    false,
  );
  assert.equal(
    parseSearchParseRequest({
      ...validParseBody,
      defaults: { ...validParseBody.defaults, category: 'DINING' },
    }).ok,
    false,
  );
  assert.equal(
    parseSearchParseRequest({
      ...validParseBody,
      defaults: { ...validParseBody.defaults, partySize: 11 },
    }).ok,
    false,
  );
  assert.equal(
    parseSearchParseRequest({
      ...validParseBody,
      defaults: { ...validParseBody.defaults, maxDistanceM: 2_001 },
    }).ok,
    false,
  );
});

test('allows omitted defaults and produces a manual fallback with the original request', () => {
  const parsed = parseSearchParseRequest({ query: '找附近活動' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.timezone, 'Asia/Taipei');
  assert.deepEqual(parsed.value.defaults.mobility, []);

  const fallback = createSearchParseFallback(parsed.value);
  assert.equal(fallback.ok, false);
  assert.equal(fallback.constraints.query, '找附近活動');
  assert.equal(fallback.error.code, 'AI_UNAVAILABLE');
  assert.deepEqual(fallback.missingFields, [
    'date',
    'time',
    'category',
    'budgetTwd',
    'partySize',
    'maxDistanceM',
  ]);
});

test('validates structured parse output, restores original query, and rejects shape drift', () => {
  const request = parseSearchParseRequest(validParseBody).value;
  const output = validateSearchParseModelOutput(validModelOutput, request);
  assert.equal(output.constraints.query, validParseBody.query);

  assert.equal(
    validateSearchParseModelOutput(
      { ...validModelOutput, extra: 'not allowed' },
      request,
    ),
    null,
  );
  assert.equal(
    validateSearchParseModelOutput(
      { ...validModelOutput, missingFields: [] },
      request,
    ),
    null,
  );

  const cannotDowngradeExclusion = validateSearchParseModelOutput(
    {
      ...validModelOutput,
      constraints: {
        ...validModelOutput.constraints,
        hardExclusions: [],
        softPreferences: ['安靜', '堅果'],
      },
    },
    request,
  );
  assert.deepEqual(cannotDowngradeExclusion.constraints.hardExclusions, [
    '堅果',
  ]);
  assert.deepEqual(cannotDowngradeExclusion.constraints.softPreferences, [
    '安靜',
  ]);
});

test('all object schemas are strict and require every declared property', () => {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(
        [...node.required].sort((left, right) => left.localeCompare(right)),
        Object.keys(node.properties).sort((left, right) =>
          left.localeCompare(right),
        ),
      );
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(searchParseOutputJsonSchema);
  visit(resultsExplainOutputJsonSchema);
});

test('explain input accepts only eligible candidates with complete bounded facts', () => {
  const parsed = parseResultsExplainRequest({ items: [candidate] });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.locale, 'zh-TW');

  assert.equal(
    parseResultsExplainRequest({
      items: [{ ...candidate, hardConstraintsPassed: false }],
    }).ok,
    false,
  );
  assert.equal(
    parseResultsExplainRequest({
      items: [{ ...candidate, distanceM: 2_001 }],
    }).ok,
    false,
  );
});

test('explain model can only select reason codes grounded in the matching input item', () => {
  const request = parseResultsExplainRequest({ items: [candidate] }).value;
  const selected = validateResultsExplainModelOutput(
    {
      items: [
        {
          id: candidate.id,
          reasonCodes: ['KNOWN_COST', 'SHORT_DISTANCE', 'PREFERENCE_MATCH'],
        },
      ],
    },
    request,
  );
  assert.ok(selected);

  assert.equal(
    validateResultsExplainModelOutput(
      { items: [{ id: candidate.id, reasonCodes: ['FREE_COST'] }] },
      request,
    ),
    null,
  );
  assert.equal(
    validateResultsExplainModelOutput(
      { items: [{ id: 'different-id', reasonCodes: ['KNOWN_COST'] }] },
      request,
    ),
    null,
  );
});

test('server materializes explanation text and fallback without changing candidate order', () => {
  const second = { ...candidate, id: 'candidate-2', costTwd: 0 };
  const request = parseResultsExplainRequest({
    items: [candidate, second],
  }).value;
  const success = createResultsExplainSuccess(request, {
    items: [
      { id: candidate.id, reasonCodes: ['KNOWN_COST', 'SHORT_DISTANCE'] },
      { id: second.id, reasonCodes: ['FREE_COST'] },
    ],
  });
  assert.equal(success.ok, true);
  assert.deepEqual(
    success.items.map((item) => item.id),
    [candidate.id, second.id],
  );
  assert.match(success.items[0].reasons[0], /NT\$100/);
  assert.equal(success.items[1].reasons[0], '已知費用為免費');

  const fallback = createResultsExplainFallback(request);
  assert.equal(fallback.ok, false);
  assert.deepEqual(
    fallback.items.map((item) => item.id),
    [candidate.id, second.id],
  );
});
