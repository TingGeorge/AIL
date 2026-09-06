import { expect, type Page, test } from '@playwright/test';

const sessionToken = 'team-e2e-session';
const inviteToken = 'A'.repeat(43);

const accountUser = {
  id: 'user-team-owner',
  username: 'team_owner',
  nickname: '圓山隊長',
  avatar: '#6978ff',
};

const ownerTeam = {
  id: 'team-owner',
  name: '圓山午餐隊',
  status: 'ACTIVE',
  role: 'OWNER',
  memberCount: 3,
  activeCampaignCount: 0,
  createdAt: '2026-09-06T01:00:00.000Z',
  updatedAt: '2026-09-06T01:00:00.000Z',
  version: 1,
};

const catalogPlace = {
  id: 'PLACE:place_cafe',
  subjectType: 'PLACE',
  categoryKey: 'FOOD',
  categoryLabel: '食品',
  kind: 'RESTAURANT',
  title: '小樹咖啡',
  provider: '臺北市官方資料',
  address: '臺北市中山區圓山路 1 號',
  latitude: 25.071,
  longitude: 121.52,
  distanceM: 320,
  cost: {
    state: 'UNKNOWN',
    amountTwd: null,
    reason: '官方來源未提供可驗證價格。',
  },
  availability: {
    state: 'UNKNOWN',
    startsAt: null,
    endsAt: null,
    text: '營業時段待確認',
  },
  verification: {
    status: 'VERIFIED',
    label: '地點已驗證',
    fields: ['identity', 'location'],
  },
  condition: '價格與營業狀態待店家確認。',
  source: {
    title: '臺北市餐飲資料',
    publisher: '臺北市政府',
    url: 'https://example.test/source',
    verifiedAt: '2026-09-05T00:00:00.000Z',
  },
  evidenceQuote: '官方資料中的地點名稱與地址。',
  actionUrl: null,
  tags: ['圓山'],
  realtime: null,
};

function accountMePayload() {
  return {
    user: accountUser,
    expiresAt: '2030-01-01T00:00:00.000Z',
    data: { state: {}, revision: 0, updatedAt: null },
  };
}

function catalogPayload() {
  return {
    source: 'snapshot',
    fallback: true,
    syncedAt: '2026-09-05T00:00:00.000Z',
    eventWindow: {
      startsAt: '2026-09-06T00:00:00.000Z',
      endsAt: '2026-10-06T00:00:00.000Z',
      days: 30,
    },
    coverage: {
      center: { latitude: 25.071, longitude: 121.52 },
      radiusM: 2_000,
    },
    items: [catalogPlace],
    facets: [],
    warnings: ['測試使用最近一次官方資料快照。'],
  };
}

function campaignPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'campaign-lunch',
    teamId: ownerTeam.id,
    title: '週五一起喝咖啡',
    status: 'OPEN',
    deadline: '2030-01-01T04:00:00.000Z',
    version: 1,
    offer: {
      id: 'offer-intent',
      catalogItemId: catalogPlace.id,
      type: 'TEAM_INTENT',
      title: catalogPlace.title,
      regularPriceTwd: null,
      offerPriceTwd: null,
      verificationStatus: 'UNVERIFIED',
    },
    pricingVerified: false,
    progress: {
      pledgedPeople: 0,
      pledgedQuantity: 0,
      targetPeople: 4,
      targetQuantity: null,
      thresholdMet: false,
    },
    myCommitment: null,
    ...overrides,
  };
}

async function seedSession(page: Page, token = sessionToken) {
  await page.addInitScript(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    { key: 'all-in-life:session-token', value: token },
  );
}

