create table if not exists public.site_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  description text,
  config_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_templates_kind_idx on public.site_templates(kind);
create index if not exists site_templates_active_idx on public.site_templates(is_active);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_site_templates_updated_at on public.site_templates;
create trigger trg_site_templates_updated_at
before update on public.site_templates
for each row execute procedure public.set_updated_at();
