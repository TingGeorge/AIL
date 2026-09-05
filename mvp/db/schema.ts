export const schemaVersion = 1;

export const tableNames = [
  'users', 'profiles', 'preference_rules', 'areas', 'places', 'external_place_refs',
  'restaurants', 'menu_items', 'offers', 'sources', 'source_snapshots',
  'evidence_assertions', 'teams', 'team_members', 'team_invites',
  'group_campaigns', 'group_commitments', 'community_reports', 'opportunities',
  'score_policies', 'score_runs', 'score_components',
] as const;

export type OriginType = 'OFFICIAL' | 'PROVIDER' | 'PUBLIC' | 'COMMUNITY' | 'VERIFIED_COMMUNITY';
export type VerificationStatus = 'UNVERIFIED' | 'CORROBORATED' | 'PROVIDER_CONFIRMED' | 'OFFICIAL_CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'CONFLICTED';
export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type CampaignStatus = 'OPEN' | 'THRESHOLD_MET' | 'CLOSED' | 'CANCELLED' | 'EXPIRED';
export type ReportType = 'DATA_ERROR' | 'QUALITY_EXPERIENCE' | 'OFFER_TIP' | 'SAFETY_INCIDENT';

export type SearchReadModel = {
  subjectId: string;
  baseScore: number | null;
  personalizedScore: number | null;
  reliability: number;
  scorePolicyVersion: string;
  topReasons: string[];
  evidenceStatus: VerificationStatus;
};
