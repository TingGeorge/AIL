export const TEAM_REQUEST_BODY_MAX_BYTES = 16_384;
export const TEAM_INVITE_TTL_MS = 72 * 60 * 60 * 1_000;
export const TEAM_DEFAULT_INVITE_MAX_USES = 10;
export const TEAM_MAX_INVITE_USES = 50;
export const TEAM_MAX_CAMPAIGN_DAYS = 90;

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type TeamStatus = 'ACTIVE' | 'ARCHIVED';
export type CampaignStatus =
  | 'OPEN'
  | 'THRESHOLD_MET'
  | 'CLOSED'
  | 'CANCELLED'
  | 'EXPIRED';
export type CommitmentStatus = 'PLEDGED' | 'CONFIRMED' | 'WITHDRAWN';

export type TeamDto = {
  id: string;
  name: string;
  status: TeamStatus;
  role: TeamRole;
  memberCount: number;
  activeCampaignCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type TeamInviteDto = {
  id: string;
  teamId: string;
  token: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
};

export type RedeemedInviteDto = {
  team: TeamDto;
  joined: boolean;
};

export type CampaignOfferDto = {
  id: string;
  catalogItemId: string;
  type: string;
  title: string;
  regularPriceTwd: number | null;
  offerPriceTwd: number | null;
  verificationStatus: string;
};

export type CampaignProgressDto = {
  pledgedPeople: number;
  pledgedQuantity: number;
  targetPeople: number;
  targetQuantity: number | null;
  thresholdMet: boolean;
};

export type TeamCommitmentDto = {
  quantity: number;
  maxCostTwd: number | null;
  status: CommitmentStatus;
  updatedAt: string;
};

export type TeamCampaignDto = {
  id: string;
  teamId: string;
  title: string;
  status: CampaignStatus;
  deadline: string;
  version: number;
  offer: CampaignOfferDto;
  pricingVerified: boolean;
  progress: CampaignProgressDto;
  myCommitment: TeamCommitmentDto | null;
};

export type CreateTeamInput = { name: string };
export type CreateInviteInput = { maxUses: number };
export type RedeemInviteInput = { token: string };
export type CreateCampaignInput = {
  offerId: string | null;
  catalogItemId: string | null;
  title: string;
  targetPeople: number;
  targetQuantity: number | null;
  deadline: string;
};
export type UpsertCommitmentInput = {
  quantity: number;
  maxCostTwd: number | null;
};
export type CommitmentMutationInput =
  | ({ action: 'PLEDGE' } & UpsertCommitmentInput)
  | { action: 'WITHDRAW' };

export class TeamContractError extends Error {
  readonly code = 'invalid_team_input';
}

function invalid(message: string): never {
  throw new TeamContractError(message);
}

function strictRecord(input: unknown, allowedKeys: readonly string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid('請求內容必須是 JSON object。');
  }
  const record = input as Record<string, unknown>;
  const extras = Object.keys(record).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (extras.length > 0) {
    return invalid(`不支援的欄位：${extras.join(', ')}。`);
  }
  return record;
}

function boundedText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== 'string') return invalid(`${label}必須是文字。`);
  const normalized = value.trim();
  let hasControlCharacter = false;
  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) {
      hasControlCharacter = true;
      break;
    }
  }
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    hasControlCharacter
  ) {
    return invalid(`${label}長度或格式不正確。`);
  }
  return normalized;
}

function identifier(value: unknown, label: string) {
  return boundedText(value, label, 1, 200);
}

export function rawPlaceIdFromCatalogItemId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^PLACE:[A-Za-z0-9_.:-]{1,148}$/u.test(value)
  ) {
    return invalid('catalogItemId 必須是有效的 PLACE:<id> 格式。');
  }
  return value.slice('PLACE:'.length);
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalid(`${label}必須是 ${minimum}–${maximum} 的整數。`);
  }
  return value;
}

function optionalInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || value === null) return null;
  return boundedInteger(value, label, minimum, maximum);
}

