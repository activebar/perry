import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const
const EMOJI_SET = new Set<string>(EMOJIS)
type Emoji = (typeof EMOJIS)[number]
type EmojiCounts = Record<Emoji, number>

function isEmoji(value: string): value is Emoji {
  return EMOJI_SET.has(value)
}

function emptyCounts(): EmojiCounts {
  return { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
}

export async function GET(req: NextRequest) {
  try {
    const idsRaw = String(new URL(req.url).searchParams.get('ids') || '')
    const ids = idsRaw
      .split(',')
      .map((x) => x.trim())
      .filter((x) => /^[0-9a-f-]{36}$/i.test(x))
      .slice(0, 200)

    if (ids.length === 0) return NextResponse.json({ by_id: {} })

    const deviceId = cookies().get('device_id')?.value || ''
    const srv = supabaseServiceRole()

    const { data: rows, error } = await srv.from('reactions').select('post_id, emoji, device_id').in('post_id', ids as any)
    if (error) throw error

    const byId: Record<string, { counts: EmojiCounts; my: Emoji[] }> = {}
    for (const id of ids) byId[id] = { counts: emptyCounts(), my: [] }

    for (const row of rows || []) {
      const id = String((row as any).post_id || '')
      const emojiRaw = String((row as any).emoji || '')
      if (!byId[id] || !isEmoji(emojiRaw)) continue
      byId[id].counts[emojiRaw] = Number(byId[id].counts[emojiRaw] || 0) + 1
      if (deviceId && String((row as any).device_id || '') === deviceId) {
        byId[id].my = [emojiRaw]
      }
    }

    return NextResponse.json({ by_id: byId }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const mediaItemId = String(body?.media_item_id || '').trim()
    const emojiRaw = String(body?.emoji || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(mediaItemId) || !isEmoji(emojiRaw)) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const deviceId = cookies().get('device_id')?.value || String(body?.device_id || '').trim()
    if (!deviceId) return NextResponse.json({ error: 'missing device_id' }, { status: 400 })

    const srv = supabaseServiceRole()

    const { data: existingSame } = await srv
      .from('reactions')
      .select('id')
      .eq('post_id', mediaItemId)
      .eq('device_id', deviceId)
      .eq('emoji', emojiRaw)
      .limit(1)

    if (existingSame && existingSame.length) {
      await srv.from('reactions').delete().eq('id', (existingSame[0] as any).id)
    } else {
      await srv.from('reactions').delete().eq('post_id', mediaItemId).eq('device_id', deviceId)
      await srv.from('reactions').insert({ post_id: mediaItemId, device_id: deviceId, emoji: emojiRaw })
    }

    const { data: rows, error } = await srv.from('reactions').select('emoji, device_id').eq('post_id', mediaItemId)
    if (error) throw error

    const counts = emptyCounts()
    let my: Emoji[] = []
    for (const row of rows || []) {
      const currentEmoji = String((row as any).emoji || '')
      if (!isEmoji(currentEmoji)) continue
      counts[currentEmoji] = Number(counts[currentEmoji] || 0) + 1
      if (String((row as any).device_id || '') === deviceId) my = [currentEmoji]
    }

    return NextResponse.json({ ok: true, counts, my })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
