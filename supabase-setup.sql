-- ═══════════════════════════════════════════════════════════════════
-- AutoBridge — Supabase Complete Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ─── EXTENSIONS ───────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";   -- optional, for scheduled flows

-- ─── COMPANIES ───────────────────────────────────────────────────
create table if not exists companies (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  plan        text not null default 'starter' check (plan in ('starter','business','enterprise')),
  logo_url    text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── PROFILES (extends auth.users) ───────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references companies(id),
  full_name   text,
  role        text not null default 'editor' check (role in ('admin','editor','viewer','analyst')),
  avatar_url  text,
  timezone    text default 'Africa/Cairo',
  lang        text default 'ar',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── FLOWS ───────────────────────────────────────────────────────
create table if not exists flows (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid references companies(id),
  created_by    uuid references profiles(id),
  title         text not null,
  description   text,
  icon          text default '⚡',
  color         text default '#0ea5e9',
  sector        text,
  tags          text[] default '{}',
  status        text default 'active' check (status in ('active','paused','error','draft')),
  is_template   boolean default false,
  template_type text,                        -- 'ecommerce','hr','finance', etc.
  runs_count    int default 0,
  last_run_at   timestamptz,
  uptime_pct    numeric(5,2) default 100,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── FLOW STEPS ──────────────────────────────────────────────────
create table if not exists flow_steps (
  id          uuid primary key default uuid_generate_v4(),
  flow_id     uuid references flows(id) on delete cascade,
  step_order  int not null,
  name        text not null,
  icon        text,
  url         text,
  method      text default 'POST' check (method in ('GET','POST','PUT','PATCH','DELETE')),
  path        text,
  auth_type   text default 'Bearer' check (auth_type in ('Bearer','ApiKey','OAuth2','HMAC','Basic','None')),
  auth_value  text,                          -- encrypted in production
  body        text,                          -- JSON template with {{variables}}
  headers     jsonb default '{}',
  timeout_sec int default 30,
  retry_count int default 3,
  created_at  timestamptz default now()
);

-- ─── FLOW RUNS (execution log) ────────────────────────────────────
create table if not exists flow_runs (
  id            uuid primary key default uuid_generate_v4(),
  flow_id       uuid references flows(id) on delete cascade,
  triggered_by  uuid references profiles(id),
  trigger_type  text default 'manual' check (trigger_type in ('manual','scheduled','webhook','api')),
  status        text default 'running' check (status in ('running','success','error','cancelled')),
  duration_ms   int,
  steps_total   int,
  steps_done    int default 0,
  error_message text,
  started_at    timestamptz default now(),
  finished_at   timestamptz
);

-- ─── STEP LOGS ───────────────────────────────────────────────────
create table if not exists step_logs (
  id          uuid primary key default uuid_generate_v4(),
  run_id      uuid references flow_runs(id) on delete cascade,
  step_id     uuid references flow_steps(id),
  step_order  int,
  step_name   text,
  status      text check (status in ('pending','running','success','error','retrying')),
  request_url text,
  request_method text,
  request_body text,
  response_status int,
  response_body text,
  latency_ms  int,
  retries     int default 0,
  error       text,
  logged_at   timestamptz default now()
);

-- ─── ENVIRONMENTS ────────────────────────────────────────────────
create table if not exists environments (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid references companies(id),
  name        text not null check (name in ('production','staging','development')),
  is_active   boolean default false,
  created_at  timestamptz default now()
);

create table if not exists env_variables (
  id          uuid primary key default uuid_generate_v4(),
  env_id      uuid references environments(id) on delete cascade,
  key         text not null,
  value       text,                          -- store encrypted via vault in prod
  is_secret   boolean default false,
  created_at  timestamptz default now(),
  unique(env_id, key)
);

-- ─── TEAM INVITATIONS ────────────────────────────────────────────
create table if not exists invitations (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid references companies(id),
  email       text not null,
  role        text default 'editor',
  token       text unique default encode(gen_random_bytes(32),'hex'),
  accepted    boolean default false,
  expires_at  timestamptz default now() + interval '7 days',
  created_at  timestamptz default now()
);

-- ─── NOTIFICATIONS ───────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id) on delete cascade,
  type        text check (type in ('success','error','warning','info')),
  title       text not null,
  body        text,
  flow_id     uuid references flows(id),
  read        boolean default false,
  created_at  timestamptz default now()
);

-- ─── WEBHOOK DELIVERY LOG ─────────────────────────────────────────
create table if not exists webhook_logs (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid references companies(id),
  flow_id       uuid references flows(id),
  method        text,
  path          text,
  request_body  text,
  response_status int,
  response_body text,
  latency_ms    int,
  success       boolean,
  retry_count   int default 0,
  created_at    timestamptz default now()
);

-- ─── FLOW COMMENTS ───────────────────────────────────────────────
create table if not exists flow_comments (
  id          uuid primary key default uuid_generate_v4(),
  flow_id     uuid references flows(id) on delete cascade,
  user_id     uuid references profiles(id),
  content     text not null,
  created_at  timestamptz default now()
);

