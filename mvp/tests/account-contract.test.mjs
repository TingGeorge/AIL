import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_AUTH_BODY_MAX_BYTES,
  ACCOUNT_LOGIN_RATE_LIMIT,
  ACCOUNT_RATE_LIMIT_WINDOW_MS,
  ACCOUNT_REGISTER_RATE_LIMIT,
  ACCOUNT_STATE_BODY_MAX_BYTES,
  ACCOUNT_STATE_MAX_BYTES,
  isAccountJsonContentType,
  parseAccountContentLength,
} from '../lib/account-contract.ts';

test('account API accepts only the documented JSON media type', () => {
  assert.equal(isAccountJsonContentType('application/json'), true);
  assert.equal(
    isAccountJsonContentType('Application/JSON; charset=utf-8'),
    true,
  );
  assert.equal(isAccountJsonContentType('text/plain'), false);
  assert.equal(isAccountJsonContentType('application/problem+json'), false);
  assert.equal(isAccountJsonContentType(null), false);
});

test('account request length parser rejects ambiguous or unsafe lengths', () => {
  assert.deepEqual(parseAccountContentLength(null), {
    ok: true,
    bytes: null,
  });
  assert.deepEqual(parseAccountContentLength('4096'), {
    ok: true,
    bytes: 4096,
  });
  assert.deepEqual(parseAccountContentLength('-1'), { ok: false });
  assert.deepEqual(parseAccountContentLength('12.5'), { ok: false });
  assert.deepEqual(parseAccountContentLength('not-a-number'), { ok: false });
  assert.deepEqual(parseAccountContentLength('9'.repeat(100)), { ok: false });
});

test('account limits keep auth small and persisted state below its request cap', () => {
  assert.equal(ACCOUNT_AUTH_BODY_MAX_BYTES, 4_096);
  assert.ok(ACCOUNT_STATE_MAX_BYTES < ACCOUNT_STATE_BODY_MAX_BYTES);
  assert.ok(ACCOUNT_STATE_BODY_MAX_BYTES < 1_000_000);
  assert.equal(ACCOUNT_REGISTER_RATE_LIMIT, 3);
  assert.equal(ACCOUNT_LOGIN_RATE_LIMIT, 5);
  assert.equal(ACCOUNT_RATE_LIMIT_WINDOW_MS, 60_000);
});
