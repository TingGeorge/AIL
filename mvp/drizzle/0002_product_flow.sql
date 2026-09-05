PRAGMA foreign_keys = ON;

CREATE TABLE search_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  session_key TEXT NOT NULL,
  original_text TEXT,
  date_local TEXT NOT NULL,
  time_local TEXT,
  category TEXT,
  budget_twd INTEGER CHECK (budget_twd IS NULL OR budget_twd >= 0),
  party_size INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 20),
  max_distance_m INTEGER CHECK (max_distance_m IS NULL OR max_distance_m > 0),
  exclusions_json TEXT NOT NULL DEFAULT '[]',
  preferences_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE saved_lists (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  session_key TEXT,
  title TEXT NOT NULL,
  budget_twd INTEGER CHECK (budget_twd IS NULL OR budget_twd >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','ARCHIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR session_key IS NOT NULL)
);

CREATE TABLE saved_list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES saved_lists(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('PLACE','MENU_ITEM','OFFER','OPPORTUNITY','TRANSPORT')),
  subject_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  estimated_cost_twd INTEGER CHECK (estimated_cost_twd IS NULL OR estimated_cost_twd >= 0),
  reminder_at TEXT,
  item_status TEXT NOT NULL DEFAULT 'SAVED' CHECK (item_status IN ('SAVED','PURCHASED','REMOVED','EXPIRED')),
  purchased_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (list_id, subject_type, subject_id)
);

CREATE TABLE purchase_history (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  session_key TEXT,
  list_item_id TEXT REFERENCES saved_list_items(id),
  category TEXT NOT NULL,
  title_snapshot TEXT NOT NULL,
  actual_cost_twd INTEGER NOT NULL CHECK (actual_cost_twd >= 0),
  benchmark_cost_twd INTEGER CHECK (benchmark_cost_twd IS NULL OR benchmark_cost_twd >= actual_cost_twd),
  savings_twd INTEGER CHECK (savings_twd IS NULL OR savings_twd >= 0),
  purchased_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR session_key IS NOT NULL)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  session_key TEXT,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('EXPIRY','TEAM_PROGRESS','PRICE_CHANGE','LIST_REMINDER','SYSTEM')),
  subject_type TEXT,
  subject_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_path TEXT,
  scheduled_at TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  dismissed_at TEXT,
  CHECK (user_id IS NOT NULL OR session_key IS NOT NULL)
);

CREATE TABLE group_order_items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES group_campaigns(id),
  menu_item_id TEXT REFERENCES menu_items(id),
  item_name_snapshot TEXT NOT NULL,
  quantity_per_person INTEGER NOT NULL DEFAULT 1 CHECK (quantity_per_person > 0),
  solo_unit_price_twd INTEGER CHECK (solo_unit_price_twd IS NULL OR solo_unit_price_twd >= 0),
  group_unit_price_twd INTEGER CHECK (group_unit_price_twd IS NULL OR group_unit_price_twd >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_search_requests_user_created ON search_requests(user_id, created_at);
CREATE INDEX idx_search_requests_session_created ON search_requests(session_key, created_at);
CREATE INDEX idx_saved_lists_user_status ON saved_lists(user_id, status, updated_at);
CREATE INDEX idx_saved_list_items_list_status ON saved_list_items(list_id, item_status, updated_at);
CREATE INDEX idx_purchase_history_user_time ON purchase_history(user_id, purchased_at);
CREATE INDEX idx_purchase_history_session_time ON purchase_history(session_key, purchased_at);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at, created_at);
CREATE INDEX idx_notifications_session_unread ON notifications(session_key, read_at, created_at);
CREATE INDEX idx_group_order_items_campaign ON group_order_items(campaign_id);

PRAGMA optimize;
