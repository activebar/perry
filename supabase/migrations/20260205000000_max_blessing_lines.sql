-- Add manager-controlled max lines limit for blessings
alter table public.event_settings
add column if not exists max_blessing_lines integer default 50;

-- Optional: ensure non-negative
alter table public.event_settings
alter column max_blessing_lines set default 50;
