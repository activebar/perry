import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

const ALLOWED_KINDS = new Set(['blessing', 'gallery', 'gallery_admin'])

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const kind = String(body.kind || '')
    if (!ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: 'bad kind' }, { status: 400 })

    const device_id = cookies().get('device_id')?.value || null
    const srv = supabaseServiceRole()

    // basic anti-spam: only for public gallery/blessings
    if (device_id && (kind === 'gallery' || kind === 'blessing')) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count, error: cerr } = await srv
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', device_id)
        .gte('created_at', since)

      if (!cerr && (count || 0) >= 3) {
        return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
      }
    }

    const { data: settings, error: serr } = await srv
      .from('event_settings')
      .select('require_approval')
      .limit(1)
      .single()
    if (serr) throw serr

    const status = (kind === 'gallery_admin')
      ? 'approved'
      : (settings.require_approval ? 'pending' : 'approved')

    const insert = {
      kind,
      author_name: body.author_name || null,
      text: body.text || null,
      media_path: body.media_path || null,
      media_url: body.media_url || null,
      video_url: body.video_url || null,
      link_url: body.link_url || null,
      status,
      device_id
    }

    const { data, error } = await srv.from('posts').insert(insert).select('*').single()
    if (error) throw error

    if (insert.media_path) {
      await srv
        .from('media_items')
        .update({ post_id: data.id, kind })
        .eq('storage_path', insert.media_path)
        .is('post_id', null)
    }

    const post = { ...data, reaction_counts: { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }, my_reactions: [] }
    return NextResponse.json({ ok: true, status, post })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
