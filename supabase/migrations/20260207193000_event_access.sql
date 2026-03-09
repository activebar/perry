-- Event access codes + sessions (V10.7)

create table if not exists public.event_access (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  name text not null,
  role text not null default 'client',
  phone text,
  email text,
  is_active boolean not null default true,
  code_hash text not null,
  session_version int not null default 1,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_access_event_id_idx on public.event_access(event_id);
create index if not exists event_access_email_idx on public.event_access(email);
create index if not exists event_access_phone_idx on public.event_access(phone);

create table if not exists public.event_access_sessions (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null,
  event_id text not null,
  device_label text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists event_access_sessions_access_id_idx on public.event_access_sessions(access_id);

-- (Optional) trigger for updated_at
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_event_access_updated_at on public.event_access;
create trigger trg_event_access_updated_at
before update on public.event_access
for each row execute procedure public.set_updated_at();
