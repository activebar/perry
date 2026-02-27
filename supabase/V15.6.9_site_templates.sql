-- V15.6.9: Site Templates table

create table if not exists public.site_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'generic',
  description text,
  is_active boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- optional trigger to keep updated_at fresh
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_site_templates_updated_at on public.site_templates;
create trigger trg_site_templates_updated_at
before update on public.site_templates
for each row execute function public.set_updated_at();

alter table public.site_templates enable row level security;

-- Policies (Supabase does not support "create policy if not exists")
drop policy if exists "site_templates admin only" on public.site_templates;
create policy "site_templates admin only" on public.site_templates
for all
to authenticated
using (
  exists (select 1 from public.admin_users au where au.id = auth.uid() and au.is_active = true)
)
with check (
  exists (select 1 from public.admin_users au where au.id = auth.uid() and au.is_active = true)
);
