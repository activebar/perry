-- Add event_id to support multiple events in one database.
-- Use a simple text identifier (slug) so each cloned site can set NEXT_PUBLIC_EVENT_ID.

alter table if exists public.event_settings
  add column if not exists event_id text not null default 'default';

-- Ensure one settings row per event_id (you can still keep history rows if you want by removing this unique constraint)
-- We keep it partial by using the latest row logic in the app, but uniqueness helps avoid confusion in admin.
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='event_settings_event_id_idx'
  ) then
    create index event_settings_event_id_idx on public.event_settings (event_id);
  end if;
end $$;

alter table if exists public.posts
  add column if not exists event_id text not null default 'default';

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='posts_event_id_idx'
  ) then
    create index posts_event_id_idx on public.posts (event_id);
  end if;
end $$;

-- Backfill existing rows (in case defaults didn't apply)
update public.event_settings set event_id='default' where event_id is null;
update public.posts set event_id='default' where event_id is null;
