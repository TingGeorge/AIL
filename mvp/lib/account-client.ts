'use client';

import {
  ACCOUNT_SESSION_STORAGE_KEY,
  type AccountApiError,
  type AccountDataEnvelope,
  type AccountMeResponse,
  type AccountSessionResponse,
} from '@/lib/account-contract';

type AuthInput = {
  username: string;
  password: string;
  nickname?: string;
};

export class AccountClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export function readAccountToken() {
  try {
    return window.sessionStorage.getItem(ACCOUNT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveAccountToken(token: string) {
  window.sessionStorage.setItem(ACCOUNT_SESSION_STORAGE_KEY, token);
}

export function clearAccountToken() {
  try {
    window.sessionStorage.removeItem(ACCOUNT_SESSION_STORAGE_KEY);
  } catch {
    // The in-memory signed-out state still applies when storage is unavailable.
  }
}

async function accountRequest<T>(
  url: string,
  init: RequestInit = {},
  token?: string | null,
) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers,
  });
  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as AccountApiError | null;
    throw new AccountClientError(
      payload?.message ?? '帳號服務暫時無法使用。',
      response.status,
      payload?.error ?? 'account_request_failed',
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function authenticateAccount(
  mode: 'login' | 'register',
  input: AuthInput,
) {
  const session = await accountRequest<AccountSessionResponse>(
    `/api/auth/${mode}`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  saveAccountToken(session.sessionToken);
  return session;
}

export async function restoreAccountSession(token: string) {
  return accountRequest<AccountMeResponse>('/api/auth/me', {}, token);
}

export async function endAccountSession(token: string | null) {
  if (token) {
    await accountRequest<void>(
      '/api/auth/logout',
      { method: 'POST' },
      token,
    ).catch(() => undefined);
  }
  clearAccountToken();
}

export async function saveAccountData(
  token: string,
  state: Record<string, unknown>,
  revision: number,
) {
  return accountRequest<AccountDataEnvelope>(
    '/api/me/data',
    { method: 'PUT', body: JSON.stringify({ state, revision }) },
    token,
  );
}
