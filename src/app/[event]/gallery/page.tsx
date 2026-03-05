import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

type BlockGalleryCfg = {
  gallery_id?: string
  title?: string
  button_label?: string
  limit?: number
}

export default async function GalleryIndexPageForEvent({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  const srv = supabaseServiceRole()

  const { data: blocks, error: bErr } = await srv
    .from('blocks')
    .select('id,type,order_index,is_visible,config,event_id')
    .eq('event_id', eventId)
    .eq('is_visible', true)
    .or('type.eq.gallery,type.like.gallery_%')
    .order('order_index', { ascending: true })

  if (bErr) throw bErr

  const blockItems = (blocks || [])
    .map((b: any) => {
      const cfg = (b as any).config as BlockGalleryCfg | null
      const gid = String(cfg?.gallery_id || '').trim()
      if (!gid) return null
      return {
        galleryId: gid,
        title: String(cfg?.title || 'גלריה'),
        buttonLabel: String(cfg?.button_label || 'לכל התמונות'),
        limit: Number(cfg?.limit || 12)
      }
    })
    .filter(Boolean) as Array<{ galleryId: string; title: string; buttonLabel: string; limit: number }>

  const galleryIds = blockItems.map((g) => g.galleryId)

  const { data: galleriesRows } = await srv
    .from('galleries')
    .select('id,is_active,event_id')
    .eq('event_id', eventId)
    .in('id', galleryIds as any)

  const activeSet = new Set(
    (galleriesRows || [])
      .filter((g: any) => g.is_active !== false)
      .map((g: any) => String(g.id))
  )

  const enabledBlocks = blockItems.filter((b) => activeSet.has(String(b.galleryId)))

  const { data: mediaRows } = await srv
    .from('media_items')
    .select('id,url,thumb_url,public_url,storage_path,gallery_id,kind,created_at,crop_position')
    .eq('event_id', eventId)
    .eq('is_approved', true)
    .in('gallery_id', galleryIds as any)
    .order('created_at', { ascending: false })
    .limit(1200)

  const mediaByGallery = new Map<string, any[]>()
  for (const m of mediaRows || []) {
    const gid = String((m as any).gallery_id || '')
    if (!gid) continue
    const arr = mediaByGallery.get(gid) || []
    arr.push(m)
    mediaByGallery.set(gid, arr)
  }

  return (
    <main dir="rtl" className="text-right">
      <Container>
        <Card>
          <div className="space-y-2 text-right">
            <div className="text-xl font-semibold">גלריות</div>
            <div className="text-sm opacity-80">בחרו גלריה לצפייה בתמונות</div>
          </div>
        </Card>

        <div className="mt-4 grid gap-3">
          {enabledBlocks.map((g) => {
            const list = (mediaByGallery.get(String(g.galleryId)) || []).slice(0, 60)
            const shuffled = shuffleInPlace([...list]).slice(0, Math.max(0, Math.min(12, g.limit || 12)))

            return (
              <Card key={g.galleryId}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-right">
                    <div className="font-semibold">{g.title}</div>
                  </div>
                  <Link
                    href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(String(g.galleryId))}`}
                    prefetch={false}
                    className="text-sm underline"
                  >
                    {g.buttonLabel}
                  </Link>
                </div>

                {shuffled.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {shuffled.map((m: any) => {
                      const url = m.thumb_url || m.url || m.public_url
                      return (
                        <div
                          key={m.id}
                          className="relative w-full overflow-hidden rounded-xl bg-zinc-100"
                          style={{ aspectRatio: '1 / 1' }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            style={{ objectPosition: m.crop_position === 'top' ? 'top' : 'center' }}
                            loading="lazy"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </Container>
    </main>
  )
}
