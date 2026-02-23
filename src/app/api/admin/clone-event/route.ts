import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

type TemplateKind = 'bar_mitzvah' | 'wedding' | 'trip'

function buildAiConfig(params: {
  templateKind: TemplateKind
  subjectName: string
  eventType: string
  contentGoal: string
}) {
  const { templateKind, subjectName, eventType, contentGoal } = params

  const base = {
    enabled: true,
    daily_limit: 3,
    emoji_limit: 2,
    length_policy: { mode: 'lines', min_lines: 4, max_lines: 6, max_words: 90 },
    seed_text_from_admin: 'מזל טוב',
    style_mode_default: 'auto',
    allow_other_writer: true,
    manual_styles_buttons: ['מרגש', 'מצחיק', 'רשמי'],
    styles: [
      { label: 'מרגש', enabled: true, instruction: 'שפה חמה, אישית, בלי קלישאות, סיום עם איחול', emoji_limit: 2 },
      { label: 'מצחיק', enabled: true, instruction: 'קליל, חיוך עדין, בלי הגזמות, עדיין מכבד', emoji_limit: 2 },
      { label: 'רשמי', enabled: true, instruction: 'מכובד, קצר יחסית, ניסוח נקי', emoji_limit: 1 },
      { label: 'קליל', enabled: true, instruction: 'זורם, פשוט, מפרגן', emoji_limit: 2 },
    ],
    writers: [] as any[],
    auto_style_map: {} as Record<string, string>,
    subject_name: subjectName,
    event_type: eventType,
    content_goal: contentGoal,
  }

  if (templateKind === 'bar_mitzvah') {
    base.seed_text_from_admin = 'מזל טוב'
    base.length_policy = { mode: 'lines', min_lines: 4, max_lines: 6, max_words: 90 }
    base.writers = [
      { label: 'אבא', enabled: true, default_style: 'מרגש' },
      { label: 'אמא', enabled: true, default_style: 'מרגש' },
      { label: 'סבא', enabled: true, default_style: 'מרגש' },
      { label: 'סבתא', enabled: true, default_style: 'מרגש' },
      { label: 'דוד', enabled: true, default_style: 'קליל' },
      { label: 'דודה', enabled: true, default_style: 'קליל' },
      { label: 'חבר מהכיתה', enabled: true, default_style: 'מצחיק' },
      { label: 'מורה', enabled: true, default_style: 'רשמי' },
      { label: 'חברים', enabled: true, default_style: 'קליל' },
    ]
  } else if (templateKind === 'wedding') {
    base.seed_text_from_admin = 'מזל טוב'
    base.length_policy = { mode: 'lines', min_lines: 5, max_lines: 8, max_words: 130 }
    base.writers = [
      { label: 'הורים', enabled: true, default_style: 'מרגש' },
      { label: 'אח', enabled: true, default_style: 'קליל' },
      { label: 'אחות', enabled: true, default_style: 'קליל' },
      { label: 'חברים', enabled: true, default_style: 'מצחיק' },
      { label: 'מהעבודה', enabled: true, default_style: 'רשמי' },
      { label: 'משפחה', enabled: true, default_style: 'מרגש' },
    ]
  } else {
    base.seed_text_from_admin = 'חוויה מעולה'
    base.manual_styles_buttons = ['קליל', 'רשמי', 'מרגש']
    base.length_policy = { mode: 'lines', min_lines: 3, max_lines: 6, max_words: 90 }
    base.writers = [
      { label: 'חבר', enabled: true, default_style: 'קליל' },
      { label: 'חברה', enabled: true, default_style: 'קליל' },
      { label: 'משפחה', enabled: true, default_style: 'מרגש' },
      { label: 'מכר', enabled: true, default_style: 'רשמי' },
    ]
  }

  base.auto_style_map = Object.fromEntries(base.writers.map((w: any) => [w.label, w.default_style]))
  return base
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const newEventId = String(body?.new_event_id || '').trim()
    const templateKind = (String(body?.template_kind || 'bar_mitzvah') as TemplateKind)
    const subjectName = String(body?.subject_name || '').trim()
    const eventType = String(body?.event_type || '').trim()
    const contentGoal = String(body?.content_goal || '').trim()

    if (!newEventId) return NextResponse.json({ error: 'missing new_event_id' }, { status: 400 })

    const env = getServerEnv()
    const sourceEventId = env.EVENT_SLUG || 'ido'

    const sb = supabaseServiceRole

    const [blocksRes, galleriesRes, rulesRes, settingsRes] = await Promise.all([
      sb.from('blocks').select('*').eq('event_id', sourceEventId),
      sb.from('galleries').select('*').eq('event_id', sourceEventId),
      sb.from('content_rules').select('*').eq('event_id', sourceEventId),
      sb.from('event_settings').select('*').eq('event_id', sourceEventId),
    ])

    if (blocksRes.error) throw blocksRes.error
    if (galleriesRes.error) throw galleriesRes.error
    if (rulesRes.error) throw rulesRes.error
    if (settingsRes.error) throw settingsRes.error

    const nowIso = new Date().toISOString()

    const settingsToInsert = (settingsRes.data || []).map((s: any) => ({
      event_id: newEventId,
      key: s.key,
      value_json: s.value_json ?? {},
      updated_at: nowIso,
    }))

    if (settingsToInsert.length) {
      const up = await sb.from('event_settings').upsert(settingsToInsert, { onConflict: 'event_id,key' })
      if (up.error) throw up.error
    }

    const aiConfig = buildAiConfig({
      templateKind,
      subjectName: subjectName || (templateKind === 'trip' ? 'הטיול' : 'החוגג'),
      eventType: eventType || (templateKind === 'trip' ? 'טיול' : templateKind === 'wedding' ? 'חתונה' : 'בר מצווה'),
      contentGoal: contentGoal || (templateKind === 'trip' ? 'המלצה' : 'ברכה'),
    })

    const upAi = await sb
      .from('event_settings')
      .upsert([{ event_id: newEventId, key: 'ai_config', value_json: aiConfig, updated_at: nowIso }], { onConflict: 'event_id,key' })
    if (upAi.error) throw upAi.error

    const blocksToInsert = (blocksRes.data || []).map((b: any) => ({
      event_id: newEventId,
      page: b.page,
      key: b.key,
      title: b.title,
      config_json: b.config_json ?? {},
      is_enabled: b.is_enabled ?? true,
      sort_order: b.sort_order ?? 0,
      updated_at: nowIso,
    }))
    if (blocksToInsert.length) {
      const ins = await sb.from('blocks').insert(blocksToInsert)
      if (ins.error) throw ins.error
    }

    const galleriesToInsert = (galleriesRes.data || []).map((g: any) => ({
      event_id: newEventId,
      name: g.name,
      slug: g.slug,
      is_enabled: g.is_enabled ?? true,
      upload_enabled: g.upload_enabled ?? false,
      show_in_home: g.show_in_home ?? true,
      created_at: nowIso,
      updated_at: nowIso,
    }))
    if (galleriesToInsert.length) {
      const ins = await sb.from('galleries').insert(galleriesToInsert)
      if (ins.error) throw ins.error
    }

    const rulesToInsert = (rulesRes.data || []).map((r: any) => ({
      event_id: newEventId,
      phrase: r.phrase,
      match_type: r.match_type,
      action: r.action,
      is_active: r.is_active ?? true,
      created_at: nowIso,
    }))
    if (rulesToInsert.length) {
      const ins = await sb.from('content_rules').insert(rulesToInsert)
      if (ins.error) throw ins.error
    }

    await sb.from('event_admins').insert([{ event_id: newEventId, admin_user_id: admin.id, role: 'event_admin', is_active: true }])

    return NextResponse.json({ ok: true, source_event_id: sourceEventId, new_event_id: newEventId, template_kind: templateKind })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
