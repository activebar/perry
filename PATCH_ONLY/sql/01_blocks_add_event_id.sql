-- V12.6
-- Fix blocks scoping per-event: add blocks.event_id (text) and backfill from event_settings.

alter table public.blocks
  add column if not exists event_id text;

-- Backfill existing rows (assumes there is at least one event_settings row)
update public.blocks b
set event_id = es.event_id
from (
  select event_id
  from public.event_settings
  order by created_at asc
  limit 1
) es
where b.event_id is null;

-- Make sure future inserts always include event_id
alter table public.blocks
  alter column event_id set not null;

create index if not exists blocks_event_id_order_index
  on public.blocks (event_id, order_index);

-- Optional: if you still have legacy gallery blocks, you can remove them after backfill:
-- delete from public.blocks where event_id = '<your_event_id>' and type in ('gallery','gallery_admin');
