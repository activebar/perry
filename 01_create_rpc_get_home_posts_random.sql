-- Random approved blessings (posts) for Home page
create or replace function public.get_home_posts_random(p_limit int)
returns setof public.posts
language sql
stable
as $$
  select *
  from public.posts
  where kind = 'blessing'
    and status = 'approved'
  order by random()
  limit greatest(0, least(p_limit, 20));
$$;
