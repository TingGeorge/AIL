import { isDemoRecord, passesGate, type Evidence, type Rec } from "./records.ts";
import { publicHttpsUrl } from "./ingestion.ts";

export type GroupOfferTerms = { redemption_method: string; valid_until: string | null; valid_from?: string | null };

// Group discounts have their own evidence and expiry: an open venue is not proof
// that a promotion is still valid. No code is different from an invented code.
export function groupOfferTerms(record: Rec): GroupOfferTerms | null {
  const raw = record.extra.group_offer_terms;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const terms = raw as Record<string, unknown>;
  if (typeof terms.redemption_method !== "string" || !terms.redemption_method.trim()) return null;
  if (terms.valid_until !== null && typeof terms.valid_until !== "string") return null;
  if (terms.valid_from != null && typeof terms.valid_from !== "string") return null;
  return terms as GroupOfferTerms;
}

export function groupOfferEvidence(record: Rec): Evidence[] {
  const raw = record.extra.group_offer_evidence;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Evidence => item !== null && typeof item === "object"
    && typeof item.field === "string" && typeof item.quote === "string" && item.quote.trim().length > 0
    && typeof item.url === "string" && publicHttpsUrl(item.url) && typeof item.checked_at === "string");
}

export function canDisplayGroupOffer(record: Rec, now = Date.now()): boolean {
  const offer = record.group_offer;
  const terms = groupOfferTerms(record);
  if (!offer || !terms || isDemoRecord(record) || record.extra.archived === true || !passesGate(record, now)) return false;
  if (!["official", "provider"].includes(record.source_authority) || !publicHttpsUrl(record.source_url)) return false;
  if (!Number.isInteger(offer.min_people) || offer.min_people < 2 || !offer.note.trim()) return false;
  const priced = typeof offer.price_per_person === "number" && Number.isFinite(offer.price_per_person) && offer.price_per_person >= 0;
  const discounted = typeof offer.discount_pct === "number" && Number.isFinite(offer.discount_pct) && offer.discount_pct > 0 && offer.discount_pct <= 100;
  if (!priced && !discounted) return false;
  if (offer.redeem_code !== null && (typeof offer.redeem_code !== "string" || !offer.redeem_code.trim())) return false;
  if (terms.valid_until !== null && (!Number.isFinite(Date.parse(terms.valid_until)) || Date.parse(terms.valid_until) < now)) return false;
  if (terms.valid_from != null && (!Number.isFinite(Date.parse(terms.valid_from)) || Date.parse(terms.valid_from) > now)) return false;
  const evidence = groupOfferEvidence(record);
  return evidence.length > 0 && evidence.length === (record.extra.group_offer_evidence as unknown[]).length
    && evidence.every(item => Number.isFinite(Date.parse(item.checked_at)) && Date.parse(item.checked_at) <= now + 60_000);
}
