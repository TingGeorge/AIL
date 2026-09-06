import {
  AI_CATEGORY_KEYS,
  AI_VERIFIED_FIELDS,
  parseResultsExplainRequest,
  type AiCategoryKey,
  type ExplainCandidateFacts,
  type ResultsExplainRequest,
} from './ai-contract.ts';
import type { CatalogItem } from './catalog-contract.ts';
import type { CatalogSearchOptions } from './catalog-server.ts';

export type PublicExplainSearch = {
  category: AiCategoryKey | 'ALL';
  origin: { latitude: number; longitude: number };
  radiusM: number;
  at: string;
  eventWindowDays: number;
  freeOnly: boolean;
  hardExclusions: string[];
  softPreferences: string[];
};

export type PublicResultsExplainRequest = {
  locale: string;
  candidateIds: string[];
  search: PublicExplainSearch;
};

export type PublicExplainContractResult =
  | { ok: true; value: PublicResultsExplainRequest }
  | {
      ok: false;
      error: {
        code: 'INVALID_BODY';
        message: string;
      };
    };

export type TrustedExplainResolution =
  | { ok: true; value: ResultsExplainRequest }
  | {
      ok: false;
      error: {
        code: 'CANDIDATE_UNAVAILABLE';
        message: string;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}

function cleanString(value: unknown, maximumLength: number) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length >= 1 && cleaned.length <= maximumLength
    ? cleaned
    : null;
}

function cleanStringArray(
  value: unknown,
  maximumItems: number,
  maximumItemLength = 120,
) {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const cleaned = value.map((item) => cleanString(item, maximumItemLength));
  if (cleaned.some((item) => item === null)) return null;
  return [...new Set(cleaned as string[])];
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function numberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validRfc3339(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) && !Number.isNaN(new Date(value).getTime())
  );
}

function invalidBody(message: string): PublicExplainContractResult {
  return { ok: false, error: { code: 'INVALID_BODY', message } };
}

export function parsePublicResultsExplainRequest(
  input: unknown,
): PublicExplainContractResult {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['locale', 'candidateIds', 'search'])
  ) {
    return invalidBody('Request body must match the public explain contract.');
  }
  const locale = cleanString(input.locale, 20);
  const candidateIds = cleanStringArray(input.candidateIds, 3, 160);
  if (
    !locale ||
    !candidateIds ||
    candidateIds.length < 1 ||
    candidateIds.length !== (input.candidateIds as unknown[]).length
  ) {
    return invalidBody('candidateIds must contain 1 to 3 unique ids.');
  }

  if (
    !isRecord(input.search) ||
    !hasExactKeys(input.search, [
      'category',
      'origin',
      'radiusM',
      'at',
      'eventWindowDays',
      'freeOnly',
      'hardExclusions',
      'softPreferences',
    ]) ||
    !isRecord(input.search.origin) ||
    !hasExactKeys(input.search.origin, ['latitude', 'longitude'])
  ) {
    return invalidBody('search must contain the complete catalog query.');
  }

  const category = input.search.category;
  const latitude = input.search.origin.latitude;
  const longitude = input.search.origin.longitude;
  const at = cleanString(input.search.at, 64);
  const hardExclusions = cleanStringArray(input.search.hardExclusions, 20);
  const softPreferences = cleanStringArray(input.search.softPreferences, 20);
  if (
    (category !== 'ALL' &&
      (typeof category !== 'string' ||
        !AI_CATEGORY_KEYS.includes(category as AiCategoryKey))) ||
    !numberInRange(latitude, -90, 90) ||
    !numberInRange(longitude, -180, 180) ||
    !integerInRange(input.search.radiusM, 500, 2_000) ||
    !at ||
    !validRfc3339(at) ||
    !integerInRange(input.search.eventWindowDays, 1, 30) ||
    typeof input.search.freeOnly !== 'boolean' ||
    !hardExclusions ||
    !softPreferences
  ) {
    return invalidBody('search contains an invalid value.');
  }

  return {
    ok: true,
    value: {
      locale,
      candidateIds,
      search: {
        category: category as AiCategoryKey | 'ALL',
        origin: { latitude, longitude },
        radiusM: input.search.radiusM,
        at,
        eventWindowDays: input.search.eventWindowDays,
        freeOnly: input.search.freeOnly,
        hardExclusions,
        softPreferences,
      },
    },
  };
}

