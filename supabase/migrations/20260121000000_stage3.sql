-- Stage 3: Blessings preview + auto-approval lock
alter table if exists public.event_settings
  add column if not exists blessings_preview_limit integer default 3,
  add column if not exists blessings_show_all_button boolean default true,
  add column if not exists approval_lock_after_days integer default 7;

-- Optional: ensure status supports 'deleted' (soft delete). If you use an enum, adjust accordingly.
