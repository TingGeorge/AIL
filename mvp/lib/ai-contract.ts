export const AI_CATEGORY_KEYS = [
  'FOOD',
  'DAILY_GOODS',
  'FREE_RESOURCE',
  'EVENT',
  'TRANSPORT',
] as const;

export const AI_MOBILITY_OPTIONS = [
  'WALK',
  'BIKE',
  'TRANSIT',
  'CAR',
  'TAXI',
] as const;

export const AI_MISSING_FIELDS = [
  'date',
  'time',
  'category',
  'budgetTwd',
  'partySize',
  'maxDistanceM',
] as const;

export const AI_CP_DIMENSIONS = [
  'price',
  'food',
  'quality',
  'convenience',
  'discount',
] as const;

export const AI_VERIFIED_FIELDS = [
  'identity',
  'location',
  'schedule',
  'cost',
  'realtimeAvailability',
] as const;

export const AI_EXPLANATION_REASON_CODES = [
  'NO_KNOWN_CONFLICT',
  'FREE_COST',
  'KNOWN_COST',
  'SHORT_DISTANCE',
  'PREFERENCE_MATCH',
  'SCHEDULE_KNOWN',
  'PRICE_VALUE',
  'FOOD_FIT',
  'QUALITY_FIT',
  'CONVENIENCE_FIT',
  'DISCOUNT_VALUE',
  'VERIFIED_SOURCE',
] as const;

export type AiCategoryKey = (typeof AI_CATEGORY_KEYS)[number];
export type AiMobility = (typeof AI_MOBILITY_OPTIONS)[number];
export type AiMissingField = (typeof AI_MISSING_FIELDS)[number];
export type AiCpDimension = (typeof AI_CP_DIMENSIONS)[number];
export type AiVerifiedField = (typeof AI_VERIFIED_FIELDS)[number];
export type AiExplanationReasonCode =
  (typeof AI_EXPLANATION_REASON_CODES)[number];

export type SearchConstraints = {
  query: string;
  date: string | null;
  time: string | null;
  category: AiCategoryKey | null;
  budgetTwd: number | null;
  partySize: number | null;
  maxDistanceM: number | null;
  hardExclusions: string[];
  softPreferences: string[];
  mobility: AiMobility[];
};

export type SearchParseRequest = {
  query: string;
  locale: string;
  timezone: string;
  defaults: Omit<SearchConstraints, 'query'>;
};

export type SearchParseModelOutput = {
  constraints: SearchConstraints;
  assumptions: string[];
  missingFields: AiMissingField[];
  confidence: number;
};

export type AiUnavailableError = {
  code: 'AI_UNAVAILABLE';
  message: string;
};

export type SearchParseResponse = SearchParseModelOutput & {
  ok: boolean;
  source: 'gemini' | 'fallback';
  error: AiUnavailableError | null;
};

export type ExplainCandidateFacts = {
  id: string;
  category: AiCategoryKey;
  title: string;
  costTwd: number | null;
  distanceM: number | null;
  schedule: string | null;
  hardConstraintsPassed: true;
  tags: string[];
  verification: {
    status: 'VERIFIED' | 'PARTIAL';
    label: string;
    fields: AiVerifiedField[];
  };
  preferenceMatches: string[];
  cpDimensions: Record<AiCpDimension, number | null>;
  cautions: string[];
};

export type ResultsExplainRequest = {
  locale: string;
  items: ExplainCandidateFacts[];
};

export type ExplainedItem = {
  id: string;
  headline: string;
  reasons: string[];
  caution: string | null;
};

export type ExplanationSelection = {
  id: string;
  reasonCodes: AiExplanationReasonCode[];
};

export type ResultsExplainModelOutput = {
  items: ExplanationSelection[];
};

export type ResultsExplainResponse = {
  ok: boolean;
  source: 'gemini' | 'fallback';
  items: ExplainedItem[];
  error: AiUnavailableError | null;
};

export type ContractError = {
  code: 'INVALID_BODY';
  message: string;
};

export type ContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ContractError };

const categoryEnum = [...AI_CATEGORY_KEYS];
const mobilityEnum = [...AI_MOBILITY_OPTIONS];

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

