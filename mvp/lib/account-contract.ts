export const ACCOUNT_USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/;
export const ACCOUNT_PASSWORD_MIN_LENGTH = 12;
export const ACCOUNT_SESSION_STORAGE_KEY = 'all-in-life:session-token';
export const ACCOUNT_AUTH_BODY_MAX_BYTES = 4_096;
export const ACCOUNT_STATE_MAX_BYTES = 750_000;
export const ACCOUNT_STATE_BODY_MAX_BYTES = 800_000;
export const ACCOUNT_LOGIN_RATE_LIMIT = 5;
export const ACCOUNT_REGISTER_RATE_LIMIT = 3;
export const ACCOUNT_RATE_LIMIT_WINDOW_MS = 60_000;

export function isAccountJsonContentType(value: string | null) {
  if (!value) return false;
  return value.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

export function parseAccountContentLength(value: string | null) {
  if (value === null) return { ok: true as const, bytes: null };
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return { ok: false as const };
  const bytes = Number(normalized);
  return Number.isSafeInteger(bytes) && bytes >= 0
    ? { ok: true as const, bytes }
    : { ok: false as const };
}

export type AccountUser = {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
};

export type AccountDataEnvelope = {
  state: Record<string, unknown>;
  revision: number;
  updatedAt: string | null;
};

export type AccountSessionResponse = {
  user: AccountUser;
  sessionToken: string;
  expiresAt: string;
  data: AccountDataEnvelope;
};

export type AccountMeResponse = {
  user: AccountUser;
  expiresAt: string;
  data: AccountDataEnvelope;
};

export type AccountApiError = {
  error: string;
  message: string;
};
