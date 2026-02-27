-- Short links for sharing blessings and other resources

create table if not exists public.short_links (
  code text primary key,
  post_id uuid null,
  target_path text null,
  created_at timestamp with time zone not null default now()
);

alter table public.short_links enable row level security;

-- Allow anyone to read short links (needed for server-side metadata generation)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='short_links' and policyname='short_links_read'
  ) then
    create policy short_links_read on public.short_links for select using (true);
  end if;
end $$;

-- Writes are done from the server (service role). If you need client-side writes,
-- add an insert policy scoped to authenticated users.
