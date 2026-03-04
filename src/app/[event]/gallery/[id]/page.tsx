import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'

import GalleryClient from '../ui'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: { event: string; id: string }
}

type BlockGalleryCfg = {
  gallery_id?: string
  title?: string
}

export default async function GalleryByIdForEventPage({ params }: PageProps) {
  const eventId = String(params?.event || '').trim()
  const galleryId = decodeURIComponent(params.id)
  const sb = supabaseServiceRole()

  const { data: blocks } = await sb
    .from('blocks')
    .select('id,type,order_index,is_visible,config,event_id')
    .eq('event_id', eventId)
    .eq('is_visible', true)
    .or('type.eq.gallery,type.like.gallery_%')
    .order('order_index', { ascending: true })

  const blockItems = (blocks || [])
    .map((b: any) => {
      const cfg = (b as any).config as BlockGalleryCfg | null
      const gid = String(cfg?.gallery_id || '').trim()
      if (!gid) return null
      return {
        galleryId: gid,
        title: String(cfg?.title || 'גלריה')
      }
    })
    .filter(Boolean) as Array<{ galleryId: string; title: string }>

  const galleryIds = blockItems.map((x) => x.galleryId)

  const { data: gRows } = await sb
    .from('galleries')
    .select('id,is_active,upload_enabled')
    .eq('event_id', eventId)
    .in('id', galleryIds as any)

  const activeSet = new Set(
    (gRows || [])
      .filter((g: any) => g.is_active !== false)
      .map((g: any) => String(g.id))
  )

  const uploadEnabled = Boolean((gRows || []).find((g: any) => String(g.id) === String(galleryId))?.upload_enabled)

  if (!activeSet.has(String(galleryId))) {
    return (
      <main dir="rtl" className="text-right">
        <Container>
          <Card>
            <div className="space-y-2 text-right">
              <div className="text-xl font-semibold">גלריה לא זמינה</div>
              <Link className="underline" href={`/${encodeURIComponent(eventId)}/gallery`}>
                חזרה לגלריות
              </Link>
            </div>
          </Card>
        </Container>
      </main>
    )
  }

  const { data: items } = await sb
    .from('media_items')
    .select('id,url,thumb_url,public_url,storage_path,gallery_id,kind,created_at,editable_until,is_approved,crop_position')
    .eq('event_id', eventId)
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(400)

  // navigation pills
  const nav = blockItems.filter((x) => activeSet.has(String(x.galleryId)))

  return (
    <main dir="rtl" className="text-right">
      <Container>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-right">
              <div className="text-xl font-semibold">תמונות</div>
              <div className="text-sm opacity-80">בחרו גלריה</div>
            </div>
            <Link className="underline" href={`/${encodeURIComponent(eventId)}/gallery`}>
              חזרה
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 justify-end">
            {nav.map((n) => (
              <Link
                key={n.galleryId}
                href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(String(n.galleryId))}`}
                className={`px-3 py-1 rounded-full border text-sm ${
                  String(n.galleryId) === String(galleryId) ? 'bg-zinc-900 text-white' : 'bg-white'
                }`}
              >
                {n.title}
              </Link>
            ))}
          </div>
        </Card>

        <div className="mt-4">
          <GalleryClient initialItems={items || []} galleryId={galleryId} uploadEnabled={uploadEnabled} />
        </div>
      </Container>
    </main>
  )
}
