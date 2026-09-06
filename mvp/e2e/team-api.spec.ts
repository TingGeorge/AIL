import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type TestInfo,
} from '@playwright/test';

import type { CatalogSearchResponse } from '../lib/catalog-contract';
import type {
  RedeemedInviteDto,
  TeamCampaignDto,
  TeamDto,
  TeamInviteDto,
} from '../lib/team-contract';

type AccountSession = {
  sessionToken: string;
  user: { id: string; username: string };
};

type TeamError = { error: string; message: string };

function uniqueSuffix(testInfo: TestInfo) {
  const run = Date.now().toString(36);
  const entropy = crypto.randomUUID().replaceAll('-', '').slice(0, 6);
  return `${run}_${testInfo.workerIndex}_${entropy}`;
}

function authHeaders(session: AccountSession) {
  return { Authorization: `Bearer ${session.sessionToken}` };
}

async function registerAccount(
  request: APIRequestContext,
  username: string,
  nickname: string,
) {
  const response = await request.post('/api/auth/register', {
    headers: { 'CF-Connecting-IP': `team-api-${username}` },
    data: {
      username,
      password: 'playwright-team-password',
      nickname,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as AccountSession;
}

async function discoverPlaceCatalogItemId(request: APIRequestContext) {
  const response = await request.post('/api/catalog/search', {
    data: { category: 'ALL', limit: 100 },
  });
  expect(response.status()).toBe(200);
  const catalog = (await response.json()) as CatalogSearchResponse;
  const place = catalog.items.find(
    (item) =>
      item.subjectType === 'PLACE' &&
      /^PLACE:[A-Za-z0-9_.:-]{1,148}$/u.test(item.id),
  );
  expect(place, '本機 catalog 應提供可建立意願活動的 PLACE').toBeTruthy();
  return place!.id;
}

async function expectTeamError(
  response: APIResponse,
  status: number,
  error: string,
) {
  expect(response.status()).toBe(status);
  const payload = (await response.json()) as TeamError;
  expect(payload).toMatchObject({ error });
}

test('Team API 完成邀請、活動與承諾生命週期，且不信任客戶端身分或價格', async ({
  request,
}, testInfo) => {
  const suffix = uniqueSuffix(testInfo);
  const [owner, member, outsider] = await Promise.all([
    registerAccount(request, `to_${suffix}`, 'Team E2E 團主'),
    registerAccount(request, `tm_${suffix}`, 'Team E2E 成員'),
    registerAccount(request, `tx_${suffix}`, 'Team E2E 非成員'),
  ]);

  await expectTeamError(
    await request.get('/api/v1/teams'),
    401,
    'authentication_required',
  );

  const injectedTeam = await request.post('/api/v1/teams', {
    headers: authHeaders(owner),
    data: {
      name: `不應建立-${suffix}`,
      userId: member.user.id,
      role: 'OWNER',
    },
  });
  await expectTeamError(injectedTeam, 400, 'invalid_team_input');

  const createTeam = await request.post('/api/v1/teams', {
    headers: authHeaders(owner),
    data: { name: `整合測試團-${suffix}` },
  });
  expect(createTeam.status()).toBe(201);
  const { team } = (await createTeam.json()) as { team: TeamDto };
  expect(team).toMatchObject({ role: 'OWNER', memberCount: 1 });

  await expectTeamError(
    await request.get(`/api/v1/teams/${team.id}`, {
      headers: authHeaders(outsider),
    }),
    403,
    'team_membership_required',
  );

  const createInvite = await request.post(`/api/v1/teams/${team.id}/invites`, {
    headers: authHeaders(owner),
    data: { maxUses: 5 },
  });
  expect(createInvite.status()).toBe(201);
  const { invite } = (await createInvite.json()) as { invite: TeamInviteDto };
  expect(invite).toMatchObject({ teamId: team.id, maxUses: 5, useCount: 0 });

  await expectTeamError(
    await request.post('/api/v1/invites/redeem', {
      headers: authHeaders(member),
      data: { token: invite.token, userId: owner.user.id },
    }),
    400,
    'invalid_team_input',
  );

  const redeem = await request.post('/api/v1/invites/redeem', {
    headers: authHeaders(member),
    data: { token: invite.token },
  });
  expect(redeem.status()).toBe(200);
  const redeemed = (await redeem.json()) as RedeemedInviteDto;
  expect(redeemed).toMatchObject({
    joined: true,
    team: { id: team.id, role: 'MEMBER' },
  });

  const memberTeams = await request.get('/api/v1/teams', {
    headers: authHeaders(member),
  });
  expect(memberTeams.status()).toBe(200);
  const memberTeamList = (await memberTeams.json()) as { teams: TeamDto[] };
  expect(memberTeamList.teams).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: team.id, role: 'MEMBER', memberCount: 2 }),
    ]),
  );

  const readTeam = await request.get(`/api/v1/teams/${team.id}`, {
    headers: authHeaders(member),
  });
  expect(readTeam.status()).toBe(200);
  await expect(readTeam.json()).resolves.toMatchObject({
    team: { id: team.id, role: 'MEMBER', memberCount: 2 },
  });

  await expectTeamError(
    await request.post(`/api/v1/teams/${team.id}/invites`, {
      headers: authHeaders(member),
      data: { maxUses: 2 },
    }),
    403,
    'team_role_required',
  );

  const catalogItemId = await discoverPlaceCatalogItemId(request);
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  const campaignInput = {
    catalogItemId,
    title: `兩人生活意願-${suffix}`,
    targetPeople: 2,
    targetQuantity: 2,
    deadline,
  };

  await expectTeamError(
    await request.post(`/api/v1/teams/${team.id}/campaigns`, {
      headers: authHeaders(owner),
      data: {
        ...campaignInput,
        userId: member.user.id,
        offerPriceTwd: 1,
        pricingVerified: true,
      },
    }),
    400,
    'invalid_team_input',
  );

  const createCampaign = await request.post(
    `/api/v1/teams/${team.id}/campaigns`,
    {
      headers: authHeaders(owner),
      data: campaignInput,
    },
  );
  expect(createCampaign.status()).toBe(201);
  const { campaign } = (await createCampaign.json()) as {
    campaign: TeamCampaignDto;
  };
  expect(campaign).toMatchObject({
    teamId: team.id,
    pricingVerified: false,
    status: 'OPEN',
    offer: {
      catalogItemId,
      type: 'TEAM_INTENT',
      regularPriceTwd: null,
      offerPriceTwd: null,
      verificationStatus: 'UNVERIFIED',
    },
    progress: {
      pledgedPeople: 0,
      pledgedQuantity: 0,
      targetPeople: 2,
      targetQuantity: 2,
      thresholdMet: false,
    },
  });

  const memberCampaigns = await request.get(
    `/api/v1/teams/${team.id}/campaigns`,
    { headers: authHeaders(member) },
  );
  expect(memberCampaigns.status()).toBe(200);
  const listed = (await memberCampaigns.json()) as {
    campaigns: TeamCampaignDto[];
  };
  expect(listed.campaigns.map((item) => item.id)).toContain(campaign.id);

  await expectTeamError(
    await request.get(`/api/v1/teams/${team.id}/campaigns`, {
      headers: authHeaders(outsider),
    }),
    403,
    'team_membership_required',
  );
  await expectTeamError(
    await request.get(`/api/v1/campaigns/${campaign.id}`, {
      headers: authHeaders(outsider),
    }),
    403,
    'team_membership_required',
  );

  const readCampaign = await request.get(`/api/v1/campaigns/${campaign.id}`, {
    headers: authHeaders(member),
  });
  expect(readCampaign.status()).toBe(200);
  await expect(readCampaign.json()).resolves.toMatchObject({
    campaign: { id: campaign.id, teamId: team.id },
  });

  await expectTeamError(
    await request.put(`/api/v1/campaigns/${campaign.id}/commitment`, {
      headers: authHeaders(member),
      data: {
        action: 'PLEDGE',
        quantity: 2,
        maxCostTwd: 300,
        userId: owner.user.id,
        offerPriceTwd: 1,
      },
    }),
    400,
    'invalid_team_input',
  );

  const pledge = await request.put(
    `/api/v1/campaigns/${campaign.id}/commitment`,
    {
      headers: authHeaders(member),
      data: { action: 'PLEDGE', quantity: 2, maxCostTwd: 300 },
    },
  );
  expect(pledge.status()).toBe(200);
  const pledged = (await pledge.json()) as { campaign: TeamCampaignDto };
  expect(pledged.campaign).toMatchObject({
    pricingVerified: false,
    myCommitment: {
      quantity: 2,
      maxCostTwd: 300,
      status: 'PLEDGED',
    },
    progress: {
      pledgedPeople: 1,
      pledgedQuantity: 2,
      thresholdMet: false,
    },
  });

  const withdraw = await request.put(
    `/api/v1/campaigns/${campaign.id}/commitment`,
    {
      headers: authHeaders(member),
      data: { action: 'WITHDRAW' },
    },
  );
  expect(withdraw.status()).toBe(200);
  const withdrawn = (await withdraw.json()) as { campaign: TeamCampaignDto };
  expect(withdrawn.campaign).toMatchObject({
    myCommitment: { status: 'WITHDRAWN' },
    progress: {
      pledgedPeople: 0,
      pledgedQuantity: 0,
      thresholdMet: false,
    },
  });
});

