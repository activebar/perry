import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const galleryId = String(url.searchParams.get('gallery_id') || '').trim()
    const event = String(url.searchParams.get('event') || '').trim()

    const env = getServerEnv()
    const eventId = event || env.EVENT_SLUG

    if (!galleryId) return NextResponse.json({ error: 'missing gallery_id' }, { status: 400 })

    const sb = supabaseServiceRole()
    const { data, error } = await sb
      .from('media_items')
      .select('id,url,thumb_url,public_url,storage_path,gallery_id,kind,created_at,editable_until,is_approved,crop_position')
      .eq('event_id', eventId)
      .eq('gallery_id', galleryId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(400)

    if (error) throw error
    return NextResponse.json({ items: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