const nullableIntegerSchema = (minimum: number, maximum: number) => ({
  anyOf: [{ type: 'integer', minimum, maximum }, { type: 'null' }],
});

const stringArraySchema = (maximumItems: number) => ({
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 120 },
  maxItems: maximumItems,
});

const searchConstraintsProperties = {
  query: { type: 'string', minLength: 1, maxLength: 500 },
  date: nullableStringSchema,
  time: nullableStringSchema,
  category: {
    anyOf: [{ type: 'string', enum: categoryEnum }, { type: 'null' }],
  },
  budgetTwd: nullableIntegerSchema(0, 10_000_000),
  partySize: nullableIntegerSchema(1, 10),
  maxDistanceM: nullableIntegerSchema(500, 2_000),
  hardExclusions: stringArraySchema(20),
  softPreferences: stringArraySchema(20),
  mobility: {
    type: 'array',
    items: { type: 'string', enum: mobilityEnum },
    maxItems: AI_MOBILITY_OPTIONS.length,
  },
} as const;

export const searchParseOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['constraints', 'assumptions', 'missingFields', 'confidence'],
  properties: {
    constraints: {
      type: 'object',
      additionalProperties: false,
      required: [
        'query',
        'date',
        'time',
        'category',
        'budgetTwd',
        'partySize',
        'maxDistanceM',
        'hardExclusions',
        'softPreferences',
        'mobility',
      ],
      properties: searchConstraintsProperties,
    },
    assumptions: stringArraySchema(12),
    missingFields: {
      type: 'array',
      items: { type: 'string', enum: [...AI_MISSING_FIELDS] },
      maxItems: AI_MISSING_FIELDS.length,
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

export const resultsExplainOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'reasonCodes'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 160 },
          reasonCodes: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'string',
              enum: [...AI_EXPLANATION_REASON_CODES],
            },
          },
        },
      },
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isFiniteIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function nullableInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (value === null || value === undefined) return value;
  return isFiniteIntegerInRange(value, minimum, maximum) ? value : undefined;
}

function cleanString(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > maximumLength) return undefined;
  return cleaned;
}

function cleanNullableString(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  return cleanString(value, maximumLength);
}

function cleanStringArray(
  value: unknown,
  maximumItems: number,
  maximumItemLength = 120,
): string[] | undefined {
  if (!Array.isArray(value) || value.length > maximumItems) return undefined;
  const cleaned = value.map((item) => cleanString(item, maximumItemLength));
  if (cleaned.some((item) => item === undefined)) return undefined;
  return [...new Set(cleaned as string[])];
}

function optionalStringArray(
  value: unknown,
  maximumItems: number,
  maximumItemLength = 120,
) {
  return value === undefined
    ? []
    : cleanStringArray(value, maximumItems, maximumItemLength);
}

function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

