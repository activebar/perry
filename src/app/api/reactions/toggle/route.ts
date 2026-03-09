import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

const EMOJIS = new Set(['👍', '😍', '🔥', '🙏'])

/**
 * Single reaction per device per post:
 * - clicking the same emoji again removes it
 * - clicking a different emoji replaces the previous one
 */
export async function POST(req: Request) {
  try {
    const { post_id, emoji } = await req.json()
    if (!post_id || !emoji || !EMOJIS.has(emoji)) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const device_id = cookies().get('device_id')?.value
    if (!device_id) return NextResponse.json({ error: 'missing device_id' }, { status: 400 })

    const srv = supabaseServiceRole()

    // do I already have THIS emoji?
    const { data: existingSame } = await srv
      .from('reactions')
      .select('id')
      .eq('post_id', post_id)
      .eq('device_id', device_id)
      .eq('emoji', emoji)
      .limit(1)

    if (existingSame && existingSame.length) {
      // toggle off
      await srv.from('reactions').delete().eq('id', existingSame[0].id)
    } else {
      // replace: delete any existing reaction for this device/post, then add the new one
      await srv.from('reactions').delete().eq('post_id', post_id).eq('device_id', device_id)
      await srv.from('reactions').insert({ post_id, device_id, emoji })
    }

    // recompute counts
    const { data: rows, error } = await srv.from('reactions').select('emoji').eq('post_id', post_id)
    if (error) throw error

    const counts: Record<string, number> = { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
    for (const r of rows || []) counts[(r as any).emoji] = (counts[(r as any).emoji] || 0) + 1

    // my current reaction (single)
    const { data: myRow } = await srv
      .from('reactions')
      .select('emoji')
      .eq('post_id', post_id)
      .eq('device_id', device_id)
      .limit(1)

    const my = (myRow && myRow.length) ? [myRow[0].emoji] : []

    return NextResponse.json({ ok: true, counts, my })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