test('maxUses=1 的邀請在兩位成員同時兌換時只成功一次', async ({
  request,
}, testInfo) => {
  const suffix = uniqueSuffix(testInfo);
  const [owner, first, second] = await Promise.all([
    registerAccount(request, `co_${suffix}`, '競態測試團主'),
    registerAccount(request, `ca_${suffix}`, '競態成員 A'),
    registerAccount(request, `cb_${suffix}`, '競態成員 B'),
  ]);

  const createTeam = await request.post('/api/v1/teams', {
    headers: authHeaders(owner),
    data: { name: `單次邀請-${suffix}` },
  });
  expect(createTeam.status()).toBe(201);
  const { team } = (await createTeam.json()) as { team: TeamDto };

  const createInvite = await request.post(`/api/v1/teams/${team.id}/invites`, {
    headers: authHeaders(owner),
    data: { maxUses: 1 },
  });
  expect(createInvite.status()).toBe(201);
  const { invite } = (await createInvite.json()) as { invite: TeamInviteDto };

  const contenders = [first, second];
  const responses = await Promise.all(
    contenders.map((session) =>
      request.post('/api/v1/invites/redeem', {
        headers: authHeaders(session),
        data: { token: invite.token },
      }),
    ),
  );

  expect(
    responses.map((response) => response.status()).sort((a, b) => a - b),
  ).toEqual([200, 409]);
  const winnerIndex = responses.findIndex(
    (response) => response.status() === 200,
  );
  const loserIndex = winnerIndex === 0 ? 1 : 0;
  const winner = contenders[winnerIndex];
  const loser = contenders[loserIndex];

  await expect(responses[winnerIndex].json()).resolves.toMatchObject({
    joined: true,
    team: { id: team.id, role: 'MEMBER' },
  });
  await expectTeamError(responses[loserIndex], 409, 'invite_full');

  const repeatWinner = await request.post('/api/v1/invites/redeem', {
    headers: authHeaders(winner),
    data: { token: invite.token },
  });
  expect(repeatWinner.status()).toBe(200);
  await expect(repeatWinner.json()).resolves.toMatchObject({
    joined: false,
    team: { id: team.id, role: 'MEMBER' },
  });

  const loserTeams = await request.get('/api/v1/teams', {
    headers: authHeaders(loser),
  });
  expect(loserTeams.status()).toBe(200);
  const loserTeamList = (await loserTeams.json()) as { teams: TeamDto[] };
  expect(loserTeamList.teams.map((item) => item.id)).not.toContain(team.id);
});
