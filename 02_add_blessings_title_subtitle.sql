-- Add configurable Blessings block title + subtitle (used on Home + Blessings pages)
alter table public.event_settings
  add column if not exists blessings_title text,
  add column if not exists blessings_subtitle text;
