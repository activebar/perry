-- Content rules: manager-controlled allow/block lists.

create table if not exists public.content_rules (
  id bigserial primary key,
  rule_type text not null check (rule_type in ('block','allow')),
  -- scope is reserved for future multi-event support; for now it's informational.
  scope text not null default 'event' check (scope in ('event','global')),
  event_id text null,
  match_type text not null default 'contains' check (match_type in ('exact','contains')),
  expression text not null,
  is_active boolean not null default true,
  note text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_rules_active_idx
  on public.content_rules (is_active, rule_type, scope);

-- Keep updated_at current
create or replace function public.set_updated_at_content_rules()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_content_rules_updated_at on public.content_rules;
create trigger trg_content_rules_updated_at
before update on public.content_rules
for each row execute function public.set_updated_at_content_rules();
