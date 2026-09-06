import { expect, test } from '@playwright/test';
import {
  ACCOUNT_AUTH_BODY_MAX_BYTES,
  ACCOUNT_LOGIN_RATE_LIMIT,
} from '../lib/account-contract';

test('帳號 API 可註冊、還原、同步資料並撤銷工作階段', async ({ request }) => {
  const username = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const password = 'playwright-account-password';

  const register = await request.post('/api/auth/register', {
    headers: { 'CF-Connecting-IP': `account-lifecycle-${username}` },
    data: { username, password, nickname: 'E2E 驗收' },
  });
  expect(register.status()).toBe(201);
  const session = (await register.json()) as {
    sessionToken: string;
    user: { username: string };
  };
  expect(session.user.username).toBe(username);

  const headers = { Authorization: `Bearer ${session.sessionToken}` };
  const me = await request.get('/api/auth/me', { headers });
  expect(me.status()).toBe(200);

  const save = await request.put('/api/me/data', {
    headers,
    data: {
      state: {
        version: 1,
        saved: ['e2e-saved-item'],
        monthlyBudget: 9000,
      },
    },
  });
  expect(save.status()).toBe(200);

  const read = await request.get('/api/me/data', { headers });
  expect(read.status()).toBe(200);
  await expect(read.json()).resolves.toMatchObject({
    state: { saved: ['e2e-saved-item'], monthlyBudget: 9000 },
  });

  const logout = await request.post('/api/auth/logout', { headers });
  expect(logout.status()).toBe(204);

  const expired = await request.get('/api/auth/me', { headers });
  expect(expired.status()).toBe(401);
});

test('帳號 API 拒絕非 JSON、畸形 JSON 與超大請求', async ({ request }) => {
  const clientIp = `account-contract-${Date.now()}-${Math.random()}`;
  const baseHeaders = { 'CF-Connecting-IP': clientIp };

  const wrongType = await request.post('/api/auth/register', {
    headers: { ...baseHeaders, 'Content-Type': 'text/plain' },
    data: JSON.stringify({
      username: 'wrong_type',
      password: 'a-valid-password',
    }),
  });
  expect(wrongType.status()).toBe(415);
  await expect(wrongType.json()).resolves.toMatchObject({
    error: 'unsupported_media_type',
  });

  const malformed = await request.post('/api/auth/register', {
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    data: Buffer.from('{"username":'),
  });
  expect(malformed.status()).toBe(400);
  await expect(malformed.json()).resolves.toMatchObject({
    error: 'invalid_json',
  });

  const oversized = await request.post('/api/auth/register', {
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    data: Buffer.from(
      JSON.stringify({ padding: 'x'.repeat(ACCOUNT_AUTH_BODY_MAX_BYTES) }),
    ),
  });
  expect(oversized.status()).toBe(413);
  await expect(oversized.json()).resolves.toMatchObject({
    error: 'request_body_too_large',
  });
});

test('帳號 API 也會限制沒有 Content-Length 的串流內容', async ({ baseURL }) => {
  const oversizedJson = JSON.stringify({
    padding: 'x'.repeat(ACCOUNT_AUTH_BODY_MAX_BYTES),
  });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(oversizedJson));
      controller.close();
    },
  });
  const response = await fetch(new URL('/api/auth/register', baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': `account-stream-${Date.now()}-${Math.random()}`,
    },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  expect(response.status).toBe(413);
  await expect(response.json()).resolves.toMatchObject({
    error: 'request_body_too_large',
  });
});

test('登入限流以 D1 原子計數，只允許固定視窗配額', async ({ request }) => {
  const clientIp = `account-rate-limit-${Date.now()}-${Math.random()}`;
  const attempts = await Promise.all(
    Array.from({ length: ACCOUNT_LOGIN_RATE_LIMIT + 3 }, () =>
      request.post('/api/auth/login', {
        headers: { 'CF-Connecting-IP': clientIp },
        data: {
          username: 'missing_account',
          password: 'a-valid-password',
        },
      }),
    ),
  );
  const statuses = attempts.map((response) => response.status());
  expect(statuses.filter((status) => status === 401)).toHaveLength(
    ACCOUNT_LOGIN_RATE_LIMIT,
  );
  expect(statuses.filter((status) => status === 429)).toHaveLength(3);

  for (const response of attempts.filter(
    (candidate) => candidate.status() === 429,
  )) {
    expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
    await expect(response.json()).resolves.toMatchObject({
      error: 'rate_limit_exceeded',
    });
  }
});