function isTimeString(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function cleanDateOrTime(
  value: unknown,
  validator: (candidate: string) => boolean,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  const cleaned = cleanString(value, 10);
  return cleaned && validator(cleaned) ? cleaned : undefined;
}

function cleanCategory(value: unknown): AiCategoryKey | null | undefined {
  if (value === null || value === undefined) return value;
  return typeof value === 'string' &&
    AI_CATEGORY_KEYS.includes(value as AiCategoryKey)
    ? (value as AiCategoryKey)
    : undefined;
}

function cleanMobility(value: unknown): AiMobility[] | undefined {
  if (!Array.isArray(value) || value.length > AI_MOBILITY_OPTIONS.length) {
    return undefined;
  }
  if (
    !value.every(
      (item) =>
        typeof item === 'string' &&
        AI_MOBILITY_OPTIONS.includes(item as AiMobility),
    )
  ) {
    return undefined;
  }
  return [...new Set(value as AiMobility[])];
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('zh-TW', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const defaultConstraintKeys = [
  'date',
  'time',
  'category',
  'budgetTwd',
  'partySize',
  'maxDistanceM',
  'hardExclusions',
  'softPreferences',
  'mobility',
] as const;

export function parseSearchParseRequest(
  input: unknown,
): ContractResult<SearchParseRequest> {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['query', 'locale', 'timezone', 'defaults'])
  ) {
    return invalidBody('Request body contains unsupported fields.');
  }

  const query = cleanString(input.query, 500);
  const locale =
    input.locale === undefined ? 'zh-TW' : cleanString(input.locale, 20);
  const timezone =
    input.timezone === undefined
      ? 'Asia/Taipei'
      : cleanString(input.timezone, 64);
  if (!query) return invalidBody('query must contain 1 to 500 characters.');
  if (!locale) return invalidBody('locale is invalid.');
  if (!timezone || !validTimezone(timezone)) {
    return invalidBody('timezone must be a valid IANA timezone.');
  }

  const rawDefaults = input.defaults ?? {};
  if (
    !isRecord(rawDefaults) ||
    !hasOnlyKeys(rawDefaults, defaultConstraintKeys)
  ) {
    return invalidBody('defaults contains unsupported fields.');
  }

  const date =
    rawDefaults.date === undefined
      ? null
      : cleanDateOrTime(rawDefaults.date, isDateString);
  const time =
    rawDefaults.time === undefined
      ? null
      : cleanDateOrTime(rawDefaults.time, isTimeString);
  const category =
    rawDefaults.category === undefined
      ? null
      : cleanCategory(rawDefaults.category);
  const budgetTwd =
    rawDefaults.budgetTwd === undefined
      ? null
      : nullableInteger(rawDefaults.budgetTwd, 0, 10_000_000);
  const partySize =
    rawDefaults.partySize === undefined
      ? null
      : nullableInteger(rawDefaults.partySize, 1, 10);
  const maxDistanceM =
    rawDefaults.maxDistanceM === undefined
      ? null
      : nullableInteger(rawDefaults.maxDistanceM, 500, 2_000);
  const hardExclusions = optionalStringArray(rawDefaults.hardExclusions, 20);
  const softPreferences = optionalStringArray(rawDefaults.softPreferences, 20);
  const mobility =
    rawDefaults.mobility === undefined
      ? []
      : cleanMobility(rawDefaults.mobility);

  if (
    date === undefined ||
    time === undefined ||
    category === undefined ||
    budgetTwd === undefined ||
    partySize === undefined ||
    maxDistanceM === undefined ||
    hardExclusions === undefined ||
    softPreferences === undefined ||
    mobility === undefined
  ) {
    return invalidBody('defaults contains an invalid value.');
  }

  return {
    ok: true,
    value: {
      query,
      locale,
      timezone,
      defaults: {
        date: date ?? null,
        time: time ?? null,
        category: category ?? null,
        budgetTwd: budgetTwd ?? null,
        partySize: partySize ?? null,
        maxDistanceM: maxDistanceM ?? null,
        hardExclusions,
        softPreferences,
        mobility,
      },
    },
  };
}

function invalidBody(message: string): ContractResult<never> {
  return { ok: false, error: { code: 'INVALID_BODY', message } };
}

function parseSearchConstraints(value: unknown): SearchConstraints | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['query', ...defaultConstraintKeys]) ||
    Object.keys(value).length !== defaultConstraintKeys.length + 1
  ) {
    return null;
  }
  const query = cleanString(value.query, 500);
  const date = cleanDateOrTime(value.date, isDateString);
  const time = cleanDateOrTime(value.time, isTimeString);
  const category = cleanCategory(value.category);
  const budgetTwd = nullableInteger(value.budgetTwd, 0, 10_000_000);
  const partySize = nullableInteger(value.partySize, 1, 10);
  const maxDistanceM = nullableInteger(value.maxDistanceM, 500, 2_000);
  const hardExclusions = cleanStringArray(value.hardExclusions, 20);
  const softPreferences = cleanStringArray(value.softPreferences, 20);
  const mobility = cleanMobility(value.mobility);
  if (
    !query ||
    date === undefined ||
    time === undefined ||
    category === undefined ||
    budgetTwd === undefined ||
    partySize === undefined ||
    maxDistanceM === undefined ||
    !hardExclusions ||
    !softPreferences ||
    !mobility
  ) {
    return null;
  }
  return {
    query,
    date,
    time,
    category,
    budgetTwd,
    partySize,
    maxDistanceM,
    hardExclusions,
    softPreferences,
    mobility,
  };
}

