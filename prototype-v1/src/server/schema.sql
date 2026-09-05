-- SPEC-backend §6。全部 IF NOT EXISTS，啟動時套用，不用 migration 工具。
create table if not exists users (
  id            text primary key default gen_random_uuid()::text,
  username      text not null unique,            -- 小寫儲存
  password_hash text not null,                   -- Bun.password（argon2id）
  nickname      text,                            -- null = 未填；顯示時退回 username
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists auth_sessions (
  id         text primary key default gen_random_uuid()::text,
  user_id    text not null references users(id) on delete cascade,
  token_hash text not null unique,               -- sha256(原始 token)；原始 token 永不儲存
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists account_data (
  user_id    text primary key references users(id) on delete cascade,
  list       jsonb not null default '[]',
  favs       jsonb not null default '[]',
  settings   jsonb not null default '{}',        -- {monthly_budget, spent, spent_month, survival, exclude, prefs}
  profile    jsonb not null default '{}',        -- {color}
  updated_at timestamptz not null default now()
);

create table if not exists candidates (
  id                         text primary key,
  category                   text not null check (category in ('食品','日用品','免費／公益資源','活動','交通')),
  agent                      text not null check (agent in ('paid','free')),
  title                      text not null,
  provider                   text not null,
  price_total_twd            integer,            -- null = 未知；絕不當 0
  mandatory_fees_twd         integer,   -- null = 費用未知，不能進入成本比較
  discount_twd               integer not null default 0,
  price_unit                 text,
  quantity_or_servings       text,
  eligibility                text[] not null default '{}',
  registration_required      boolean not null default false,
  availability_or_event_time text,
  valid_until                timestamptz,        -- 來源明示的有效期限；null = 未明示，不會過期
  address                    text,               -- 來源原文地址；null = 無地址或線上服務
  lat                        double precision,
  lng                        double precision,
  distance_or_time_text      text,               -- 來源原文，原樣顯示
  tags                       text[],             -- null = 成分未標示
  source_url                 text not null,
  source_type                text not null check (source_type in ('curated','web-searched')),
  source_authority           text not null check (source_authority in ('official','provider','public','other')),
  evidence                   jsonb not null default '[]',  -- [{field, quote, url, checked_at}]
  collected_at               timestamptz not null,
  verified_at                timestamptz,
  data_status                text not null check (data_status in ('已驗證','部分驗證／待確認','過期／待確認','衝突待確認','無法納入比較')),
  action_url                 text,
  action_label               text,
  baseline                   jsonb,              -- {name, total_twd, basis, as_of}
  group_offer                jsonb,              -- {min_people, discount_pct?, price_per_person?, redeem_code, note}
  extra                      jsonb not null default '{}'
);
create index if not exists candidates_category_status on candidates (category, data_status);

create table if not exists group_offer_memberships (
  candidate_id text not null references candidates(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (candidate_id, user_id)
);
create index if not exists group_offer_memberships_user_joined
  on group_offer_memberships (user_id, joined_at);

create table if not exists reports (
  id           bigserial primary key,
  candidate_id text not null references candidates(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  reason       text not null check (reason in ('價格過期','條件錯誤','來源失效','分類錯誤','食安','過敏','身體不適')),
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists reports_candidate on reports (candidate_id, created_at desc);

-- Idempotent upgrade: preserve existing data while representing unknown required fees.
alter table candidates alter column mandatory_fees_twd drop not null;
alter table candidates alter column mandatory_fees_twd drop default;

-- Monotonic optimistic concurrency token; safe to apply repeatedly to existing installations.
alter table account_data add column if not exists revision bigint not null default 0;