test('Team Hub 可建團、從 catalog 建立未定價意願、登記與分享 fragment 邀請', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seedSession(page);
  let teams = [ownerTeam];
  let campaigns: ReturnType<typeof campaignPayload>[] = [];
  let createCampaignBody: Record<string, unknown> | null = null;
  const commitmentBodies: Record<string, unknown>[] = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === '/api/catalog/search' && method === 'POST') {
      expect(request.postDataJSON()).toMatchObject({
        category: 'ALL',
        limit: 100,
      });
      await route.fulfill({ json: catalogPayload() });
      return;
    }
    expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`);
    if (url.pathname === '/api/auth/me' && method === 'GET') {
      await route.fulfill({ json: accountMePayload() });
      return;
    }
    if (url.pathname === '/api/v1/teams' && method === 'GET') {
      await route.fulfill({ json: { teams } });
      return;
    }
    if (url.pathname === '/api/v1/teams' && method === 'POST') {
      const created = {
        ...ownerTeam,
        id: 'team-new',
        name: request.postDataJSON().name as string,
        memberCount: 1,
      };
      teams = [created, ...teams];
      await route.fulfill({ status: 201, json: { team: created } });
      return;
    }
    const teamMatch = url.pathname.match(/^\/api\/v1\/teams\/([^/]+)$/u);
    if (teamMatch && method === 'GET') {
      const team = teams.find((item) => item.id === teamMatch[1]);
      await route.fulfill({ json: { team } });
      return;
    }
    const campaignsMatch = url.pathname.match(
      /^\/api\/v1\/teams\/([^/]+)\/campaigns$/u,
    );
    if (campaignsMatch && method === 'GET') {
      await route.fulfill({
        json: {
          campaigns: campaigns.filter(
            (campaign) => campaign.teamId === campaignsMatch[1],
          ),
        },
      });
      return;
    }
    if (campaignsMatch && method === 'POST') {
      createCampaignBody = request.postDataJSON() as Record<string, unknown>;
      const campaign = campaignPayload({
        teamId: campaignsMatch[1],
        title: createCampaignBody.title,
        deadline: createCampaignBody.deadline,
        progress: {
          pledgedPeople: 0,
          pledgedQuantity: 0,
          targetPeople: createCampaignBody.targetPeople,
          targetQuantity: createCampaignBody.targetQuantity,
          thresholdMet: false,
        },
      });
      campaigns = [campaign, ...campaigns];
      await route.fulfill({ status: 201, json: { campaign } });
      return;
    }
    if (
      url.pathname === `/api/v1/teams/${ownerTeam.id}/invites` &&
      method === 'POST'
    ) {
      await route.fulfill({
        status: 201,
        json: {
          invite: {
            id: 'invite-1',
            teamId: ownerTeam.id,
            token: inviteToken,
            expiresAt: '2030-01-01T00:00:00.000Z',
            maxUses: request.postDataJSON().maxUses,
            useCount: 0,
          },
        },
      });
      return;
    }
    if (
      url.pathname === '/api/v1/campaigns/campaign-lunch/commitment' &&
      method === 'PUT'
    ) {
      const commitmentBody = request.postDataJSON() as Record<string, unknown>;
      commitmentBodies.push(commitmentBody);
      const current = campaigns[0];
      const withdrawing = commitmentBody.action === 'WITHDRAW';
      const updated = campaignPayload(
        withdrawing
          ? {
              ...current,
              version: 3,
              progress: {
                pledgedPeople: 0,
                pledgedQuantity: 0,
                targetPeople: 4,
                targetQuantity: null,
                thresholdMet: false,
              },
              myCommitment: {
                quantity: 2,
                maxCostTwd: null,
                status: 'WITHDRAWN',
                updatedAt: '2026-09-06T02:10:00.000Z',
              },
            }
          : {
              ...current,
              version: 2,
              progress: {
                pledgedPeople: 1,
                pledgedQuantity: commitmentBody.quantity,
                targetPeople: 4,
                targetQuantity: null,
                thresholdMet: false,
              },
              myCommitment: {
                quantity: commitmentBody.quantity,
                maxCostTwd: null,
                status: 'PLEDGED',
                updatedAt: '2026-09-06T02:00:00.000Z',
              },
            },
      );
      campaigns = [updated];
      await route.fulfill({ json: { campaign: updated } });
      return;
    }
    if (
      url.pathname === '/api/v1/campaigns/campaign-lunch' &&
      method === 'GET'
    ) {
      await route.fulfill({ json: { campaign: campaigns[0] } });
      return;
    }
    await route.fulfill({
      status: 501,
      json: { error: 'unmocked', message: `${method} ${url.pathname}` },
    });
  });

  await page.goto('/team');
  await expect(
    page.getByRole('heading', { name: '把「想一起」變成看得見的進度' }),
  ).toBeVisible();
  await expect(
    page.getByText('圓山午餐隊', { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  const inviteButtons = page.getByRole('button', {
    name: '建立邀請',
    exact: true,
  });
  const inviteCards = page.getByRole('region', {
    name: '邀請可信任的夥伴',
    exact: true,
  });
  const inviteHeadings = page.locator('#invite-title');
  await expect(inviteButtons).toHaveCount(1);
  await expect(inviteCards).toHaveCount(1);
  await expect(inviteHeadings).toHaveCount(1);

  await page.getByLabel('團隊名稱').fill('週末散步隊');
  await page.getByRole('button', { name: '建立團隊' }).click();
  await expect(
    page.getByText('週末散步隊', { exact: true }).first(),
  ).toBeVisible();
  await expect(inviteButtons).toHaveCount(1);
  await expect(inviteCards).toHaveCount(1);
  await expect(inviteHeadings).toHaveCount(1);
  await page.getByRole('button', { name: /圓山午餐隊/ }).click();
  await expect(inviteButtons).toHaveCount(1);
  await expect(inviteCards).toHaveCount(1);
  await expect(inviteHeadings).toHaveCount(1);

  await page.getByRole('button', { name: /小樹咖啡/ }).click();
  await page.getByLabel('活動標題').fill('週五一起喝咖啡');
  await page.getByRole('button', { name: '建立未定價意願活動' }).click();
  await expect(
    page.getByRole('heading', { name: '週五一起喝咖啡' }),
  ).toBeVisible();
  expect(createCampaignBody).toMatchObject({
    offerId: null,
    catalogItemId: catalogPlace.id,
    title: '週五一起喝咖啡',
    targetPeople: 5,
    targetQuantity: null,
  });
  expect(createCampaignBody).not.toHaveProperty('placeId');
  expect(createCampaignBody).not.toHaveProperty('offerPriceTwd');
  await expect(page.getByText('未定價意願，不顯示金額')).toBeVisible();
  await expect(
    page.getByText(/不代付、不下單、不保證履約/).first(),
  ).toBeVisible();

  await page.getByLabel('登記數量').fill('2');
  await page.getByRole('button', { name: '登記我的意願' }).click();
  await expect(page.getByText('我的意願：2 份')).toBeVisible();
  expect(commitmentBodies[0]).toEqual({
    action: 'PLEDGE',
    quantity: 2,
    maxCostTwd: null,
  });
  await page.getByRole('button', { name: '撤回' }).click();
  await expect(page.getByText('已撤回意願。')).toBeVisible();
  expect(commitmentBodies[1]).toEqual({ action: 'WITHDRAW' });
  await expect(inviteButtons).toHaveCount(1);
  await expect(inviteCards).toHaveCount(1);
  await expect(inviteHeadings).toHaveCount(1);

  await inviteButtons.click();
  const inviteLink = page.getByLabel('邀請連結');
  await expect(inviteLink).toHaveValue(
    new RegExp(`/team#invite=${inviteToken}$`),
  );
  expect(await inviteLink.inputValue()).not.toContain('?invite=');
  expect(await inviteLink.inputValue()).not.toContain('/api/');

  await page.reload();
  await page.getByRole('button', { name: /圓山午餐隊/ }).click();
  await expect(
    page.getByRole('heading', { name: '週五一起喝咖啡' }),
  ).toBeVisible();
  await expect(inviteButtons).toHaveCount(1);
  await expect(inviteCards).toHaveCount(1);
  await expect(inviteHeadings).toHaveCount(1);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: '登出' }).click();
  await expect(
    page.getByRole('heading', { name: '登入後管理團隊意願' }),
  ).toBeVisible();
});

