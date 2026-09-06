import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_RATE_LIMIT_MAX_REQUESTS,
  AI_RATE_LIMIT_SESSION_HEADER,
  AI_RATE_LIMIT_WINDOW_MS,
  consumeAiRateLimit,
  createAiRateLimitBucketKey,
  pruneExpiredAiRateLimitWindows,
} from '../lib/ai-rate-limit.ts';

class MemoryStatement {
  constructor(database, query, values = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values) {
    return new MemoryStatement(this.database, this.query, values);
  }

  async first() {
    assert.match(this.query, /ON CONFLICT\(bucket_key\)/);
    assert.match(this.query, /RETURNING window_started_at/);
    const [bucketKey, windowStartedAt, expiresAt, limit] = this.values;
    this.database.boundBucketKeys.push(bucketKey);
    const current = this.database.rows.get(bucketKey);

    if (
      current?.window_started_at === windowStartedAt &&
      current.request_count >= limit
    ) {
      return null;
    }

    const next = {
      window_started_at: windowStartedAt,
      request_count:
        current?.window_started_at === windowStartedAt
          ? current.request_count + 1
          : 1,
      expires_at: expiresAt,
    };
    this.database.rows.set(bucketKey, next);
    return { ...next };
  }

  async run() {
    assert.match(this.query, /DELETE FROM ai_rate_limit_windows/);
    const [nowMs] = this.values;
    for (const [key, row] of this.database.rows) {
      if (row.expires_at <= nowMs) this.database.rows.delete(key);
    }
    return { success: true };
  }
}

class MemoryDatabase {
  rows = new Map();
  boundBucketKeys = [];

  prepare(query) {
    return new MemoryStatement(this, query);
  }
}

const headers = (values = {}) => new Headers(values);
const fixedNow = 1_799_100_005_000;

test('allows ten requests in one fixed window and atomically rejects the eleventh', async () => {
  const database = new MemoryDatabase();
  const requestHeaders = headers({ 'CF-Connecting-IP': '203.0.113.42' });

  const decisions = await Promise.all(
    Array.from({ length: AI_RATE_LIMIT_MAX_REQUESTS + 1 }, () =>
      consumeAiRateLimit(database, 'search-parse', requestHeaders, {
        nowMs: fixedNow,
      }),
    ),
  );

  assert.equal(decisions.filter((decision) => decision.allowed).length, 10);
  const rejected = decisions.find((decision) => !decision.allowed);
  assert.ok(rejected);
  assert.equal(rejected.reason, 'limit_exceeded');
  assert.equal(rejected.remaining, 0);
  assert.ok(rejected.retryAfterSeconds > 0);
  assert.equal(database.rows.size, 1);
  assert.equal(database.rows.values().next().value.request_count, 10);
  assert.ok(
    database.boundBucketKeys.every(
      (bucketKey) =>
        typeof bucketKey === 'string' && !bucketKey.includes('203.0.113.42'),
    ),
  );
});

test('uses independent hashed buckets for different clients and scopes', async () => {
  const database = new MemoryDatabase();
  const firstHeaders = headers({
    [AI_RATE_LIMIT_SESSION_HEADER]: 'session-client-a',
  });
  const secondHeaders = headers({
    [AI_RATE_LIMIT_SESSION_HEADER]: 'session-client-b',
  });

  const first = await consumeAiRateLimit(
    database,
    'search-parse',
    firstHeaders,
    { nowMs: fixedNow, limit: 1 },
  );
  const firstAgain = await consumeAiRateLimit(
    database,
    'search-parse',
    firstHeaders,
    { nowMs: fixedNow, limit: 1 },
  );
  const second = await consumeAiRateLimit(
    database,
    'search-parse',
    secondHeaders,
    { nowMs: fixedNow, limit: 1 },
  );
  const otherScope = await consumeAiRateLimit(
    database,
    'results-explain',
    firstHeaders,
    { nowMs: fixedNow, limit: 1 },
  );

  assert.equal(first.allowed, true);
  assert.equal(firstAgain.reason, 'limit_exceeded');
  assert.equal(second.allowed, true);
  assert.equal(otherScope.allowed, true);
  assert.equal(database.rows.size, 3);

  const firstKey = await createAiRateLimitBucketKey(
    'search-parse',
    firstHeaders,
  );
  const secondKey = await createAiRateLimitBucketKey(
    'search-parse',
    secondHeaders,
  );
  const otherScopeKey = await createAiRateLimitBucketKey(
    'results-explain',
    firstHeaders,
  );
  assert.notEqual(firstKey, secondKey);
  assert.notEqual(firstKey, otherScopeKey);
  assert.ok(!firstKey.includes('session-client-a'));
});

test('starts a new count after the fixed window rolls over', async () => {
  const database = new MemoryDatabase();
  const requestHeaders = headers();

  await consumeAiRateLimit(database, 'search-parse', requestHeaders, {
    nowMs: fixedNow,
    limit: 1,
  });
  const blocked = await consumeAiRateLimit(
    database,
    'search-parse',
    requestHeaders,
    { nowMs: fixedNow, limit: 1 },
  );
  const nextWindow = await consumeAiRateLimit(
    database,
    'search-parse',
    requestHeaders,
    { nowMs: fixedNow + AI_RATE_LIMIT_WINDOW_MS, limit: 1 },
  );

  assert.equal(blocked.reason, 'limit_exceeded');
  assert.equal(nextWindow.allowed, true);
  assert.equal(database.rows.values().next().value.request_count, 1);
});

test('fails closed when D1 is unavailable or returns an invalid row', async () => {
  const unavailable = await consumeAiRateLimit(
    null,
    'search-parse',
    headers(),
    { nowMs: fixedNow },
  );
  assert.deepEqual(unavailable, {
    allowed: false,
    reason: 'unavailable',
    limit: AI_RATE_LIMIT_MAX_REQUESTS,
    remaining: 0,
    retryAfterSeconds: 0,
  });

  const brokenDatabase = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return { request_count: 1 };
        },
        async run() {
          return { success: false };
        },
      };
    },
  };
  const broken = await consumeAiRateLimit(
    brokenDatabase,
    'search-parse',
    headers(),
    { nowMs: fixedNow },
  );
  assert.equal(broken.allowed, false);
  assert.equal(broken.reason, 'unavailable');
});

test('prunes expired buckets without exposing their original identity', async () => {
  const database = new MemoryDatabase();
  const requestHeaders = headers({ 'CF-Connecting-IP': '198.51.100.9' });
  await consumeAiRateLimit(database, 'search-parse', requestHeaders, {
    nowMs: fixedNow,
  });

  assert.equal(database.rows.size, 1);
  await pruneExpiredAiRateLimitWindows(
    database,
    fixedNow + AI_RATE_LIMIT_WINDOW_MS,
  );
  assert.equal(database.rows.size, 0);
  assert.ok(
    database.boundBucketKeys.every(
      (bucketKey) => !bucketKey.includes('198.51.100.9'),
    ),
  );
});
