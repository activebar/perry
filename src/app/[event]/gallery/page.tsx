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

type BlockGalleryItem = {
  galleryId: string
  title: string
  buttonLabel: string
  limit: number
}

function isVideoItem(item: any) {
  const kind = String(item?.kind || '').toLowerCase()
  const url = String(item?.url || item?.public_url || item?.storage_path || '').toLowerCase()

  if (kind.includes('video')) return true
  return /\.(mp4|mov|webm|m4v|avi|mpeg|mpg|3gp)(\?|$)/i.test(url)
}

export default async function GalleryIndexPageForEvent({
  params,
}: {
  params: { event: string }
}) {
  const eventId = String(params?.event || '').trim()
  const srv = supabaseServiceRole()

  const { data: blocks, error: bErr } = await srv
    .from('blocks')
    .select('id,type,order_index,is_visible,config,event_id')
    .eq('event_id', eventId)
    .eq('is_visible', true)
    .like('type', 'gallery_%')
    .order('order_index', { ascending: true })

  if (bErr) throw bErr

  const blockItems = (blocks || [])
    .map((b: any): BlockGalleryItem | null => {
      const cfg = (b as any).config as BlockGalleryCfg | null
      const gid = String(cfg?.gallery_id || '').trim()
      if (!gid) return null

      const title = String(cfg?.title || '').trim() || 'גלריה'
      const buttonLabel = String(cfg?.button_label || '').trim() || title
      const limit = Number(cfg?.limit || 12)

      return { galleryId: gid, title, buttonLabel, limit }
    })
    .filter(Boolean) as BlockGalleryItem[]

  const galleryIds = blockItems.map((g) => g.galleryId)

  const { data: galleriesRows, error: gErr } = await srv
    .from('galleries')
    .select('id,is_active,title')
    .eq('event_id', eventId)
    .in('id', galleryIds as any)

  if (gErr) throw gErr

  const byId = new Map<string, any>()
  for (const g of galleriesRows || []) {
    byId.set(String((g as any).id), g)
  }

  const enabledBlocks = blockItems
    .filter((b) => {
      const row = byId.get(String(b.galleryId))
      if (!row) return false
      return (row as any).is_active !== false
    })
    .map((b) => {
      const row = byId.get(String(b.galleryId))
      const fallbackTitle = String((row as any)?.title || '').trim()
      const title = String(b.title || '').trim() || fallbackTitle || 'גלריה'
      const buttonLabel = String(b.buttonLabel || '').trim() || title
      return { ...b, title, buttonLabel }
    })

  const { data: mediaRows } = await srv
    .from('media_items')
    .select('id,url,thumb_url,public_url,storage_path,gallery_id,kind,created_at,crop_position')
    .eq('event_id', eventId)
    .eq('is_approved', true)
    .in('kind', ['gallery', 'video'])
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
            const shuffled = shuffleInPlace([...list]).slice(
              0,
              Math.max(0, Math.min(12, g.limit || 12))
            )

            return (
              <Card key={g.galleryId}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-right">
                    <div className="font-semibold">{g.title}</div>
                  </div>

                  <Link
                    href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(
                      String(g.galleryId)
                    )}`}
                    prefetch={false}
                    className="text-sm underline"
                  >
                    {g.buttonLabel}
                  </Link>
                </div>

                {shuffled.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {shuffled.map((m: any) => {
                      const url = m.thumb_url || m.url || m.public_url
                      const isVideo = isVideoKind(m.kind)

                      return (
                        <Link
                          key={m.id}
                          href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(
                            String(g.galleryId)
                          )}`}
                          prefetch={false}
                          className="relative w-full overflow-hidden rounded-xl bg-zinc-100"
                          style={{ aspectRatio: '1 / 1' }}
                        >
                          {isVideo ? (
                            <>
                              <video
                                src={url}
                                className="absolute inset-0 h-full w-full object-cover"
                                style={{
                                  objectPosition: m.crop_position === 'top' ? 'top' : 'center',
                                }}
                                muted
                                playsInline
                                preload="metadata"
                              />
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-xl text-white shadow">
                                  ▶
                                </div>
                              </div>
                              <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white shadow">
                                וידאו
                              </div>
                            </>
                          ) : (
                            <img
                              src={url}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                              style={{
                                objectPosition: m.crop_position === 'top' ? 'top' : 'center',
                              }}
                              loading="lazy"
                            />
                          )}
                        </Link>
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
