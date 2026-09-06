import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appHashForRoute,
  appViewNames,
  parseAppHash,
} from '../lib/app-navigation.mjs';

test('every app view has a stable hash route', () => {
  for (const view of appViewNames.filter((candidate) => candidate !== 'detail')) {
    assert.deepEqual(parseAppHash(appHashForRoute(view)), {
      view,
      selectedId: null,
    });
  }
});

test('detail routes preserve safe candidate ids', () => {
  const hash = appHashForRoute('detail', 'opportunity:food_123');
  assert.equal(hash, '#/detail/opportunity%3Afood_123');
  assert.deepEqual(parseAppHash(hash), {
    view: 'detail',
    selectedId: 'opportunity:food_123',
  });
});

test('unknown, malformed and unsafe routes are rejected', () => {
  assert.equal(parseAppHash('#/missing'), null);
  assert.equal(parseAppHash('#/detail'), null);
  assert.equal(parseAppHash('#/detail/%E0%A4%A'), null);
  assert.equal(parseAppHash('#/detail/<script>'), null);
  assert.equal(appHashForRoute('detail'), '#/results');
});