export function validateSearchParseModelOutput(
  input: unknown,
  request: SearchParseRequest,
): SearchParseModelOutput | null {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      'constraints',
      'assumptions',
      'missingFields',
      'confidence',
    ]) ||
    Object.keys(input).length !== 4
  ) {
    return null;
  }
  const constraints = parseSearchConstraints(input.constraints);
  const assumptions = cleanStringArray(input.assumptions, 12);
  const missingFields = cleanStringArray(
    input.missingFields,
    AI_MISSING_FIELDS.length,
  );
  if (
    !constraints ||
    !assumptions ||
    !missingFields ||
    !missingFields.every((field) =>
      AI_MISSING_FIELDS.includes(field as AiMissingField),
    ) ||
    typeof input.confidence !== 'number' ||
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    return null;
  }

  const normalizedMissingFields = missingFields as AiMissingField[];
  for (const field of AI_MISSING_FIELDS) {
    const isMissing = constraints[field] === null;
    if (isMissing !== normalizedMissingFields.includes(field)) return null;
  }

  const hardExclusions = [
    ...new Set([
      ...request.defaults.hardExclusions,
      ...constraints.hardExclusions,
    ]),
  ].slice(0, 20);
  const hardExclusionKeys = new Set(
    hardExclusions.map((exclusion) => exclusion.toLowerCase()),
  );
  const softPreferences = constraints.softPreferences.filter(
    (preference) => !hardExclusionKeys.has(preference.toLowerCase()),
  );

  return {
    constraints: {
      ...constraints,
      query: request.query,
      hardExclusions,
      softPreferences,
    },
    assumptions,
    missingFields: normalizedMissingFields,
    confidence: input.confidence,
  };
}

export function createSearchParseFallback(
  request: SearchParseRequest,
): SearchParseResponse {
  const constraints = { query: request.query, ...request.defaults };
  return {
    ok: false,
    source: 'fallback',
    constraints,
    assumptions: [],
    missingFields: AI_MISSING_FIELDS.filter(
      (field) => constraints[field] === null,
    ),
    confidence: 0,
    error: {
      code: 'AI_UNAVAILABLE',
      message: 'AI 暫時無法使用，已保留目前條件，仍可手動繼續。',
    },
  };
}

const explainItemKeys = [
  'id',
  'category',
  'title',
  'costTwd',
  'distanceM',
  'schedule',
  'hardConstraintsPassed',
  'tags',
  'verification',
  'preferenceMatches',
  'cpDimensions',
  'cautions',
] as const;

function parseExplainCandidate(value: unknown): ExplainCandidateFacts | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, explainItemKeys) ||
    Object.keys(value).length !== explainItemKeys.length
  ) {
    return null;
  }
  const id = cleanString(value.id, 160);
  const category = cleanCategory(value.category);
  const title = cleanString(value.title, 160);
  const costTwd = nullableInteger(value.costTwd, 0, 10_000_000);
  const distanceM = nullableInteger(value.distanceM, 0, 2_000);
  const schedule = cleanNullableString(value.schedule, 240);
  const preferenceMatches = cleanStringArray(value.preferenceMatches, 20);
  const tags = cleanStringArray(value.tags, 40);
  const cautions = cleanStringArray(value.cautions, 12, 240);
  if (
    !id ||
    !category ||
    !title ||
    costTwd === undefined ||
    distanceM === undefined ||
    schedule === undefined ||
    value.hardConstraintsPassed !== true ||
    !tags ||
    !preferenceMatches ||
    !cautions ||
    !isRecord(value.cpDimensions) ||
    !hasOnlyKeys(value.cpDimensions, AI_CP_DIMENSIONS) ||
    Object.keys(value.cpDimensions).length !== AI_CP_DIMENSIONS.length
  ) {
    return null;
  }

  if (
    !isRecord(value.verification) ||
    !hasOnlyKeys(value.verification, ['status', 'label', 'fields']) ||
    Object.keys(value.verification).length !== 3 ||
    (value.verification.status !== 'VERIFIED' &&
      value.verification.status !== 'PARTIAL')
  ) {
    return null;
  }
  const verificationLabel = cleanString(value.verification.label, 160);
  const verificationFields = cleanStringArray(
    value.verification.fields,
    AI_VERIFIED_FIELDS.length,
    40,
  );
  if (
    !verificationLabel ||
    !verificationFields ||
    !verificationFields.every((field) =>
      AI_VERIFIED_FIELDS.includes(field as AiVerifiedField),
    )
  ) {
    return null;
  }

  const cpDimensions = {} as Record<AiCpDimension, number | null>;
  for (const dimension of AI_CP_DIMENSIONS) {
    const score = value.cpDimensions[dimension];
    if (
      score !== null &&
      (typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > 100)
    ) {
      return null;
    }
    cpDimensions[dimension] = score as number | null;
  }
  return {
    id,
    category,
    title,
    costTwd,
    distanceM,
    schedule,
    hardConstraintsPassed: true,
    tags,
    verification: {
      status: value.verification.status,
      label: verificationLabel,
      fields: verificationFields as AiVerifiedField[],
    },
    preferenceMatches,
    cpDimensions,
    cautions,
  };
}