function rfc3339(value: unknown) {
  if (typeof value !== 'string') {
    return invalid('deadline 必須是含時區的 RFC3339 時間。');
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (!match) {
    return invalid('deadline 必須是含時區的 RFC3339 時間。');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return invalid('deadline 時間不正確。');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return invalid('deadline 時間不正確。');
  }
  return new Date(timestamp).toISOString();
}

export function parseCreateTeamInput(input: unknown): CreateTeamInput {
  const record = strictRecord(input, ['name']);
  return { name: boundedText(record.name, 'name', 1, 60) };
}

export function parseCreateInviteInput(input: unknown): CreateInviteInput {
  const record = strictRecord(input, ['maxUses']);
  return {
    maxUses:
      record.maxUses === undefined
        ? TEAM_DEFAULT_INVITE_MAX_USES
        : boundedInteger(record.maxUses, 'maxUses', 1, TEAM_MAX_INVITE_USES),
  };
}

export function parseRedeemInviteInput(input: unknown): RedeemInviteInput {
  const record = strictRecord(input, ['token']);
  const token = boundedText(record.token, 'token', 43, 43);
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) {
    return invalid('token 格式不正確。');
  }
  return { token };
}

export function parseCreateCampaignInput(input: unknown): CreateCampaignInput {
  const record = strictRecord(input, [
    'offerId',
    'catalogItemId',
    'title',
    'targetPeople',
    'targetQuantity',
    'deadline',
  ]);
  const hasOffer = record.offerId !== undefined && record.offerId !== null;
  const hasCatalogItem =
    record.catalogItemId !== undefined && record.catalogItemId !== null;
  if (hasOffer === hasCatalogItem) {
    return invalid('offerId 與 catalogItemId 必須且只能提供一個。');
  }
  return {
    offerId: hasOffer ? identifier(record.offerId, 'offerId') : null,
    catalogItemId: hasCatalogItem
      ? `PLACE:${rawPlaceIdFromCatalogItemId(record.catalogItemId)}`
      : null,
    title: boundedText(record.title, 'title', 1, 120),
    targetPeople: boundedInteger(record.targetPeople, 'targetPeople', 2, 50),
    targetQuantity: optionalInteger(
      record.targetQuantity,
      'targetQuantity',
      1,
      10_000,
    ),
    deadline: rfc3339(record.deadline),
  };
}

export function parseUpsertCommitmentInput(
  input: unknown,
): UpsertCommitmentInput {
  const record = strictRecord(input, ['quantity', 'maxCostTwd']);
  return {
    quantity:
      record.quantity === undefined
        ? 1
        : boundedInteger(record.quantity, 'quantity', 1, 10_000),
    maxCostTwd: optionalInteger(record.maxCostTwd, 'maxCostTwd', 0, 10_000_000),
  };
}

export function parseCommitmentMutationInput(
  input: unknown,
): CommitmentMutationInput {
  const record = strictRecord(input, ['action', 'quantity', 'maxCostTwd']);
  if (record.action === 'WITHDRAW') {
    if (record.quantity !== undefined || record.maxCostTwd !== undefined) {
      return invalid('WITHDRAW 不接受 quantity 或 maxCostTwd。');
    }
    return { action: 'WITHDRAW' };
  }
  if (record.action !== undefined && record.action !== 'PLEDGE') {
    return invalid('action 必須是 PLEDGE 或 WITHDRAW。');
  }
  const pledge = parseUpsertCommitmentInput({
    ...(record.quantity === undefined ? {} : { quantity: record.quantity }),
    ...(record.maxCostTwd === undefined
      ? {}
      : { maxCostTwd: record.maxCostTwd }),
  });
  return { action: 'PLEDGE', ...pledge };
}

export function pledgeInputFromMutation(
  input: CommitmentMutationInput,
): UpsertCommitmentInput | null {
  if (input.action !== 'PLEDGE') return null;
  return {
    quantity: input.quantity,
    maxCostTwd: input.maxCostTwd,
  };
}
