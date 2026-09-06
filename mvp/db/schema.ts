export const schemaVersion = 5;

export const tableNames = [
  'users',
  'profiles',
  'preference_rules',
  'areas',
  'places',
  'external_place_refs',
  'restaurants',
  'menu_items',
  'offers',
  'sources',
  'source_snapshots',
  'evidence_assertions',
  'teams',
  'team_members',
  'team_invites',
  'group_campaigns',
  'group_commitments',
  'community_reports',
  'opportunities',
  'score_policies',
  'score_runs',
  'score_components',
  'search_requests',
  'saved_lists',
  'saved_list_items',
  'purchase_history',
  'notifications',
  'group_order_items',
  'auth_credentials',
  'auth_sessions',
  'account_state',
  'source_resources',
  'import_runs',
  'import_items',
  'ai_rate_limit_windows',
] as const;

export type OriginType =
  | 'OFFICIAL'
  | 'PROVIDER'
  | 'PUBLIC'
  | 'COMMUNITY'
  | 'VERIFIED_COMMUNITY';
export type VerificationStatus =
  | 'UNVERIFIED'
  | 'CORROBORATED'
  | 'PROVIDER_CONFIRMED'
  | 'OFFICIAL_CONFIRMED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONFLICTED';
export type EvidenceSubjectType =
  | 'AREA'
  | 'PLACE'
  | 'MENU_ITEM'
  | 'OFFER'
  | 'OPPORTUNITY'
  | 'REPORT';
export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type CampaignStatus =
  | 'OPEN'
  | 'THRESHOLD_MET'
  | 'CLOSED'
  | 'CANCELLED'
  | 'EXPIRED';
export type ReportType =
  | 'DATA_ERROR'
  | 'QUALITY_EXPERIENCE'
  | 'OFFER_TIP'
  | 'SAFETY_INCIDENT';
export type SavedItemStatus = 'SAVED' | 'PURCHASED' | 'REMOVED' | 'EXPIRED';
export type NotificationType =
  | 'EXPIRY'
  | 'TEAM_PROGRESS'
  | 'PRICE_CHANGE'
  | 'LIST_REMINDER'
  | 'SYSTEM';

export type SearchConstraints = {
  query: string;
  date: string;
  time?: string;
  category?: 'DINING' | 'DAILY' | 'LEISURE' | 'TRANSPORT';
  budgetTwd?: number;
  partySize: number;
  maxDistanceM?: number;
  hardExclusions: string[];
  softPreferences: string[];
  mobility: Array<'WALK' | 'MRT' | 'BUS' | 'YOUBIKE' | 'TAXI_SHARE'>;
};

export type SearchReadModel = {
  subjectId: string;
  baseScore: number | null;
  personalizedScore: number | null;
  reliability: number;
  scorePolicyVersion: string;
  topReasons: string[];
  evidenceStatus: VerificationStatus;
};
