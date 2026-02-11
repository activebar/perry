-- V12.10: align public.media_items schema with app code (gallery + blessings uploads)
-- Safe to run multiple times.

alter table if exists public.media_items
  add column if not exists kind text,
  add column if not exists event_id text,
  add column if not exists gallery_id uuid,
  add column if not exists url text,
  add column if not exists thumb_url text,
  add column if not exists storage_path text,
  add column if not exists is_approved boolean default false,
  add column if not exists editable_until timestamptz,
  add column if not exists source text,
  add column if not exists uploaded_by uuid,
  add column if not exists uploader_device_id text;

-- Helpful indexes
create index if not exists media_items_event_kind_idx
  on public.media_items (event_id, kind);

create index if not exists media_items_gallery_approved_idx
  on public.media_items (event_id, gallery_id, is_approved)
  where kind = 'gallery';

create index if not exists media_items_created_idx
  on public.media_items (created_at);

-- RLS
alter table public.media_items enable row level security;

drop policy if exists "public read approved media items" on public.media_items;
create policy "public read approved media items"
on public.media_items
for select
to anon
using (is_approved = true);

-- (Writes are performed with service_role in the API routes)
