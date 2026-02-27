-- Allow match_type = 'word' (whole word) in content_rules
-- Safe: drops & recreates the CHECK constraint.
alter table public.content_rules drop constraint if exists content_rules_match_type_check;

alter table public.content_rules
  add constraint content_rules_match_type_check
  check (match_type in ('exact','contains','word'));