export function parseResultsExplainRequest(
  input: unknown,
): ContractResult<ResultsExplainRequest> {
  if (!isRecord(input) || !hasOnlyKeys(input, ['locale', 'items'])) {
    return invalidBody('Request body contains unsupported fields.');
  }
  const locale =
    input.locale === undefined ? 'zh-TW' : cleanString(input.locale, 20);
  if (
    !locale ||
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 3
  ) {
    return invalidBody('items must contain 1 to 3 eligible candidates.');
  }
  const items = input.items.map(parseExplainCandidate);
  if (items.some((item) => item === null)) {
    return invalidBody('Every item must contain valid candidate facts.');
  }
  const normalized = items as ExplainCandidateFacts[];
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) {
    return invalidBody('Candidate ids must be unique.');
  }
  return { ok: true, value: { locale, items: normalized } };
}

function cleanExplanationSelection(
  value: unknown,
): ExplanationSelection | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['id', 'reasonCodes']) ||
    Object.keys(value).length !== 2
  ) {
    return null;
  }
  const id = cleanString(value.id, 160);
  const reasonCodes = cleanStringArray(value.reasonCodes, 3, 40);
  if (
    !id ||
    !reasonCodes ||
    reasonCodes.length < 1 ||
    !reasonCodes.every((code) =>
      AI_EXPLANATION_REASON_CODES.includes(code as AiExplanationReasonCode),
    )
  ) {
    return null;
  }
  return { id, reasonCodes: reasonCodes as AiExplanationReasonCode[] };
}

function eligibleReasonCodes(
  item: ExplainCandidateFacts,
): AiExplanationReasonCode[] {
  const eligible: AiExplanationReasonCode[] = ['NO_KNOWN_CONFLICT'];
  if (item.costTwd === 0) eligible.push('FREE_COST');
  else if (item.costTwd !== null) eligible.push('KNOWN_COST');
  if (item.distanceM !== null && item.distanceM <= 1_000) {
    eligible.push('SHORT_DISTANCE');
  }
  if (item.preferenceMatches.length > 0) eligible.push('PREFERENCE_MATCH');
  if (item.schedule !== null) eligible.push('SCHEDULE_KNOWN');
  if ((item.cpDimensions.price ?? 0) >= 70) eligible.push('PRICE_VALUE');
  if ((item.cpDimensions.food ?? 0) >= 70) eligible.push('FOOD_FIT');
  if ((item.cpDimensions.quality ?? 0) >= 70) eligible.push('QUALITY_FIT');
  if ((item.cpDimensions.convenience ?? 0) >= 70) {
    eligible.push('CONVENIENCE_FIT');
  }
  if ((item.cpDimensions.discount ?? 0) >= 70) {
    eligible.push('DISCOUNT_VALUE');
  }
  if (
    item.verification.status === 'VERIFIED' &&
    item.verification.fields.length > 0
  ) {
    eligible.push('VERIFIED_SOURCE');
  }
  return eligible;
}

