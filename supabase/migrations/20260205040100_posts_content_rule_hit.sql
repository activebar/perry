alter table if exists public.posts
  add column if not exists content_rule_hit jsonb null;

-- pending_reason already exists in some environments; keep idempotent.
alter table if exists public.posts
  add column if not exists pending_reason text null;
