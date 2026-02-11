-- Add moderation metadata to posts

alter table public.posts
  add column if not exists moderation_flagged boolean not null default false;

alter table public.posts
  add column if not exists moderation_provider text;

alter table public.posts
  add column if not exists moderation_raw jsonb;

alter table public.posts
  add column if not exists pending_reason text;