export function validateResultsExplainModelOutput(
  input: unknown,
  request: ResultsExplainRequest,
): ResultsExplainModelOutput | null {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['items']) ||
    Object.keys(input).length !== 1 ||
    !Array.isArray(input.items) ||
    input.items.length !== request.items.length
  ) {
    return null;
  }
  const items = input.items.map(cleanExplanationSelection);
  if (items.some((item) => item === null)) return null;
  const normalized = items as ExplanationSelection[];
  if (
    !normalized.every((item, index) => {
      if (item.id !== request.items[index].id) return false;
      const eligible = eligibleReasonCodes(request.items[index]);
      return item.reasonCodes.every((code) => eligible.includes(code));
    })
  ) {
    return null;
  }
  return { items: normalized };
}

function reasonText(
  code: AiExplanationReasonCode,
  item: ExplainCandidateFacts,
) {
  switch (code) {
    case 'NO_KNOWN_CONFLICT':
      return '未命中目前資料標記；現場條件仍需自行確認';
    case 'FREE_COST':
      return '已知費用為免費';
    case 'KNOWN_COST':
      return `已知費用為 NT$${item.costTwd}`;
    case 'SHORT_DISTANCE':
      return `距離約 ${item.distanceM} 公尺`;
    case 'PREFERENCE_MATCH':
      return `符合偏好：${item.preferenceMatches[0]}`;
    case 'SCHEDULE_KNOWN':
      return '已有可核對的時段資訊';
    case 'PRICE_VALUE':
      return '既有 CP 評分中的價格面向較佳';
    case 'FOOD_FIT':
      return '既有 CP 評分中的餐食面向較佳';
    case 'QUALITY_FIT':
      return '既有 CP 評分中的品質面向較佳';
    case 'CONVENIENCE_FIT':
      return '既有 CP 評分中的便利面向較佳';
    case 'DISCOUNT_VALUE':
      return '既有 CP 評分中的優惠面向較佳';
    case 'VERIFIED_SOURCE':
      return '已有來源驗證欄位可供核對';
  }
}

function headlineForCodes(codes: AiExplanationReasonCode[]) {
  if (codes.includes('FREE_COST')) return '已知免費、符合目前篩選';
  if (codes.includes('SHORT_DISTANCE')) return '距離近、符合目前篩選';
  if (codes.includes('PREFERENCE_MATCH')) return '符合偏好與目前篩選';
  if (codes.includes('KNOWN_COST')) return '費用明確、符合目前篩選';
  return '符合目前資料篩選';
}

function materializeExplanation(
  item: ExplainCandidateFacts,
  selection: ExplanationSelection,
): ExplainedItem {
  return {
    id: item.id,
    headline: headlineForCodes(selection.reasonCodes),
    reasons: selection.reasonCodes.map((code) => reasonText(code, item)),
    caution:
      item.cautions[0] ??
      (item.costTwd === null
        ? '費用資訊仍需確認'
        : item.schedule === null
          ? '時段資訊仍需確認'
          : null),
  };
}

export function createResultsExplainSuccess(
  request: ResultsExplainRequest,
  modelOutput: ResultsExplainModelOutput,
): ResultsExplainResponse {
  return {
    ok: true,
    source: 'gemini',
    items: request.items.map((item, index) =>
      materializeExplanation(item, modelOutput.items[index]),
    ),
    error: null,
  };
}

export function createResultsExplainFallback(
  request: ResultsExplainRequest,
): ResultsExplainResponse {
  return {
    ok: false,
    source: 'fallback',
    items: request.items.map((item) => {
      const preferredOrder: AiExplanationReasonCode[] = [
        'FREE_COST',
        'KNOWN_COST',
        'SHORT_DISTANCE',
        'PREFERENCE_MATCH',
        'SCHEDULE_KNOWN',
        'PRICE_VALUE',
        'FOOD_FIT',
        'QUALITY_FIT',
        'CONVENIENCE_FIT',
        'DISCOUNT_VALUE',
        'VERIFIED_SOURCE',
        'NO_KNOWN_CONFLICT',
      ];
      const eligible = eligibleReasonCodes(item);
      const reasonCodes = preferredOrder
        .filter((code) => eligible.includes(code))
        .slice(0, 3);
      return materializeExplanation(item, { id: item.id, reasonCodes });
    }),
    error: {
      code: 'AI_UNAVAILABLE',
      message: 'AI 暫時無法使用，已改用已確認事實產生說明。',
    },
  };
}
