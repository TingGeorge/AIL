import { expect, test } from '@playwright/test';

test('帳號 API 可註冊、還原、同步資料並撤銷工作階段', async ({ request }) => {
  const username = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const password = 'playwright-account-password';

  const register = await request.post('/api/auth/register', {
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
