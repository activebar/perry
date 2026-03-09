-- V13.14: Two-line footer support (optional)
-- Safe to run multiple times.

alter table if exists public.event_settings
  add column if not exists footer_line2_enabled boolean default false;

alter table if exists public.event_settings
  add column if not exists footer_line2_label text;

alter table if exists public.event_settings
  add column if not exists footer_line2_url text;
