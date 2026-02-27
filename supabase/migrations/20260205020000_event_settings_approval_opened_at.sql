-- Add approval_opened_at to event_settings
-- This timestamp is updated only when the admin explicitly opens blessings for auto publish
-- by switching require_approval from true to false.

alter table public.event_settings
add column if not exists approval_opened_at timestamptz;

-- Optional backfill: if require_approval is currently false and approval_opened_at is null,
-- set approval_opened_at to updated_at (best available approximation).
update public.event_settings
set approval_opened_at = coalesce(approval_opened_at, updated_at, created_at)
where require_approval = false
  and approval_opened_at is null;
