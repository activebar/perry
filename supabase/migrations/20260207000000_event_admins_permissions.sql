-- V10.5 - Event Admin permissions (per-event) + management tab
-- Creates event_admins table to link admin_users to events with a permissions jsonb map.

create table if not exists public.event_admins (
  event_id uuid not null references public.events(id) on delete cascade,
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_id, admin_user_id)
);

alter table public.event_admins enable row level security;

-- No RLS policies are added here on purpose.
-- Admin management is performed via server routes using the Service Role key.
