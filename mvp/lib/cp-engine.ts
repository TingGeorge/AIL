export type CpDimension = 'price' | 'food' | 'quality' | 'convenience' | 'discount';

export type ScoreInput = {
  dimensions: Partial<Record<CpDimension, number>>;
  reliability: number;
  weights?: Record<CpDimension, number>;
  requiredEvidence: boolean;
  hardConstraintsPassed: boolean;
};

export type ScoreOutput = {
  eligible: boolean;
  score: number | null;
  coverage: number;
  reason: 'OK' | 'MISSING_EVIDENCE' | 'HARD_CONSTRAINT_FAILED' | 'INSUFFICIENT_COVERAGE';
};

export const BASE_WEIGHTS: Record<CpDimension, number> = {
  price: 0.35,
  food: 0.2,
  quality: 0.2,
  convenience: 0.1,
  discount: 0.15,
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function calculateCpScore(input: ScoreInput): ScoreOutput {
  if (!input.requiredEvidence) return { eligible: false, score: null, coverage: 0, reason: 'MISSING_EVIDENCE' };
  if (!input.hardConstraintsPassed) return { eligible: false, score: null, coverage: 0, reason: 'HARD_CONSTRAINT_FAILED' };

  const weights = input.weights ?? BASE_WEIGHTS;
  const entries = Object.entries(weights) as [CpDimension, number][];
  const available = entries.filter(([key]) => Number.isFinite(input.dimensions[key]));
  const coverage = available.reduce((sum, [, weight]) => sum + weight, 0);
  if (coverage < 0.6) return { eligible: false, score: null, coverage, reason: 'INSUFFICIENT_COVERAGE' };

  const weighted = available.reduce((sum, [key, weight]) => sum + clamp(input.dimensions[key]!) * weight, 0) / coverage;
  const reliability = clamp(input.reliability) / 100;
  const reliabilityMultiplier = 0.7 + 0.3 * reliability;
  const coveragePenalty = coverage >= 0.8 ? 1 : 0.9;
  return { eligible: true, score: Math.round(weighted * reliabilityMultiplier * coveragePenalty), coverage, reason: 'OK' };
}

export function effectiveCost(input: {
  directCostTwd: number | null;
  admissionCostTwd: number | null;
  requiredPurchaseTwd: number | null;
  mandatoryFeesTwd: number | null;
  transportCostTwd: number | null;
  totalMinutes: number | null;
  timeValueTwdPerHour: number | null;
}) {
  const moneyParts = [input.directCostTwd, input.admissionCostTwd, input.requiredPurchaseTwd, input.mandatoryFeesTwd];
  if (moneyParts.some((value) => value === null) || input.transportCostTwd === null) return null;
  const cash = moneyParts.reduce<number>((sum, value) => sum + (value ?? 0), 0) + input.transportCostTwd;
  if (input.totalMinutes === null || input.timeValueTwdPerHour === null) return { cash, monetized: null };
  return { cash, monetized: Math.round(cash + input.totalMinutes * input.timeValueTwdPerHour / 60) };
}
