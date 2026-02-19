-- V11 – Galleries as blocks + multi gallery support

-- 1) event_settings: upload resizing control (WEB_ONLY)
alter table if exists public.event_settings
  add column if not exists web_max_dimension int not null default 2000;

-- 2) media_items: scope by event + link to gallery
alter table if exists public.media_items
  add column if not exists event_id text not null default 'default',
  add column if not exists gallery_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='media_items_event_id_idx'
  ) then
    create index media_items_event_id_idx on public.media_items (event_id);
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='media_items_gallery_id_idx'
  ) then
    create index media_items_gallery_id_idx on public.media_items (gallery_id);
  end if;
end $$;

-- 3) galleries table
create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  title text not null,
  order_index int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='galleries_event_id_order_idx'
  ) then
    create index galleries_event_id_order_idx on public.galleries (event_id, order_index);
  end if;
end $$;

-- Backfill existing media items to default event_id (in case defaults didn't apply)
update public.media_items set event_id='default' where event_id is null;
