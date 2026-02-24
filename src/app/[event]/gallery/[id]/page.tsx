import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'

import GalleryClient from '@/app/gallery/ui'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: { event: string; id: string }
}

type NavItem = { id: string; title: string }

type BlockGalleryCfg = {
  gallery_id?: string
  title?: string
}

export default async function GalleryByIdForEvent({ params }: PageProps) {
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
      .filter((r: any) => r && (r as any).is_active === true)
      .map((r: any) => String((r as any).id))
  )

  const nav: NavItem[] = blockItems
    .filter((x) => activeSet.has(x.galleryId))
    .map((x) => ({ id: x.galleryId, title: x.title }))

  const uploadEnabled = !!(gRows || []).find((r: any) => String(r.id) === galleryId)?.upload_enabled

  const { data: items } = await sb
    .from('media_items')
    .select('id, url, thumb_url, created_at, editable_until, is_approved, kind, crop_position')
    .eq('event_id', eventId)
    .in('kind', ['gallery', 'galleries'])
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(500)

  const title = nav.find((x) => x.id === galleryId)?.title || 'גלריה'
  const base = `/${encodeURIComponent(eventId)}`

  return (
    <main className="py-10">
      <Container>
        <div dir="rtl" className="mb-4 text-right">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-zinc-600">כל התמונות המאושרות בגלריה זו.</p>
        </div>

        {nav.length > 1 ? (
          <div dir="rtl" className="mb-5 flex justify-end">
            <div className="flex max-w-full gap-2 overflow-x-auto pb-2">
              {nav.map((gx) => (
                <Link
                  key={gx.id}
                  href={`${base}/gallery/${encodeURIComponent(gx.id)}`}
                  className={`shrink-0 rounded-full border px-3 py-1 text-sm ${gx.id === galleryId ? 'bg-black text-white' : 'bg-white'}`}
                >
                  {gx.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {(items || []).length === 0 ? (
          <Card dir="rtl">
            <div className="text-right text-sm text-zinc-600">אין תמונות עדיין.</div>
          </Card>
        ) : null}

        <GalleryClient initialItems={items || []} galleryId={galleryId} uploadEnabled={uploadEnabled} />
      </Container>
    </main>
  )
}