-- ─── FLOW VERSIONS ───────────────────────────────────────────────
create table if not exists flow_versions (
  id          uuid primary key default uuid_generate_v4(),
  flow_id     uuid references flows(id) on delete cascade,
  version_num int not null,
  snapshot    jsonb not null,               -- full flow + steps JSON
  note        text,
  created_by  uuid references profiles(id),
  created_at  timestamptz default now()
);

-- ─── FOLDERS ─────────────────────────────────────────────────────
create table if not exists folders (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid references companies(id),
  name        text not null,
  icon        text default '📁',
  color       text default '#64748b',
  pinned      boolean default false,
  created_at  timestamptz default now()
);

create table if not exists folder_flows (
  folder_id   uuid references folders(id) on delete cascade,
  flow_id     uuid references flows(id) on delete cascade,
  primary key (folder_id, flow_id)
);

-- ─── MARKETPLACE ─────────────────────────────────────────────────
create table if not exists marketplace_items (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  description text,
  author      text,
  price_usd   numeric(8,2) default 0,
  icon        text,
  color       text,
  tags        text[],
  flow_json   jsonb,                        -- the flow definition to install
  downloads   int default 0,
  rating      numeric(3,1) default 0,
  published   boolean default true,
  created_at  timestamptz default now()
);

create table if not exists marketplace_purchases (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id),
  item_id     uuid references marketplace_items(id),
  price_paid  numeric(8,2),
  purchased_at timestamptz default now(),
  unique(user_id, item_id)
);

-- ─── ANALYTICS DAILY SUMMARY ─────────────────────────────────────
create table if not exists analytics_daily (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid references companies(id),
  date          date not null,
  total_runs    int default 0,
  success_runs  int default 0,
  failed_runs   int default 0,
  avg_latency_ms int,
  api_calls     int default 0,
  unique(company_id, date)
);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════

alter table companies        enable row level security;
alter table profiles         enable row level security;
alter table flows            enable row level security;
alter table flow_steps       enable row level security;
alter table flow_runs        enable row level security;
alter table step_logs        enable row level security;
alter table environments     enable row level security;
alter table env_variables    enable row level security;
alter table notifications    enable row level security;
alter table webhook_logs     enable row level security;
alter table flow_comments    enable row level security;
alter table flow_versions    enable row level security;
alter table folders          enable row level security;
alter table folder_flows     enable row level security;
alter table marketplace_items enable row level security;
alter table analytics_daily  enable row level security;

-- profiles: see own
create policy "profiles_own" on profiles
  for all using (auth.uid() = id);

-- flows: company members
create policy "flows_company" on flows
  for all using (
    company_id in (select company_id from profiles where id = auth.uid())
  );

-- notifications: own only
create policy "notifs_own" on notifications
  for all using (user_id = auth.uid());

-- flow_runs: company
create policy "runs_company" on flow_runs
  for all using (
    flow_id in (select id from flows where company_id in (
      select company_id from profiles where id = auth.uid()
    ))
  );

-- webhook_logs: company
create policy "wlog_company" on webhook_logs
  for all using (
    company_id in (select company_id from profiles where id = auth.uid())
  );

-- marketplace_items: public read
create policy "market_public_read" on marketplace_items
  for select using (published = true);

-- ═══════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════

-- increment flow run counter
create or replace function increment_flow_runs(flow_id uuid)
returns void language plpgsql as $$
begin
  update flows set runs_count = runs_count + 1, last_run_at = now()
  where id = flow_id;
end;
$$;

-- get analytics summary
create or replace function get_company_analytics(cid uuid, days int default 30)
returns table(date date, total_runs int, success_runs int, failed_runs int, avg_latency_ms int) 
language sql as $$
  select date, total_runs, success_runs, failed_runs, avg_latency_ms
  from analytics_daily
  where company_id = cid and date >= current_date - days
  order by date asc;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- SEED DEMO DATA (optional — remove in production)
-- ═══════════════════════════════════════════════════════════════════

insert into marketplace_items (title, author, price_usd, icon, color, tags, downloads, rating) values
  ('تدفق دفع Paymob الكامل',    'AutoBridge',  0,   '💳', '#10b981', '{"دفع","Paymob"}',  1240, 4.9),
  ('أتمتة تقارير الضرائب',      'TaxPro EG',   49,  '🏛️', '#f59e0b', '{"ضرائب","تقارير"}', 890, 4.7),
  ('CRM + WhatsApp متكامل',     'CRMHub',      29,  '💬', '#0ea5e9', '{"CRM","WhatsApp"}', 2100, 4.8),
  ('مزامنة مخزون Noon+Amazon',  'MarketSync',  0,   '🔄', '#f97316', '{"مخزون","Noon"}',   3400, 4.5),
  ('تدفق رواتب مصر الكامل',     'HRMasr',      79,  '💰', '#ec4899', '{"مرتبات","ضرائب"}',  220, 5.0),
  ('أتمتة تسجيل الطلاب',        'EduFlow',     0,   '🎓', '#06b6d4', '{"تعليم","LMS"}',    780, 4.4)
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- DONE ✅
-- ═══════════════════════════════════════════════════════════════════
