-- AI blessings

alter table if exists public.event_settings
  add column if not exists ai_blessing_enabled boolean not null default true;

alter table if exists public.event_settings
  add column if not exists ai_daily_limit int not null default 3;

alter table if exists public.event_settings
  add column if not exists blessings_ai_closeness_options jsonb not null default '["משפחה","חברים","מהעבודה"]'::jsonb;

alter table if exists public.event_settings
  add column if not exists blessings_ai_style_options jsonb not null default '["מרגש","קליל","רשמי"]'::jsonb;

alter table if exists public.event_settings
  add column if not exists blessings_ai_writer_suggestions jsonb not null default '["אבא","אמא","סבתא","סבא","אח","אחות","דודה","דוד","חבר מהכיתה","חברה מהכיתה"]'::jsonb;

create table if not exists public.ai_usage_daily (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  device_id text not null,
  day date not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='ai_usage_daily_event_device_day_idx'
  ) then
    create unique index ai_usage_daily_event_device_day_idx on public.ai_usage_daily (event_id, device_id, day);
  end if;
end $$;

alter table if exists public.ai_usage_daily enable row level security;

drop policy if exists "ai_usage_daily select none" on public.ai_usage_daily;
create policy "ai_usage_daily select none" on public.ai_usage_daily
  for select using (false);
