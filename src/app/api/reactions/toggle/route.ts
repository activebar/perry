import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

const EMOJIS = new Set(['👍', '😍', '🔥', '🙏'])

export async function POST(req: Request) {
  try {
    const { post_id, emoji } = await req.json()
    if (!post_id || !emoji || !EMOJIS.has(emoji)) {
      return NextResponse.json({ error: 'bad request' }, { status: 400 })
    }

    const device_id = cookies().get('device_id')?.value
    if (!device_id) return NextResponse.json({ error: 'missing device_id' }, { status: 400 })

    const srv = supabaseServiceRole()

    const { data: existing, error: exErr } = await srv
      .from('reactions')
      .select('id')
      .eq('post_id', post_id)
      .eq('device_id', device_id)
      .eq('emoji', emoji)
      .limit(1)

    if (exErr) throw exErr

    if (existing && existing.length) {
      const { error } = await srv.from('reactions').delete().eq('id', existing[0].id)
      if (error) throw error
    } else {
      const { error } = await srv.from('reactions').insert({ post_id, device_id, emoji })
      if (error) throw error
    }

    const { data: rows, error: rErr } = await srv
      .from('reactions')
      .select('emoji, device_id')
      .eq('post_id', post_id)

    if (rErr) throw rErr

    const counts: Record<string, number> = { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
    const my: string[] = []

    for (const r of rows || []) {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1
      if (r.device_id === device_id) my.push(r.emoji)
    }

    return NextResponse.json({ ok: true, counts, my })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
