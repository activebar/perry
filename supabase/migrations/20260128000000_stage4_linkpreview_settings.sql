-- Stage 4: Link Preview + Blessings UI settings (per event)

alter table public.event_settings
  add column if not exists link_preview_enabled boolean not null default true,
  add column if not exists link_preview_show_details boolean not null default true,
  add column if not exists blessings_media_size integer not null default 250,
  add column if not exists blessings_title text not null default 'ברכות',
  add column if not exists blessings_subtitle text not null default 'כתבו ברכה, צרפו תמונה, ותנו ריאקשן.';
