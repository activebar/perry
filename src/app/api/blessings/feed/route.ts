import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'
import { getEventId } from '@/lib/event-id'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

export async function GET() {
  try {
    const device_id = cookies().get('device_id')?.value || null
    const srv = supabaseServiceRole()

    // We select the minimal fields we actually need.
    // NOTE: we DO select device_id to compute can_edit/can_delete, but we do NOT return it to the client.
    const { data: posts, error } = await srv
      .from('posts').eq('event_id', getEventId())
      .select('id, created_at, author_name, text, media_url, video_url, link_url, status, device_id')
      .eq('kind', 'blessing')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    const items = posts || []
    if (!items.length) return NextResponse.json({ ok: true, items: [] })

    const ids = items.map((p: any) => p.id)

    // reactions: counts + my reactions
    const { data: rRows, error: rErr } = await srv
      .from('reactions')
      .select('post_id, emoji, device_id')
      .in('post_id', ids)

    const countsByPost: Record<string, Record<string, number>> = {}
    const myByPost: Record<string, Set<string>> = {}

    if (!rErr) {
      for (const r of rRows || []) {
        const pid = (r as any).post_id
        const emo = (r as any).emoji

        countsByPost[pid] ||= { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
        if ((EMOJIS as readonly string[]).includes(emo)) {
          countsByPost[pid][emo] = (countsByPost[pid][emo] || 0) + 1
        }

        if (device_id && (r as any).device_id === device_id) {
          myByPost[pid] ||= new Set()
          myByPost[pid].add(emo)
        }
      }
    }

    const out = items.map((p: any) => {
      const createdMs = p.created_at ? new Date(p.created_at).getTime() : 0
      const canMine = !!(device_id && p.device_id && p.device_id === device_id && createdMs && (Date.now() - createdMs) < 60 * 60 * 1000)

      return {
        id: p.id,
        created_at: p.created_at,
        author_name: p.author_name,
        text: p.text,
        media_url: p.media_url,
        video_url: p.video_url,
        link_url: p.link_url,
        status: p.status,

        editable_until: createdMs ? new Date(createdMs + 60 * 60 * 1000).toISOString() : null,
        can_delete: canMine,
        can_edit: canMine,

        reaction_counts: countsByPost[p.id] || { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
        my_reactions: Array.from(myByPost[p.id] || [])
      }
    })

    return NextResponse.json({ ok: true, items: out })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
