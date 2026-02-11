-- Add 'word' match_type to content_rules
do $$
begin
  -- drop existing check constraint if present
  if exists (
    select 1
    from pg_constraint
    where conname = 'content_rules_match_type_check'
  ) then
    alter table public.content_rules drop constraint content_rules_match_type_check;
  end if;
exception when undefined_table then
  -- table not found, ignore
end $$;

-- recreate constraint
alter table public.content_rules
  add constraint content_rules_match_type_check
  check (match_type in ('exact', 'contains', 'word'));
