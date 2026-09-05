import { describe, expect, test } from "bun:test";
import { EMPTY_NEED, needSchema } from "../src/shared/need.ts";

const valid = (changes: Record<string, unknown> = {}) => needSchema.safeParse({ ...EMPTY_NEED, ...changes }).success;

describe("needSchema date validation", () => {
  test("accepts real ISO calendar dates, including leap day", () => {
    expect(valid({ date: "2024-02-29" })).toBe(true);
    expect(valid({ date: "2026-09-05" })).toBe(true);
  });

  test("rejects impossible dates and non-ISO shapes", () => {
    for (const date of ["2023-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "2026-9-5", "05-09-2026", ""]) {
      expect(valid({ date })).toBe(false);
    }
  });
});

describe("needSchema numeric bounds", () => {
  test("accepts every documented inclusive boundary", () => {
    expect(valid({ budget_total_twd: 0 })).toBe(true);
    expect(valid({ budget_total_twd: 100_000_000 })).toBe(true);
    expect(valid({ people_or_servings: 1 })).toBe(true);
    expect(valid({ people_or_servings: 1000 })).toBe(true);
    expect(valid({ max_distance_km: 0 })).toBe(true);
    expect(valid({ max_distance_km: 1000 })).toBe(true);
    expect(valid({ max_minutes: 0 })).toBe(true);
    expect(valid({ max_minutes: 10_000 })).toBe(true);
  });

  test("rejects values outside bounds, non-finite numbers, and fractional people", () => {
    const invalidCases = [
      { budget_total_twd: -0.01 },
      { budget_total_twd: 100_000_000.01 },
      { budget_total_twd: Number.POSITIVE_INFINITY },
      { budget_total_twd: Number.NaN },
      { people_or_servings: 0 },
      { people_or_servings: 1001 },
      { people_or_servings: 1.5 },
      { max_distance_km: -0.01 },
      { max_distance_km: 1000.01 },
      { max_minutes: -0.01 },
      { max_minutes: 10_000.01 },
    ];

    for (const changes of invalidCases) expect(valid(changes)).toBe(false);
  });
});

describe("needSchema null semantics", () => {
  test("accepts null only for fields whose unknown or unset state is part of the contract", () => {
    expect(valid({
      budget_total_twd: null,
      people_or_servings: null,
      date: null,
      time_window: null,
      max_distance_km: null,
      max_minutes: null,
      registration_ok: null,
      eligibility_notes: null,
    })).toBe(true);
  });

  test("keeps meaningful zero values distinct from null", () => {
    expect(valid({ budget_total_twd: 0, max_distance_km: 0, max_minutes: 0 })).toBe(true);
    expect(valid({ people_or_servings: 0 })).toBe(false);
    expect(valid({ date: "" })).toBe(false);
  });

  test("rejects null for required strings, arrays, and booleans", () => {
    for (const field of ["need", "target_categories", "free_only", "soft_preferences", "exclude_tags", "unresolved"] as const) {
      expect(valid({ [field]: null })).toBe(false);
    }
  });

  test("nullable fields remain required rather than treating omission as null", () => {
    for (const field of [
      "budget_total_twd",
      "people_or_servings",
      "date",
      "time_window",
      "max_distance_km",
      "max_minutes",
      "registration_ok",
      "eligibility_notes",
    ] as const) {
      const input = { ...EMPTY_NEED } as Record<string, unknown>;
      delete input[field];
      expect(needSchema.safeParse(input).success).toBe(false);
    }
  });
});
