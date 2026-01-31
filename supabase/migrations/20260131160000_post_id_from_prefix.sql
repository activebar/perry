-- Resolve a UUID post id by a short prefix (first segment)
-- Usage: select post_id_from_prefix('248fc316');

create or replace function public.post_id_from_prefix(p_prefix text)
returns uuid
language plpgsql
stable
as $$
declare
  v uuid;
begin
  select p.id into v
  from public.posts p
  where lower(p.id::text) like lower(p_prefix) || '%'
  order by p.created_at desc
  limit 1;

  return v;
end;
$$;
