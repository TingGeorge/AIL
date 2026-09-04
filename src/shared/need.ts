import { z } from "zod";

// 需求與限制 schema. See docs/SPEC-voice-input.md §3. One definition for the
// parser's structured output and the client's type.

export const CATEGORIES = ["食品", "日用品", "免費／公益資源", "活動", "交通"] as const;

export const needSchema = z.object({
  need: z.string().describe("生活需求，例如「晚餐」；沒聽到就給空字串"),
  target_categories: z.array(z.enum(CATEGORIES)),
  budget_total_twd: z.number().nullable(),
  people_or_servings: z.number().nullable(),
  date: z.string().nullable().describe("ISO 日期 YYYY-MM-DD"),
  time_window: z.string().nullable(),
  max_distance_km: z.number().nullable(),
  max_minutes: z.number().nullable(),
  free_only: z.boolean(),
  registration_ok: z.boolean().nullable(),
  soft_preferences: z.array(z.string()),
  eligibility_notes: z.string().nullable(),
  unresolved: z.array(z.string()),
});

export type Need = z.infer<typeof needSchema>;

export const EMPTY_NEED: Need = {
  need: "",
  target_categories: [],
  budget_total_twd: null,
  people_or_servings: null,
  date: null,
  time_window: null,
  max_distance_km: null,
  max_minutes: null,
  free_only: false,
  registration_ok: null,
  soft_preferences: [],
  eligibility_notes: null,
  unresolved: [],
};