test('fragment 邀請會在登入後以 POST body 自動兌換並清除 fragment', async ({
  page,
}) => {
  let joined = false;
  let redeemRequest: {
    pathname: string;
    search: string;
    body: unknown;
  } | null = null;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      await route.fulfill({
        json: {
          ...accountMePayload(),
          sessionToken,
        },
      });
      return;
    }
    if (url.pathname === '/api/catalog/search' && method === 'POST') {
      await route.fulfill({ json: catalogPayload() });
      return;
    }
    if (url.pathname === '/api/v1/invites/redeem' && method === 'POST') {
      redeemRequest = {
        pathname: url.pathname,
        search: url.search,
        body: request.postDataJSON(),
      };
      joined = true;
      await route.fulfill({ json: { team: ownerTeam, joined: true } });
      return;
    }
    if (url.pathname === '/api/v1/teams' && method === 'GET') {
      await route.fulfill({ json: { teams: joined ? [ownerTeam] : [] } });
      return;
    }
    if (url.pathname === `/api/v1/teams/${ownerTeam.id}` && method === 'GET') {
      await route.fulfill({ json: { team: ownerTeam } });
      return;
    }
    if (
      url.pathname === `/api/v1/teams/${ownerTeam.id}/campaigns` &&
      method === 'GET'
    ) {
      await route.fulfill({ json: { campaigns: [] } });
      return;
    }
    await route.fulfill({
      status: 501,
      json: { error: 'unmocked', message: `${method} ${url.pathname}` },
    });
  });

  await page.goto(`/team#invite=${inviteToken}`);
  await expect(
    page.getByRole('heading', { name: '登入後管理團隊意願' }),
  ).toBeVisible();
  await expect(page.getByText('你有一份待加入邀請')).toBeVisible();
  await page
    .getByRole('textbox', { name: '帳號', exact: true })
    .fill('team_owner');
  await page.getByLabel('密碼').fill('AllInLife!2026');
  await page.getByRole('button', { name: '登入並繼續' }).click();
  await expect(page.getByText('已加入「圓山午餐隊」。')).toBeVisible();
  expect(redeemRequest).toEqual({
    pathname: '/api/v1/invites/redeem',
    search: '',
    body: { token: inviteToken },
  });
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
});

