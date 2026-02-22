import { NextRequest, NextResponse } from 'next/server'
import { getEventId } from '@/lib/event-id'
import { getDeviceId } from '@/lib/device'
import { supabaseServiceRole } from '@/lib/supabase'
import { openaiGenerateText } from '@/lib/ai'

export const dynamic = 'force-dynamic'

type Body = {
  text: string
  closeness?: string | null
  style?: string | null
  writer?: string | null
  mode?: 'improve' | 'shorter' | 'more_emotional' | 'more_formal' | 'more_funny'
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function cleanStr(s: any) {
  return String(s || '').trim()
}

function pickLengthProfile(closeness: string) {
  const c = closeness
  if (c.includes('משפחה')) return { minLines: 8, maxLines: 12, maxWords: 180, maxEmojis: 3 }
  if (c.includes('עבודה') || c.includes('קולגות') || c.includes('מכרים')) return { minLines: 2, maxLines: 3, maxWords: 45, maxEmojis: 1 }
  return { minLines: 4, maxLines: 6, maxWords: 90, maxEmojis: 2 }
}

function buildInstructions(args: {
  eventName: string
  closeness: string
  style: string
  writer: string
  mode: string
  minLines: number
  maxLines: number
  maxWords: number
  maxEmojis: number
}) {
  const softEmojis = '❤️✨😊🎉'
  return [
    'אתה כותב ברכה בעברית טבעית לאירוע.',
    `שם האירוע או החוגג: ${args.eventName}.`,
    args.closeness ? `קרבה לחוגג: ${args.closeness}.` : '',
    args.writer ? `תפקיד הכותב: ${args.writer}. אם יש סתירה לקרבה, תפקיד הכותב מנצח.` : '',
    args.style ? `סגנון כתיבה: ${args.style}.` : '',
    `יעד אורך: בין ${args.minLines} ל ${args.maxLines} שורות, עד ${args.maxWords} מילים.`,
    `אימוגים בעדינות בלבד. עד ${args.maxEmojis}. רק מתוך ${softEmojis}.`,
    'לא להשתמש בתו מינוס בכלל.',
    'לא לכתוב רשימות עם מקפים.',
    'סיום חם עם איחול.',
    args.mode === 'shorter' ? 'קצר יותר, שמור על משמעות.' : '',
    args.mode === 'more_emotional' ? 'הפוך את הטון ליותר מרגש, בלי קלישאות כבדות.' : '',
    args.mode === 'more_formal' ? 'הפוך את הטון לרשמי ומכובד.' : '',
    args.mode === 'more_funny' ? 'הפוך את הטון לקליל ומצחיק בעדינות, בלי ציניות.' : '',
    'החזר טקסט בלבד, בלי כותרות ובלי מרכאות.'
  ]
    .filter(Boolean)
    .join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null
    const text = cleanStr(body?.text)
    if (!text) return NextResponse.json({ error: 'missing text' }, { status: 400 })

    const eventId = getEventId()
    const deviceId = getDeviceId() || 'unknown'

    const srv = supabaseServiceRole()
    const { data: settingsRow, error: sErr } = await srv
      .from('event_settings')
      .select('*')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (sErr) throw sErr

    const enabled = (settingsRow as any)?.ai_blessing_enabled !== false
    if (!enabled) return NextResponse.json({ error: 'ai disabled' }, { status: 403 })

    const dailyLimit = clamp(Number((settingsRow as any)?.ai_blessing_daily_limit ?? 3), 0, 50)
    if (dailyLimit === 0) return NextResponse.json({ error: 'ai disabled' }, { status: 403 })

    const today = new Date()
    const day = today.toISOString().slice(0, 10)

    const { data: usageRow } = await srv
      .from('ai_usage_daily')
      .select('*')
      .eq('event_id', eventId)
      .eq('device_id', deviceId)
      .eq('day', day)
      .maybeSingle()

    const currentCount = Number((usageRow as any)?.count ?? 0)
    if (currentCount >= dailyLimit) {
      return NextResponse.json({ error: 'limit reached' }, { status: 429 })
    }

    const closeness = cleanStr(body?.closeness)
    const style = cleanStr(body?.style)
    const writer = cleanStr(body?.writer)
    const mode = cleanStr(body?.mode || 'improve')

    const profile = pickLengthProfile(closeness)
    const instructions = buildInstructions({
      eventName: cleanStr((settingsRow as any)?.event_name || 'האירוע'),
      closeness,
      style,
      writer,
      mode,
      ...profile
    })

    const suggestion = await openaiGenerateText({
      instructions,
      input: text,
      maxOutputTokens: 450,
      temperature: 0.8
    })

    // update usage
    const nextCount = currentCount + 1
    await srv
      .from('ai_usage_daily')
      .upsert(
        { event_id: eventId, device_id: deviceId, day, count: nextCount },
        { onConflict: 'event_id,device_id,day' }
      )

    return NextResponse.json({ ok: true, suggestion, used: nextCount, limit: dailyLimit })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
