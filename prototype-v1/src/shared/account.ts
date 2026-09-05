import { z } from "zod";
import { DOT_COLORS, PREFS, TAGS } from "./records.ts";

export const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const MAX_ACCOUNT_IDS = 200;
export const MAX_REPORT_NOTE_LENGTH = 500;

const unique = <T>(values: T[]) => new Set(values).size === values.length;
const isoTimestampSchema = z.string().max(64).refine((value) => !Number.isNaN(Date.parse(value)), "invalid timestamp");
const candidateIdSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const candidateIdsSchema = z.array(candidateIdSchema).max(MAX_ACCOUNT_IDS).refine(unique, "candidate ids must be unique");
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const moneySchema = z.number().finite().int().min(0).max(100_000_000);

export const usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_PATTERN);
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
export const nicknameSchema = z.string().trim().min(1).max(30);

export const userSchema = z.strictObject({
  id: z.string().uuid(),
  username: usernameSchema,
  nickname: nicknameSchema,
});
export type User = z.infer<typeof userSchema>;

export const accountSettingsSchema = z.strictObject({
  monthly_budget: moneySchema.nullable(),
  spent: moneySchema,
  spent_month: monthSchema,
  survival: z.boolean(),
  exclude: z.array(z.enum(TAGS)).max(TAGS.length).refine(unique, "exclude values must be unique"),
  prefs: z.array(z.enum(PREFS)).max(PREFS.length).refine(unique, "preference values must be unique"),
  costco_ok: z.boolean(),
});
export type AccountSettings = z.infer<typeof accountSettingsSchema>;

// The API keeps nickname beside other profile fields for the client, but the server persists it only
// in users.nickname. account_data.profile stores color, preventing two nickname sources of truth.
export const accountProfileSchema = z.strictObject({
  nickname: nicknameSchema,
  color: z.enum(DOT_COLORS),
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

const accountDataValuesShape = {
  list: candidateIdsSchema,
  favs: candidateIdsSchema,
  settings: accountSettingsSchema,
  profile: accountProfileSchema,
};

export const accountDataUpdateSchema = z.strictObject({
  ...accountDataValuesShape,
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  // Informational only; revision is the atomic write precondition.
  updated_at: isoTimestampSchema.optional(),
});
export type AccountDataUpdate = z.infer<typeof accountDataUpdateSchema>;

export const accountDataSchema = z.strictObject({
  ...accountDataValuesShape,
  updated_at: isoTimestampSchema,
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type AccountData = z.infer<typeof accountDataSchema>;

export const authResponseSchema = z.strictObject({
  user: userSchema,
  session_token: z.string().min(32).max(256),
  expires_at: isoTimestampSchema,
  data: accountDataSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const authMeResponseSchema = z.strictObject({
  user: userSchema,
  data: accountDataSchema,
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const registerRequestSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  nickname: nicknameSchema.optional(),
});
export const loginRequestSchema = z.strictObject({
  // Login returns the same invalid-credentials response for bad account identifiers/passwords.
  // These broad bounds reject abusive bodies before any database or password-hash work.
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export const changePasswordRequestSchema = z.strictObject({
  current_password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  new_password: passwordSchema,
});

export const REPORT_REASONS = ["價格過期", "條件錯誤", "來源失效", "分類錯誤", "食安", "過敏", "身體不適"] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportRequestSchema = z.strictObject({
  reason: reportReasonSchema,
  note: z.string().trim().max(MAX_REPORT_NOTE_LENGTH).default(""),
});

export const reportSchema = z.strictObject({
  id: z.string().min(1),
  candidate_id: candidateIdSchema,
  reason: reportReasonSchema,
  note: z.string(),
  created_at: isoTimestampSchema,
  by: nicknameSchema,
});
export type CandidateReport = z.infer<typeof reportSchema>;

export const candidateParamSchema = candidateIdSchema;

export const currentAccountMonth = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" })
    .format(now).slice(0, 7);

export const defaultAccountSettings = (now = new Date()): AccountSettings => ({
  monthly_budget: null,
  spent: 0,
  spent_month: currentAccountMonth(now),
  survival: false,
  exclude: [],
  prefs: [],
  costco_ok: false,
});

export const defaultAccountProfile = (nickname = "使用者"): AccountProfile => ({ nickname, color: DOT_COLORS[3] });

export const defaultAccountData = (nickname = "使用者", now = new Date(), updatedAt = now.toISOString()): AccountData => ({
  list: [],
  favs: [],
  settings: defaultAccountSettings(now),
  profile: defaultAccountProfile(nickname),
  updated_at: updatedAt,
  revision: 0,
});

// Database jsonb defaults are intentionally `{}` for forward-compatible schema setup. This reader
// fills the client contract while dropping legacy/unknown keys (including a duplicated nickname).
export const accountDataFromStorage = (row: Record<string, unknown>, nickname: string): AccountData => {
  const defaults = defaultAccountData(nickname);
  const decodeJson = (value: unknown): unknown => {
    let decoded = value;
    // Bun 1.4 decodes normal jsonb values, but tolerate old rows that accidentally stored JSON text.
    for (let attempt = 0; attempt < 2 && typeof decoded === "string"; attempt += 1) {
      try { decoded = JSON.parse(decoded); } catch { break; }
    }
    return decoded;
  };
  const list = decodeJson(row.list);
  const favs = decodeJson(row.favs);
  const storedSettings = decodeJson(row.settings);
  const storedProfile = decodeJson(row.profile);
  const settings = storedSettings && typeof storedSettings === "object" ? storedSettings as Record<string, unknown> : {};
  const profile = storedProfile && typeof storedProfile === "object" ? storedProfile as Record<string, unknown> : {};
  const timestamp = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;

  return accountDataSchema.parse({
    list: Array.isArray(list) ? list : defaults.list,
    favs: Array.isArray(favs) ? favs : defaults.favs,
    settings: {
      monthly_budget: settings.monthly_budget ?? defaults.settings.monthly_budget,
      spent: settings.spent ?? defaults.settings.spent,
      spent_month: settings.spent_month ?? defaults.settings.spent_month,
      survival: settings.survival ?? defaults.settings.survival,
      exclude: settings.exclude ?? defaults.settings.exclude,
      prefs: settings.prefs ?? defaults.settings.prefs,
      costco_ok: settings.costco_ok ?? defaults.settings.costco_ok,
    },
    profile: { nickname, color: profile.color ?? defaults.profile.color },
    updated_at: timestamp ?? defaults.updated_at,
    revision: Number(row.revision ?? 0),
  });
};
