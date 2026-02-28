import { NextRequest, NextResponse } from 'next/server'
import { supabaseAnon } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const eventId = String(url.searchParams.get('event') || '').trim()
    const galleryId = String(url.searchParams.get('gallery_id') || '').trim()
    if (!eventId || !galleryId) {
      return NextResponse.json(
        { ok: false, error: 'missing_event_or_gallery' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const sb = supabaseAnon()

    const { data } = await sb
      .from('media_items')
      .select('id,url,thumb_url,created_at,editable_until,is_approved,crop_position')
      .eq('event_id', eventId)
      .eq('kind', 'gallery')
      .eq('gallery_id', galleryId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })

    return NextResponse.json(
      { ok: true, items: data || [] },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
