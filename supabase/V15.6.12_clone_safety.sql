-- Clone safety indexes (optional)
-- Run in Supabase SQL editor
-- This script is "schema-aware" and will only create indexes when the referenced columns exist.

do $$
begin
  -- event_settings
  -- In this project event_settings is usually a "wide" table (one row per event_id).
  -- If you have a key/value schema (event_id, key, value_json) the script will prefer (event_id, key).

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_settings' and column_name = 'key'
  ) then
    execute 'create unique index if not exists ux_event_settings_event_key on public.event_settings (event_id, key)';
  else
    execute 'create unique index if not exists ux_event_settings_event_id on public.event_settings (event_id)';
  end if;

  -- blocks
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'blocks' and column_name = 'key'
  ) then
    execute 'create unique index if not exists ux_blocks_event_page_key on public.blocks (event_id, page, key)';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'blocks' and column_name = 'block_key'
  ) then
    execute 'create unique index if not exists ux_blocks_event_page_key on public.blocks (event_id, page, block_key)';
  end if;

  -- content_rules
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_rules' and column_name = 'phrase'
  ) then
    execute 'create unique index if not exists ux_content_rules_event_phrase_match on public.content_rules (event_id, phrase, match_type)';
  end if;

  -- galleries (optional)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'galleries' and column_name = 'slug'
  ) then
    -- only useful if you actually use slug
    -- execute 'create unique index if not exists ux_galleries_event_slug on public.galleries (event_id, slug)';
    null;
  end if;
end $$;
