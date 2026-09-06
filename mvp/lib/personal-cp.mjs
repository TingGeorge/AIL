// @ts-check

/** @typedef {'price' | 'distance' | 'preference'} PersonalCpKey */
/** @typedef {{ price: number, distance: number, preference: number }} PersonalCpWeights */

const keys = /** @type {PersonalCpKey[]} */ ([
  'price',
  'distance',
  'preference',
]);

/**
 * @param {number} value
 * @param {number} [min]
 * @param {number} [max]
 */
const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/**
 * Keep the three controls honest percentages. Moving one control redistributes
 * the remaining percentage across the other two while preserving their ratio.
 *
 * @param {PersonalCpWeights} current
 * @param {PersonalCpKey} changedKey
 * @param {number} nextValue
 * @returns {PersonalCpWeights}
 */
export function rebalancePersonalCpWeights(current, changedKey, nextValue) {
  const next = Math.round(clamp(nextValue) / 5) * 5;
  const remaining = 100 - next;
  const otherKeys = keys.filter((key) => key !== changedKey);
  const otherTotal = otherKeys.reduce(
    (sum, key) => sum + clamp(current[key]),
    0,
  );
  const firstShare =
    otherTotal > 0
      ? (remaining * clamp(current[otherKeys[0]])) / otherTotal
      : remaining / 2;
  const first = Math.min(
    remaining,
    Math.max(0, Math.round(firstShare / 5) * 5),
  );

  return {
    ...current,
    [changedKey]: next,
    [otherKeys[0]]: first,
    [otherKeys[1]]: remaining - first,
  };
}

/**
 * @param {{
 *   totalCost: number | null,
 *   budget: number,
 *   distanceKm: number,
 *   maxDistanceKm: number,
 *   matchedPreferences: number,
 *   totalPreferences: number,
 *   weights: PersonalCpWeights,
 * }} input
 */
export function calculatePersonalCpScore(input) {
  const price =
    input.totalCost === null || input.budget <= 0
      ? null
      : clamp(100 - (input.totalCost / input.budget) * 100);
  const distance =
    input.maxDistanceKm <= 0
      ? null
      : clamp(100 - (input.distanceKm / input.maxDistanceKm) * 100);
  const preference =
    input.totalPreferences <= 0
      ? null
      : clamp(
          (input.matchedPreferences / input.totalPreferences) * 100,
        );
  const components = { price, distance, preference };

  let weightedTotal = 0;
  let activeWeight = 0;
  for (const key of keys) {
    const component = components[key];
    const weight = clamp(input.weights[key]);
    if (component === null || weight <= 0) continue;
    weightedTotal += component * weight;
    activeWeight += weight;
  }

  const rawScore = activeWeight > 0 ? weightedTotal / activeWeight : null;
  return {
    rawScore,
    score: rawScore === null ? null : Math.round(rawScore),
    components,
    activeWeight,
  };
}
