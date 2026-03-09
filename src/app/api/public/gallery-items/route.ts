import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const event = searchParams.get('event') || ''
    const gallery_id = searchParams.get('gallery_id') || ''
    if (!event || !gallery_id) {
      return NextResponse.json({ error: 'Missing event or gallery_id' }, { status: 400 })
    }

    const deviceId = cookies().get('device_id')?.value || null
    const sb = supabaseServiceRole()
    const { data, error } = await sb
      .from('media_items')
      .select('id,event_id,kind,gallery_id,storage_path,public_url,thumb_url,created_at,editable_until,is_approved,crop_position,uploader_device_id')
      .eq('event_id', event)
      .eq('kind', 'gallery')
      .eq('gallery_id', gallery_id)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ids = (data || []).map((x: any) => String(x.id)).filter(Boolean)
    const countsById: Record<string, Record<string, number>> = {}
    const myById: Record<string, Set<string>> = {}

    if (ids.length > 0) {
      const { data: reactions } = await sb.from('reactions').select('post_id,emoji,device_id').in('post_id', ids as any)
      for (const r of reactions || []) {
        const pid = String((r as any).post_id || '')
        const emoji = String((r as any).emoji || '')
        if (!pid || !(EMOJIS as readonly string[]).includes(emoji)) continue
        countsById[pid] ||= { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
        countsById[pid][emoji] = (countsById[pid][emoji] || 0) + 1
        if (deviceId && String((r as any).device_id || '') === deviceId) {
          myById[pid] ||= new Set<string>()
          myById[pid].add(emoji)
        }
      }
    }

    const items = (data || []).map((x: any) => {
      const public_url = x.public_url || (x.storage_path ? getPublicUploadUrl(x.storage_path) : '')
      const thumb_url = x.thumb_url || (x.storage_path ? getPublicUploadUrl(`${x.storage_path}.thumb.webp`) : public_url)
      return {
        ...x,
        public_url,
        thumb_url,
        url: public_url,
        reaction_counts: countsById[String(x.id)] || { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
        my_reactions: Array.from(myById[String(x.id)] || [])
      }
    })

    return NextResponse.json(
      { items },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
