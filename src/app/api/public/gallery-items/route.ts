import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const event = searchParams.get('event') || ''
    const gallery_id = searchParams.get('gallery_id') || ''
    if (!event || !gallery_id) {
      return NextResponse.json({ error: 'Missing event or gallery_id' }, { status: 400 })
    }

    const sb = supabaseServiceRole()
    const { data, error } = await sb
      .from('media_items')
      .select('id,event_id,kind,gallery_id,storage_path,public_url,thumb_url,created_at,editable_until,is_approved,crop_position')
      .eq('event_id', event)
      .eq('kind', 'gallery')
      .eq('gallery_id', gallery_id)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const items = (data || []).map((x: any) => {
      const public_url = x.public_url || (x.storage_path ? getPublicUploadUrl(x.storage_path) : '')
      const thumb_url = x.thumb_url || (x.storage_path ? getPublicUploadUrl(`${x.storage_path}.thumb.webp`) : public_url)
      return {
        ...x,
        public_url,
        thumb_url,
        url: public_url
      }
    })

    return NextResponse.json(
      { items },
      {
        // Prevent any edge/proxy caching – this endpoint is used as a "self-heal" source of truth.
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
