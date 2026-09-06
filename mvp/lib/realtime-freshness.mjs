export const REALTIME_CLOCK_SKEW_MS = 2 * 60 * 1_000;

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string' && typeof value !== 'number') return Number.NaN;
  return new Date(value).getTime();
}

/**
 * Evaluate source freshness against server time, never against the user's
 * selected planning time. `appliesToSelectedTime` is intentionally separate:
 * current availability must not be presented as a forecast for another time.
 *
 * @param {{
 *   observedAt: string | null,
 *   validUntil: string | null,
 *   serverNow: Date,
 *   selectedAt: Date,
 * }} input
 */
export function evaluateRealtimeFreshness(input) {
  const serverNowMs = timestamp(input.serverNow);
  const selectedAtMs = timestamp(input.selectedAt);
  const observedAtMs = timestamp(input.observedAt);
  const validUntilMs = timestamp(input.validUntil);
  const timestampsAreValid =
    Number.isFinite(serverNowMs) &&
    Number.isFinite(selectedAtMs) &&
    Number.isFinite(observedAtMs) &&
    Number.isFinite(validUntilMs) &&
    observedAtMs <= serverNowMs + REALTIME_CLOCK_SKEW_MS &&
    validUntilMs >= observedAtMs;
  const fresh = timestampsAreValid && validUntilMs >= serverNowMs;
  const appliesToSelectedTime =
    fresh && Math.abs(selectedAtMs - serverNowMs) <= REALTIME_CLOCK_SKEW_MS;

  return { fresh, appliesToSelectedTime };
}
