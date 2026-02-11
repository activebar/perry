-- V12.10: when inserting a gallery, auto-create a matching block (if missing)
-- Assumes public.blocks has: id uuid, event_id text, type text, order_index int4, is_visible bool, config jsonb

create or replace function public._ensure_gallery_block()
returns trigger
language plpgsql
as $$
declare
  next_order int;
begin
  -- if there is already a block referencing this gallery, do nothing
  if exists (
    select 1 from public.blocks b
    where b.event_id = new.event_id
      and b.type like 'gallery%'
      and (b.config->>'gallery_id') = new.id::text
  ) then
    return new;
  end if;

  select coalesce(max(order_index), 0) + 1 into next_order
  from public.blocks
  where event_id = new.event_id;

  insert into public.blocks (id, event_id, type, order_index, is_visible, config)
  values (
    gen_random_uuid(),
    new.event_id,
    'gallery',
    next_order,
    true,
    jsonb_build_object(
      'title', new.title,
      'button_label', 'לכל התמונות',
      'gallery_id', new.id::text,
      'limit', 12
    )
  );

  return new;
end;
$$;

drop trigger if exists ensure_gallery_block on public.galleries;
create trigger ensure_gallery_block
after insert on public.galleries
for each row execute function public._ensure_gallery_block();
