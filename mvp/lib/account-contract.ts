export const ACCOUNT_USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/;
export const ACCOUNT_PASSWORD_MIN_LENGTH = 12;
export const ACCOUNT_SESSION_STORAGE_KEY = 'all-in-life:session-token';

export type AccountUser = {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
};

export type AccountDataEnvelope = {
  state: Record<string, unknown>;
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
