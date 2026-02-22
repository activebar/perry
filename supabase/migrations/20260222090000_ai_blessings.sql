/* AI blessings settings and usage */

alter table if exists public.event_settings
  add column if not exists ai_blessing_enabled boolean not null default true;

alter table if exists public.event_settings
  add column if not exists ai_blessing_daily_limit int not null default 3;

alter table if exists public.event_settings
  add column if not exists ai_closeness_options jsonb not null default '[]'::jsonb;

alter table if exists public.event_settings
  add column if not exists ai_style_options jsonb not null default '[]'::jsonb;

alter table if exists public.event_settings
  add column if not exists ai_writer_suggestions jsonb not null default '[]'::jsonb;

create table if not exists public.ai_usage_daily (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  device_id text not null,
  day date not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, device_id, day)
);

drop trigger if exists set_updated_at_ai_usage_daily on public.ai_usage_daily;
create trigger set_updated_at_ai_usage_daily
before update on public.ai_usage_daily
for each row execute function public.tg_set_updated_at();

alter table public.ai_usage_daily enable row level security;

create policy if not exists "ai_usage_daily admin only" on public.ai_usage_daily
for select using (false);

