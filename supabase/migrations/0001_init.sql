-- Active Bar Event Gift Site V1

create extension if not exists pgcrypto;

-- 1) Event settings (single-row)
create table if not exists public.event_settings (
  id uuid primary key default gen_random_uuid(),
  event_name text not null default 'Event',
  start_at timestamptz not null default now(),
  location_text text,
  waze_url text,
  thank_you_text text,
  require_approval boolean not null default false,

  gift_enabled boolean not null default true,
  gift_bit_url text,
  gift_paybox_url text,
  gift_image_url text,
  gift_image_diameter int not null default 160,

  archive_after_days int not null default 30,
  delete_after_hours int not null default 24,
  verify_drive_before_delete boolean not null default true,

  footer_enabled boolean not null default true,
  footer_label text default 'Active Bar',
  footer_url text default 'https://www.activebar.co.il',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function public.tg_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_event_settings on public.event_settings;
create trigger set_updated_at_event_settings
before update on public.event_settings
for each row execute procedure public.tg_set_updated_at();

-- 2) Blocks
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  order_index int not null default 1,
  is_visible boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  hidden_reason text,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3) Posts (blessings + gallery)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  author_name text,
  text text,
  media_path text,
  media_url text,
  video_url text,
  link_url text,
  status text not null default 'approved',
  device_id text,
  created_at timestamptz not null default now()
);

-- 4) Reactions (toggle per device)
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  device_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(post_id, device_id, emoji)
);

-- 5) Ads
create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_url text,
  link_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6) Admin users (username maps to Supabase Auth email)
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  role text not null default 'client',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 7) Media items (for Drive sync + auto delete)
create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  post_id uuid references public.posts(id) on delete set null,
  storage_path text,
  public_url text,
  mime_type text,

  drive_file_id text,
  drive_preview_url text,
  synced_at timestamptz,

  archived_at timestamptz,
  delete_after_at timestamptz,
  deleted_at timestamptz,

  last_error text,
  created_at timestamptz not null default now()
);

-- 8) RPC: hide gift block automatically after configured hours since start_at
create or replace function public.hide_gift_block_if_expired(p_start_at timestamptz, p_now timestamptz)
returns void
language plpgsql
security definer
as $$
begin
  update public.blocks
  set is_visible = false,
      hidden_reason = 'auto_time',
      hidden_at = p_now
  where type = 'gift'
    and is_visible = true
    and (config ? 'auto_hide_after_hours')
    and (p_now > (p_start_at + ((config->>'auto_hide_after_hours')::int * interval '1 hour')));
end;
$$;

-- RLS
alter table public.event_settings enable row level security;
alter table public.blocks enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.ads enable row level security;
alter table public.admin_users enable row level security;
alter table public.media_items enable row level security;

-- Public read-only policies
drop policy if exists event_settings_public_select on public.event_settings;
create policy event_settings_public_select on public.event_settings
for select using (true);

drop policy if exists blocks_public_select on public.blocks;
create policy blocks_public_select on public.blocks
for select using (true);

drop policy if exists posts_public_select_approved on public.posts;
create policy posts_public_select_approved on public.posts
for select using (status = 'approved');

drop policy if exists ads_public_select_active on public.ads;
create policy ads_public_select_active on public.ads
for select using (is_active = true);

-- Reactions: allow select for everyone (counts), no insert/update/delete for anon
drop policy if exists reactions_public_select on public.reactions;
create policy reactions_public_select on public.reactions
for select using (true);

-- Everything else: no public access (only service role)

-- Seed defaults (idempotent)
insert into public.event_settings (event_name)
select 'Event'
where not exists (select 1 from public.event_settings);

insert into public.blocks (type, order_index, is_visible, config)
select * from (
  values
    ('hero', 1, true, '{}'::jsonb),
    ('menu', 2, true, '{}'::jsonb),
    ('gallery', 3, true, '{}'::jsonb),
    ('blessings', 4, true, '{}'::jsonb),
    ('gift', 5, true, '{"auto_hide_after_hours": 24}'::jsonb)
) as v(type, order_index, is_visible, config)
where not exists (select 1 from public.blocks);
