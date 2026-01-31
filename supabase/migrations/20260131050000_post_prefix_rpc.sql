-- Resolve a post UUID by short prefix (e.g. first 8 hex chars)
-- Needed because applying ILIKE to a uuid column is unreliable (and may error)

create or replace function public.post_id_from_prefix(p_prefix text)
returns uuid
language sql
stable
as $$
  select p.id
  from public.posts p
  where p.id::text ilike (p_prefix || '%')
  order by p.created_at desc nulls last
  limit 1;
$$;