export function catalogOptionsForExplain(
  request: PublicResultsExplainRequest,
  serverNow: Date,
): CatalogSearchOptions {
  return {
    category: request.search.category,
    origin: request.search.origin,
    radiusM: request.search.radiusM,
    at: new Date(request.search.at),
    serverNow,
    eventWindowDays: request.search.eventWindowDays,
    freeOnly: request.search.freeOnly,
    limit: 100,
  };
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function matchingValues(values: string[], requested: string[]) {
  const available = new Map(values.map((value) => [normalized(value), value]));
  return requested.filter((value) => available.has(normalized(value)));
}

function validCatalogInteger(value: number | null, maximum: number) {
  return (
    value === null ||
    (Number.isSafeInteger(value) && value >= 0 && value <= maximum)
  );
}

function safeSchedule(item: CatalogItem) {
  if (!item.verification.fields.includes('schedule')) return null;
  const { startsAt, endsAt } = item.availability;
  if (
    !startsAt ||
    !endsAt ||
    !validRfc3339(startsAt) ||
    !validRfc3339(endsAt)
  ) {
    return null;
  }
  return `${startsAt} ～ ${endsAt}`;
}

function unavailable(): TrustedExplainResolution {
  return {
    ok: false,
    error: {
      code: 'CANDIDATE_UNAVAILABLE',
      message: '候選資料已變更或不再符合條件，請重新搜尋。',
    },
  };
}

export function rebuildTrustedExplainRequest(
  request: PublicResultsExplainRequest,
  catalogItems: CatalogItem[],
): TrustedExplainResolution {
  const hardExclusions = new Set(request.search.hardExclusions.map(normalized));
  const trustedItems: ExplainCandidateFacts[] = [];

  for (const id of request.candidateIds) {
    const matches = catalogItems.filter((item) => item.id === id);
    if (matches.length !== 1) return unavailable();
    const item = matches[0];
    if (item.tags.some((tag) => hardExclusions.has(normalized(tag)))) {
      return unavailable();
    }
    if (
      (request.search.category !== 'ALL' &&
        item.categoryKey !== request.search.category) ||
      (request.search.freeOnly && item.cost.state !== 'FREE') ||
      (item.distanceM !== null && item.distanceM > request.search.radiusM) ||
      !validCatalogInteger(item.cost.amountTwd, 10_000_000) ||
      !validCatalogInteger(item.distanceM, 2_000) ||
      !item.verification.fields.every((field) =>
        AI_VERIFIED_FIELDS.includes(field),
      )
    ) {
      return unavailable();
    }

    const tags = item.tags
      .map((tag) => cleanString(tag, 120))
      .filter((tag): tag is string => tag !== null);
    const verificationLabel = cleanString(item.verification.label, 160);
    if (tags.length !== item.tags.length || !verificationLabel) {
      return unavailable();
    }
    const cautions = [
      item.cost.state === 'UNKNOWN' ? item.cost.reason : null,
      item.verification.status === 'PARTIAL' ? item.condition : null,
      safeSchedule(item) === null ? item.availability.text : null,
    ]
      .map((value) => (value === null ? null : cleanString(value, 240)))
      .filter((value): value is string => value !== null);

    trustedItems.push({
      id: item.id,
      category: item.categoryKey,
      title: item.title,
      costTwd: item.cost.amountTwd,
      distanceM: item.distanceM,
      schedule: safeSchedule(item),
      hardConstraintsPassed: true as const,
      tags,
      verification: {
        status: item.verification.status,
        label: verificationLabel,
        fields: [...item.verification.fields],
      },
      preferenceMatches: matchingValues(tags, request.search.softPreferences),
      cpDimensions: {
        price: null,
        food: null,
        quality: null,
        convenience: null,
        discount: null,
      },
      cautions: [...new Set(cautions)].slice(0, 12),
    });
  }

  const parsed = parseResultsExplainRequest({
    locale: request.locale,
    items: trustedItems,
  });
  return parsed.ok ? parsed : unavailable();
}
