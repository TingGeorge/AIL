'use client';

import { readAccountToken } from '@/lib/account-client';
import type {
  CatalogItem,
  CatalogSearchResponse,
} from '@/lib/catalog-contract';
import type {
  CommitmentMutationInput,
  CreateCampaignInput,
  CreateInviteInput,
  CreateTeamInput,
  RedeemedInviteDto,
  TeamCampaignDto,
  TeamDto,
  TeamInviteDto,
} from '@/lib/team-contract';

type TeamApiError = {
  error?: string;
  message?: string;
};

type TeamRequestOptions = RequestInit & {
  token?: string | null;
};

export class TeamClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'TeamClientError';
  }
}

function accountToken(explicitToken?: string | null) {
  const token = explicitToken ?? readAccountToken();
  if (!token) {
    throw new TeamClientError(
      '請先登入生活帳號。',
      401,
      'authentication_required',
    );
  }
  return token;
}

async function teamRequest<T>(url: string, options: TeamRequestOptions = {}) {
  const { token: explicitToken, ...init } = options;
  const headers = new Headers(init.headers);
  const token = accountToken(explicitToken);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers,
    });
  } catch {
    throw new TeamClientError(
      '目前無法連上團隊服務，請檢查網路後再試。',
      0,
      'network_error',
    );
  }

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as TeamApiError | null;
    throw new TeamClientError(
      payload?.message ?? '團隊服務暫時無法使用。',
      response.status,
      payload?.error ?? 'team_request_failed',
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function catalogRequest(signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch('/api/catalog/search', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'ALL', limit: 100 }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error;
    throw new TeamClientError(
      '目前無法載入地點，請檢查網路後再試。',
      0,
      'catalog_network_error',
    );
  }

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as TeamApiError | null;
    throw new TeamClientError(
      payload?.message ?? '地點清單暫時無法載入。',
      response.status,
      payload?.error ?? 'catalog_request_failed',
    );
  }
  return (await response.json()) as CatalogSearchResponse;
}

export async function loadCampaignPlaces(signal?: AbortSignal) {
  const response = await catalogRequest(signal);
  const places = response.items.filter(
    (item): item is CatalogItem =>
      item.subjectType === 'PLACE' && item.id.startsWith('PLACE:'),
  );
  return { ...response, items: places };
}

export async function listTeams(token?: string | null) {
  const response = await teamRequest<{ teams: TeamDto[] }>('/api/v1/teams', {
    token,
  });
  return response.teams;
}

export async function createTeam(
  input: CreateTeamInput,
  token?: string | null,
) {
  const response = await teamRequest<{ team: TeamDto }>('/api/v1/teams', {
    method: 'POST',
    body: JSON.stringify(input),
    token,
  });
  return response.team;
}

export async function readTeam(teamId: string, token?: string | null) {
  const response = await teamRequest<{ team: TeamDto }>(
    `/api/v1/teams/${encodeURIComponent(teamId)}`,
    { token },
  );
  return response.team;
}

export async function createTeamInvite(
  teamId: string,
  input: CreateInviteInput,
  token?: string | null,
) {
  const response = await teamRequest<{ invite: TeamInviteDto }>(
    `/api/v1/teams/${encodeURIComponent(teamId)}/invites`,
    {
      method: 'POST',
      body: JSON.stringify(input),
      token,
    },
  );
  return response.invite;
}

export function redeemTeamInvite(inviteToken: string, token?: string | null) {
  return teamRequest<RedeemedInviteDto>('/api/v1/invites/redeem', {
    method: 'POST',
    body: JSON.stringify({ token: inviteToken }),
    token,
  });
}

export async function listTeamCampaigns(teamId: string, token?: string | null) {
  const response = await teamRequest<{ campaigns: TeamCampaignDto[] }>(
    `/api/v1/teams/${encodeURIComponent(teamId)}/campaigns`,
    { token },
  );
  return response.campaigns;
}

export async function createTeamCampaign(
  teamId: string,
  input: CreateCampaignInput,
  token?: string | null,
) {
  const response = await teamRequest<{ campaign: TeamCampaignDto }>(
    `/api/v1/teams/${encodeURIComponent(teamId)}/campaigns`,
    {
      method: 'POST',
      body: JSON.stringify(input),
      token,
    },
  );
  return response.campaign;
}

export async function readTeamCampaign(
  campaignId: string,
  token?: string | null,
) {
  const response = await teamRequest<{ campaign: TeamCampaignDto }>(
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}`,
    { token },
  );
  return response.campaign;
}

export async function updateTeamCommitment(
  campaignId: string,
  input: CommitmentMutationInput,
  token?: string | null,
) {
  const response = await teamRequest<{ campaign: TeamCampaignDto }>(
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}/commitment`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
      token,
    },
  );
  return response.campaign;
}
