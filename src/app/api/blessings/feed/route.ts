import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const sb = supabaseAnon()
    const { data: posts, error } = await sb
      .from('posts')
      .select('*')
      .eq('kind', 'blessing')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error
    const items = posts || []
    if (!items.length) return NextResponse.json({ ok: true, items: [] })

    const ids = items.map((p: any) => p.id)
    const device_id = cookies().get('device_id')?.value || null

    const srv = supabaseServiceRole()
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
        countsByPost[pid][emo] = (countsByPost[pid][emo] || 0) + 1

        if (device_id && (r as any).device_id === device_id) {
          myByPost[pid] ||= new Set()
          myByPost[pid].add(emo)
        }
      }
    }

    const out = items.map((p: any) => ({
      ...p,
      reaction_counts: countsByPost[p.id] || { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
      my_reactions: Array.from(myByPost[p.id] || [])
    }))

    return NextResponse.json({ ok: true, items: out })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
