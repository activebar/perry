-- Add optional fields for short links (bl/gl) without breaking existing installs
alter table public.short_links
  add column if not exists kind text;

alter table public.short_links
  add column if not exists updated_at timestamptz default now();

-- Optional: keep updated_at fresh (best-effort; can be skipped if triggers not desired)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_short_links_updated_at') then
    create or replace function public.set_updated_at() returns trigger as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$ language plpgsql;

    create trigger trg_short_links_updated_at
    before update on public.short_links
    for each row execute function public.set_updated_at();
  end if;
exception when others then
  -- ignore if permissions / plpgsql not available in this context
  null;
end $$;
