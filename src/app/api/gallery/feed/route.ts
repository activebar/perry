import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Returns a feed for a specific gallery:
// - approved items for everyone
// - plus my own pending items (to allow the user to see what they uploaded)
// Also returns can_edit/can_delete (within 1 hour) without exposing device_id.

export async function GET(req: NextRequest) {
  try {
    const gallery_id = String(req.nextUrl.searchParams.get('gallery_id') || '').trim()
    if (!gallery_id) return NextResponse.json({ error: 'missing gallery_id' }, { status: 400 })

    const device_id = cookies().get('device_id')?.value || null
    const srv = supabaseServiceRole()

    // Approved posts for this gallery
    const { data: approved, error: aErr } = await srv
      .from('posts')
      .select('id, created_at, media_url, video_url, media_path, status, device_id')
      .eq('kind', 'gallery')
      .eq('gallery_id', gallery_id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(400)
    if (aErr) throw aErr

    let minePending: any[] = []
    if (device_id) {
      const { data: mine, error: mErr } = await srv
        .from('posts')
        .select('id, created_at, media_url, video_url, media_path, status, device_id')
        .eq('kind', 'gallery')
        .eq('gallery_id', gallery_id)
        .eq('device_id', device_id)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(100)
      if (!mErr) minePending = mine || []
    }

    // Merge, unique by id
    const byId = new Map<string, any>()
    for (const p of [...(approved || []), ...(minePending || [])]) {
      byId.set(String((p as any).id), p)
    }
    const items = Array.from(byId.values()).sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })

    const out = items.map((p: any) => {
      const createdMs = p.created_at ? new Date(p.created_at).getTime() : 0
      const canMine = !!(
        device_id &&
        p.device_id &&
        p.device_id === device_id &&
        createdMs &&
        Date.now() - createdMs < 60 * 60 * 1000
      )
      return {
        id: p.id,
        created_at: p.created_at,
        media_url: p.media_url,
        video_url: p.video_url,
        media_path: p.media_path,
        status: p.status,

        editable_until: createdMs ? new Date(createdMs + 60 * 60 * 1000).toISOString() : null,
        can_edit: canMine,
        can_delete: canMine,
      }
    })

    return NextResponse.json({ ok: true, items: out })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
