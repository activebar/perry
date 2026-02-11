-- Stage: QR + Sharing settings
alter table public.event_settings
  add column if not exists qr_title text default 'סרקו והוסיפו ברכה',
  add column if not exists qr_subtitle text default 'פותח את עמוד הברכות',
  add column if not exists qr_target_path text default '/blessings',
  add column if not exists qr_btn_download_label text default 'הורד כתמונה',
  add column if not exists qr_btn_copy_label text default 'העתק קישור',
  add column if not exists qr_btn_whatsapp_label text default 'שלח בוואטסאפ',
  add column if not exists qr_enabled_admin boolean default true,
  add column if not exists qr_enabled_blessings boolean default true,

  add column if not exists share_enabled boolean default true,
  add column if not exists share_whatsapp_enabled boolean default true,
  add column if not exists share_webshare_enabled boolean default true,
  add column if not exists share_use_permalink boolean default true,
  add column if not exists share_button_label text default 'שתף',
  add column if not exists share_whatsapp_button_label text default 'שתף בוואטסאפ',
  add column if not exists share_native_button_label text default 'שיתוף',
  add column if not exists share_modal_title text default 'שיתוף',
  add column if not exists share_no_text_fallback text default 'נשלחה ברכה מהממת 💙',
  add column if not exists share_message_template text default E'🎉 {EVENT_NAME} 🎉\n\n{TEXT}\n\n📌 לצפייה בעוד ברכות ותמונות:\n{LINK}';


-- v4 additions
alter table public.event_settings
  add column if not exists qr_blessings_cta_label text default 'סרקו / שתפו את עמוד הברכות',
  add column if not exists og_default_image_url text;
