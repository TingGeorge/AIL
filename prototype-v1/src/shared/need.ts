import { z } from "zod";

// 需求與限制 schema. See docs/SPEC-voice-input.md §3. One definition for the
// parser's structured output and the client's type.

export const CATEGORIES = ["食品", "日用品", "免費／公益資源", "活動", "交通"] as const;

export const needSchema = z.object({
  need: z.string().max(2000).describe("生活需求，例如「晚餐」；沒聽到就給空字串"),
  target_categories: z.array(z.enum(CATEGORIES)).max(5),
  budget_total_twd: z.number().finite().min(0).max(100_000_000).nullable(),
  people_or_servings: z.number().finite().int().min(1).max(1000).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value); }, "日期不存在").nullable().describe("ISO 日期 YYYY-MM-DD"),
  time_window: z.string().max(200).nullable(),
  max_distance_km: z.number().finite().min(0).max(1000).nullable(),
  max_minutes: z.number().finite().min(0).max(10000).nullable(),
  free_only: z.boolean(),
  registration_ok: z.boolean().nullable(),
  soft_preferences: z.array(z.string().max(100)).max(20),
  eligibility_notes: z.string().max(500).nullable(),
  exclude_tags: z.array(z.string().max(20)).max(20).default([]).describe("使用者說不吃／不要的東西，例如 牛、豬、海鮮、辣"),
  unresolved: z.array(z.string().max(500)).max(30),
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
  exclude_tags: [],
  unresolved: [],
};