for (const scenario of [
  {
    code: 'invite_expired',
    status: 410,
    title: '邀請已過期',
    token: 'E'.repeat(43),
  },
  {
    code: 'invite_full',
    status: 409,
    title: '邀請名額已滿',
    token: 'F'.repeat(43),
  },
  {
    code: 'team_archived',
    status: 409,
    title: '邀請目前無法使用',
    token: 'C'.repeat(43),
  },
]) {
  test(`邀請錯誤狀態清楚呈現：${scenario.code}`, async ({ page }) => {
    await seedSession(page);
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/auth/me') {
        await route.fulfill({ json: accountMePayload() });
        return;
      }
      if (url.pathname === '/api/catalog/search') {
        await route.fulfill({ json: catalogPayload() });
        return;
      }
      if (url.pathname === '/api/v1/teams') {
        await route.fulfill({ json: { teams: [] } });
        return;
      }
      if (url.pathname === '/api/v1/invites/redeem') {
        await route.fulfill({
          status: scenario.status,
          json: { error: scenario.code, message: '邀請測試狀態。' },
        });
        return;
      }
      await route.fulfill({
        status: 501,
        json: {
          error: 'unmocked',
          message: `${request.method()} ${url.pathname}`,
        },
      });
    });

    await page.goto(`/team#invite=${scenario.token}`);
    await expect(page.getByText(scenario.title, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '關閉邀請提示' }).click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  });
}
