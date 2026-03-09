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

export default async function GalleryIndexPageForEvent({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  const srv = supabaseServiceRole()

  // Source of truth for sub-galleries buttons is the blocks config (as used across the site).
  // We still validate against galleries table to avoid showing inactive/missing galleries.
  const { data: blocks, error: bErr } = await srv
    .from('blocks')
    .select('id,type,order_index,is_visible,config,event_id')
    .eq('event_id', eventId)
    .eq('is_visible', true)
    .or('type.eq.gallery,type.like.gallery_%')
    .order('order_index', { ascending: true })

  if (bErr) throw bErr

  const blockItems = (blocks || [])
    .map((b: any): BlockGalleryItem | null => {
      const cfg = (b as any).config as BlockGalleryCfg | null
      const gid = String(cfg?.gallery_id || '').trim()
      if (!gid) return null

      const title = String(cfg?.title || '').trim() || 'גלריה'
      // IMPORTANT: button label should follow the gallery name if not explicitly set.
      const buttonLabel = String(cfg?.button_label || '').trim() || title
      const limit = Number(cfg?.limit || 12)

      return { galleryId: gid, title, buttonLabel, limit }
    })
    .filter(Boolean) as BlockGalleryItem[]

  const galleryIds = blockItems.map((g) => g.galleryId)

  // Keep only active galleries (or those without explicit is_active=false)
  const { data: galleriesRows, error: gErr } = await srv
    .from('galleries')
    .select('id,is_active,title')
    .eq('event_id', eventId)
    .in('id', galleryIds as any)

  if (gErr) throw gErr

  const byId = new Map<string, any>()
  for (const g of galleriesRows || []) byId.set(String((g as any).id), g)

  const enabledBlocks = blockItems
    .filter((b) => {
      const row = byId.get(String(b.galleryId))
      if (!row) return false
      return (row as any).is_active !== false
    })
    .map((b) => {
      // If gallery table has a better title and blocks title is generic, keep blocks title as truth.
      // But if blocks title is missing (shouldn't), fallback to gallery title.
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
    .eq('kind', 'gallery')
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

            {/* Sub galleries buttons */}
            {enabledBlocks.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 justify-end">
                {enabledBlocks.map((g) => (
                  <Link
                    key={g.galleryId}
                    href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(String(g.galleryId))}`}
                    prefetch={false}
                    className="px-3 py-1 rounded-full border border-zinc-200 text-sm bg-white hover:bg-zinc-50"
                  >
                    {g.title}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm opacity-70">אין גלריות פעילות כרגע.</div>
            )}
          </div>
        </Card>

        {/* Preview cards (optional) */}
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
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {shuffled.map((m: any) => {
                      const url = m.thumb_url || m.url || m.public_url
                      return (
                        <Link
                          key={m.id}
                          href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(String(g.galleryId))}`}
                          prefetch={false}
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
