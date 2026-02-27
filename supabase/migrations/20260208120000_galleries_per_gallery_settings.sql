-- V11.5 – Per-gallery upload + per-gallery approval + posts.gallery_id
-- Safe to run multiple times.

-- galleries: per-gallery settings
alter table if exists public.galleries
  add column if not exists upload_enabled boolean not null default true,
  add column if not exists require_approval boolean not null default true,
  add column if not exists web_max_dimension int;

-- posts: gallery_id (for kind='gallery')
alter table if exists public.posts
  add column if not exists gallery_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='posts_gallery_id_idx'
  ) then
    create index posts_gallery_id_idx on public.posts (gallery_id);
  end if;
end $$;
