-- Clone safety indexes (optional)
-- Run in Supabase SQL editor

create unique index if not exists ux_event_settings_event_key
on public.event_settings (event_id, key);

create unique index if not exists ux_blocks_event_page_key
on public.blocks (event_id, page, key);

create unique index if not exists ux_content_rules_event_phrase_match
on public.content_rules (event_id, phrase, match_type);

-- optional: avoid duplicate gallery slugs per event (only if you actually use slug)
-- create unique index if not exists ux_galleries_event_slug
-- on public.galleries (event_id, slug);
