PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT NOT NULL UNIQUE,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  anchor_place_provider TEXT NOT NULL,
  anchor_place_id TEXT,
  center_lat_e6 INTEGER,
  center_lng_e6 INTEGER,
  radius_m INTEGER NOT NULL CHECK (radius_m > 0),
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei'
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 60),
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 30),
  avatar_ref TEXT,
  home_area_id TEXT REFERENCES areas(id),
  budget_min_twd INTEGER CHECK (budget_min_twd IS NULL OR budget_min_twd >= 0),
  budget_max_twd INTEGER CHECK (budget_max_twd IS NULL OR budget_max_twd >= budget_min_twd),
  default_party_size INTEGER NOT NULL DEFAULT 1 CHECK (default_party_size BETWEEN 1 AND 20),
  cp_preset TEXT NOT NULL DEFAULT 'BALANCED' CHECK (cp_preset IN ('BALANCED','STUDENT','FITNESS','TIME_SENSITIVE','GROUP')),
  onboarding_completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE preference_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  rule_key TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('HARD_EXCLUSION','SOFT_PREFERENCE')),
  strength INTEGER NOT NULL DEFAULT 3 CHECK (strength BETWEEN 1 AND 5),
  value_json TEXT,
  confirmed_at TEXT NOT NULL,
  UNIQUE (user_id, rule_key)
);

CREATE TABLE places (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES areas(id),
  kind TEXT NOT NULL CHECK (kind IN ('RESTAURANT','STORE','VENUE','PUBLIC_RESOURCE','TRANSIT')),
  name TEXT NOT NULL,
  address_text TEXT,
  lat_e6 INTEGER,
  lng_e6 INTEGER,
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('ACTIVE','TEMP_CLOSED','PERM_CLOSED','UNKNOWN')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE external_place_refs (
  place_id TEXT NOT NULL REFERENCES places(id),
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  canonical_url TEXT,
  last_checked_at TEXT,
  PRIMARY KEY (place_id, provider),
  UNIQUE (provider, external_id)
);

CREATE TABLE restaurants (
  place_id TEXT PRIMARY KEY REFERENCES places(id),
  cuisine_primary TEXT,
  cuisine_tags_json TEXT,
  service_modes_json TEXT,
  last_menu_verified_at TEXT
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(place_id),
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('SINGLE','SET','BUFFET','GROUP_PACKAGE')),
  base_price_twd INTEGER CHECK (base_price_twd IS NULL OR base_price_twd >= 0),
  servings_min INTEGER CHECK (servings_min IS NULL OR servings_min > 0),
  servings_max INTEGER CHECK (servings_max IS NULL OR servings_max >= servings_min),
  calories_kcal INTEGER,
  protein_g_x10 INTEGER,
  status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('ACTIVE','UNAVAILABLE','UNKNOWN'))
);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  origin_type TEXT NOT NULL CHECK (origin_type IN ('OFFICIAL','PROVIDER','PUBLIC','COMMUNITY','VERIFIED_COMMUNITY')),
  authority_level INTEGER NOT NULL CHECK (authority_level BETWEEN 1 AND 5),
  publisher_name TEXT NOT NULL,
  canonical_url TEXT,
  retention_policy TEXT NOT NULL,
  terms_checked_at TEXT
);

CREATE TABLE source_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  fetched_at TEXT NOT NULL,
  content_hash TEXT,
  short_excerpt TEXT,
  expires_at TEXT
);

CREATE TABLE evidence_assertions (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  claimed_value_json TEXT NOT NULL,
  source_snapshot_id TEXT NOT NULL REFERENCES source_snapshots(id),
  evidence_quote TEXT,
  valid_from TEXT,
  valid_until TEXT,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('UNVERIFIED','CORROBORATED','PROVIDER_CONFIRMED','OFFICIAL_CONFIRMED','REJECTED','EXPIRED','CONFLICTED')),
  verified_at TEXT
);

CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id),
  menu_item_id TEXT REFERENCES menu_items(id),
  offer_type TEXT NOT NULL,
  title TEXT NOT NULL,
  regular_price_twd INTEGER,
  offer_price_twd INTEGER,
  min_people INTEGER,
  min_quantity INTEGER,
  valid_from TEXT,
  valid_until TEXT,
  source_id TEXT REFERENCES sources(id),
  verification_status TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PRIVATE','TEAM','PUBLIC'))
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  owner_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','MEMBER')),
  member_status TEXT NOT NULL CHECK (member_status IN ('INVITED','ACTIVE','LEFT','REMOVED')),
  joined_at TEXT,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE team_invites (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 10 CHECK (max_uses > 0),
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);

CREATE TABLE group_campaigns (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  offer_id TEXT NOT NULL REFERENCES offers(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  target_people INTEGER NOT NULL CHECK (target_people > 1),
  target_quantity INTEGER CHECK (target_quantity IS NULL OR target_quantity > 0),
  deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','THRESHOLD_MET','CLOSED','CANCELLED','EXPIRED')),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE group_commitments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES group_campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  max_cost_twd INTEGER,
  status TEXT NOT NULL DEFAULT 'PLEDGED' CHECK (status IN ('PLEDGED','CONFIRMED','WITHDRAWN')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, user_id)
);

CREATE TABLE community_reports (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('DATA_ERROR','QUALITY_EXPERIENCE','OFFER_TIP','SAFETY_INCIDENT')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  occurred_at TEXT,
  submitted_at TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  moderation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (moderation_status IN ('PENDING','VISIBLE','HIDDEN','ESCALATED'))
);

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  place_id TEXT REFERENCES places(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  direct_cost_twd INTEGER,
  food_provided TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (food_provided IN ('NONE','SNACK','MEAL','UNKNOWN')),
  registration_required INTEGER CHECK (registration_required IN (0,1) OR registration_required IS NULL),
  membership_required INTEGER CHECK (membership_required IN (0,1) OR membership_required IS NULL),
  volunteer_minutes INTEGER,
  admission_cost_twd INTEGER,
  required_purchase_twd INTEGER,
  source_id TEXT REFERENCES sources(id),
  verification_status TEXT NOT NULL,
  last_verified_at TEXT,
  action_url TEXT
);

CREATE TABLE score_policies (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  base_weights_json TEXT NOT NULL,
  normalization_rule_json TEXT NOT NULL,
  missing_rule_json TEXT NOT NULL,
  active_from TEXT NOT NULL,
  retired_at TEXT
);

CREATE TABLE score_runs (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  policy_version TEXT NOT NULL,
  cohort_key TEXT NOT NULL,
  base_score_x100 INTEGER,
  personalized_score_x100 INTEGER,
  reliability_x100 INTEGER NOT NULL,
  coverage_x100 INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  input_hash TEXT NOT NULL
);

CREATE TABLE score_components (
  score_run_id TEXT NOT NULL REFERENCES score_runs(id),
  dimension TEXT NOT NULL CHECK (dimension IN ('PRICE','FOOD','QUALITY','CONVENIENCE','DISCOUNT','RELIABILITY')),
  raw_value_json TEXT,
  normalized_x100 INTEGER,
  weight_bps INTEGER NOT NULL,
  evidence_status TEXT NOT NULL,
  reason_code TEXT,
  PRIMARY KEY (score_run_id, dimension)
);

CREATE INDEX idx_places_area_kind_status ON places(area_id, kind, status);
CREATE INDEX idx_menu_items_restaurant_status_price ON menu_items(restaurant_id, status, base_price_twd);
CREATE INDEX idx_offers_place_until_status ON offers(place_id, valid_until, verification_status);
CREATE INDEX idx_evidence_subject_field_status ON evidence_assertions(subject_type, subject_id, field_key, verification_status);
CREATE INDEX idx_team_members_user_status ON team_members(user_id, member_status);
CREATE INDEX idx_campaigns_team_status_deadline ON group_campaigns(team_id, status, deadline);
CREATE INDEX idx_reports_subject_type_status ON community_reports(subject_type, subject_id, report_type, moderation_status);
CREATE INDEX idx_opportunities_time_status ON opportunities(starts_at, ends_at, verification_status);
CREATE INDEX idx_score_runs_subject_policy_time ON score_runs(subject_type, subject_id, policy_version, computed_at);

PRAGMA optimize;
