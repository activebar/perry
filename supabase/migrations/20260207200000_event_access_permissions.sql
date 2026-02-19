-- Add permissions (jsonb) for event access codes (client/photographer/partner)

alter table if exists public.event_access
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Backfill defaults by role (only for rows that still have empty permissions)
update public.event_access
set permissions =
  case
    when coalesce(permissions, '{}'::jsonb) = '{}'::jsonb then
      case
        when lower(coalesce(role, '')) = 'client' then
          jsonb_build_object('blessings.read', true, 'blessings.write', true)
        when lower(coalesce(role, '')) = 'photographer' then
          jsonb_build_object('galleries.read', true, 'galleries.write', true)
        when lower(coalesce(role, '')) = 'partner' then
          jsonb_build_object(
            'blessings.read', true,
            'blessings.moderate', true,
            'galleries.read', true,
            'galleries.write', true
          )
        else
          jsonb_build_object('blessings.read', true)
      end
    else permissions
  end;
