import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'
import { getEventId } from '@/lib/event-id'
import { getDeviceId } from '@/lib/device'

export const dynamic = 'force-dynamic'

type Payload = {
  mode?: string
  text?: string
  closeness?: string
  style?: string
  writer?: string
}

async function getLatestSettingsRow(eventId: string) {
  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('event_settings')
    .select('*')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) throw error
  return data as any
}

async function bumpDailyUsage(eventId: string, deviceId: string, limit: number) {
  const srv = supabaseServiceRole()
  const day = new Date().toISOString().slice(0, 10)

  const { data: existing, error: readErr } = await srv
    .from('ai_usage_daily')
    .select('*')
    .eq('event_id', eventId)
    .eq('device_id', deviceId)
    .eq('day', day)
    .maybeSingle()

  if (readErr) throw readErr

  const used = Number(existing?.count || 0)
  if (used >= limit) return { ok: false, used, day }

  const nextCount = used + 1
  if (existing?.id) {
    const { error: upErr } = await srv
      .from('ai_usage_daily')
      .update({ count: nextCount, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (upErr) throw upErr
  } else {
    const { error: insErr } = await srv.from('ai_usage_daily').insert({
      event_id: eventId,
      device_id: deviceId,
      day,
      count: nextCount
    })
    if (insErr) throw insErr
  }

  return { ok: true, used: nextCount, day }
}

async function callOpenAI(opts: { apiKey: string; model: string; prompt: string }) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify({
      model: opts.model,
      input: opts.prompt,
      max_output_tokens: 350
    })
  })

  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || 'OpenAI error'
    throw new Error(msg)
  }

  const out = data?.output
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text
          if (typeof t === 'string' && t.trim()) return t.trim()
        }
      }
    }
  }

  const t1 = data?.output_text
  if (typeof t1 === 'string' && t1.trim()) return t1.trim()

  throw new Error('No text returned')
}

export async function POST(req: NextRequest) {
  try {
    const env = getServerEnv()
    if (!env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'missing_openai_key' }, { status: 400 })
    }

    const eventId = getEventId()
    const deviceId = getDeviceId() || 'unknown'

    const body = (await req.json()) as Payload
    const text = String(body?.text || '').trim()
    if (!text) return NextResponse.json({ error: 'missing_text' }, { status: 400 })

    const settings = await getLatestSettingsRow(eventId)

    if (settings?.ai_blessing_enabled === false) {
      return NextResponse.json({ error: 'ai_disabled' }, { status: 403 })
    }

    const dailyLimit = Math.max(0, Number(settings?.ai_daily_limit ?? 3) || 3)
    if (dailyLimit > 0 && deviceId !== 'unknown') {
      const usage = await bumpDailyUsage(eventId, deviceId, dailyLimit)
      if (!usage.ok) {
        return NextResponse.json({ error: 'daily_limit', used: usage.used, day: usage.day }, { status: 429 })
      }
    }

    const eventName = String(settings?.event_name || 'האירוע')
    const mode = String(body?.mode || 'improve')
    const closeness = String(body?.closeness || '')
    const style = String(body?.style || '')
    const writer = String(body?.writer || '')

    const prompt = [
      `אתה עוזר לנסח ברכה בעברית טבעית לאירוע.`,
      `שם האירוע: ${eventName}.`,
      closeness ? `קרבה לחוגג: ${closeness}.` : '',
      style ? `סגנון כתיבה: ${style}.` : '',
      writer ? `מי כותב: ${writer}.` : '',
      `הנחיות:`,
      `כתוב בצורה ברורה, נעימה, ולא ארוך מדי.`,
      `מותר להשתמש באימוגים רכים בעדינות בלבד.`,
      `לא להשתמש בתו מקף.`,
      `סיים באיחול חם.`,
      ``,
      `הטקסט של האורח:`,
      text,
      ``,
      mode === 'improve' ? `משימה: שפר את הטקסט ושמור על אותנטיות.` : `משימה: שפר את הטקסט ושמור על אותנטיות.`,
      `החזר רק את הברכה המשופרת ללא הסברים.`
    ]
      .filter(Boolean)
      .join('\n')

    const model = env.OPENAI_WRITING_MODEL || 'gpt-4o-mini'
    const suggestion = await callOpenAI({ apiKey: env.OPENAI_API_KEY, model, prompt })

    return NextResponse.json({ suggestion })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
