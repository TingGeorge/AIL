import type { Category } from "./records.ts";

export type CatalogSummary = {
  total: number;
  rankable: number;
  pending: number;
  demonstration: number;
  latest_verified_at: string | null;
  scope: string;
  categories: { category: Category; total: number; rankable: number; pending: number }[];
};
