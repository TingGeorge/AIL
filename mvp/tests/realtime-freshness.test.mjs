import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateRealtimeFreshness,
  REALTIME_CLOCK_SKEW_MS,
} from '../lib/realtime-freshness.mjs';

const serverNow = new Date('2026-09-05T13:00:00.000Z');

test('uses server time instead of a historical selected time', () => {
  const result = evaluateRealtimeFreshness({
    observedAt: '2026-09-05T12:00:00.000Z',
    validUntil: '2026-09-05T12:05:00.000Z',
    serverNow,
    selectedAt: new Date('2026-09-05T12:01:00.000Z'),
  });

  assert.deepEqual(result, { fresh: false, appliesToSelectedTime: false });
});

test('accepts a fresh observation for a near-now selection', () => {
  const result = evaluateRealtimeFreshness({
    observedAt: '2026-09-05T12:59:00.000Z',
    validUntil: '2026-09-05T13:04:00.000Z',
    serverNow,
    selectedAt: new Date('2026-09-05T13:01:00.000Z'),
  });

  assert.deepEqual(result, { fresh: true, appliesToSelectedTime: true });
});

test('does not apply current availability to a future plan', () => {
  const result = evaluateRealtimeFreshness({
    observedAt: '2026-09-05T12:59:00.000Z',
    validUntil: '2026-09-05T13:04:00.000Z',
    serverNow,
    selectedAt: new Date('2026-09-05T18:00:00.000Z'),
  });

  assert.deepEqual(result, { fresh: true, appliesToSelectedTime: false });
});

test('rejects invalid observation timestamps', () => {
  const result = evaluateRealtimeFreshness({
    observedAt: 'not-a-time',
    validUntil: '2026-09-05T13:04:00.000Z',
    serverNow,
    selectedAt: serverNow,
  });

  assert.deepEqual(result, { fresh: false, appliesToSelectedTime: false });
});

test('rejects observations more than two minutes in the future', () => {
  const result = evaluateRealtimeFreshness({
    observedAt: new Date(
      serverNow.getTime() + REALTIME_CLOCK_SKEW_MS + 1,
    ).toISOString(),
    validUntil: '2026-09-05T13:10:00.000Z',
    serverNow,
    selectedAt: serverNow,
  });

  assert.deepEqual(result, { fresh: false, appliesToSelectedTime: false });
});

test('rejects a validity window that ends before the observation', () => {
  const result = evaluateRealtimeFreshness({
    observedAt: '2026-09-05T12:59:00.000Z',
    validUntil: '2026-09-05T12:58:59.000Z',
    serverNow,
    selectedAt: serverNow,
  });

  assert.deepEqual(result, { fresh: false, appliesToSelectedTime: false });
});
