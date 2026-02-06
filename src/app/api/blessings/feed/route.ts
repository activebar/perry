import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'
import { getEventId } from '@/lib/event-id'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const srv = supabaseServiceRole()

  const { data: posts, error } = await srv
    .from('posts')
    .select('id, created_at, author_name, text, media_url, video_url, link_url, status, device_id')
    .eq('event_id', getEventId())
    .eq('kind', 'blessing')
    .ilike('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const safe = (posts || []).map((p: any) => ({
    id: p.id,
    created_at: p.created_at,
    author_name: p.author_name,
    text: p.text,
    media_url: p.media_url,
    video_url: p.video_url,
    link_url: p.link_url,
    status: p.status,
  }))

  return NextResponse.json({ ok: true, posts: safe })
}
