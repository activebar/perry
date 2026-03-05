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

export default async function GalleryIndexPageForEvent({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  const srv = supabaseServiceRole()

  // Source of truth for sub-galleries list:
  // show active galleries even if blocks table is missing / misconfigured.
  const { data: galleries, error: gErr } = await srv
    .from('galleries')
    .select('id,title,order_index,is_active')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('order_index', { ascending: true })

  if (gErr) throw gErr

  const galleryIds = (galleries || []).map((g: any) => String(g.id)).filter(Boolean)

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
            {(galleries || []).length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(galleries || []).map((g: any) => (
                  <Link
                    key={g.id}
                    href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(String(g.id))}`}
                    prefetch={false}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm hover:bg-zinc-50"
                  >
                    {String(g.title || 'גלריה')}
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
          {(galleries || []).map((g: any) => {
            const gid = String(g.id)
            const list = (mediaByGallery.get(gid) || []).slice(0, 60)
            const shuffled = shuffleInPlace([...list]).slice(0, 12)

            return (
              <Card key={gid}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-right">
                    <div className="font-semibold">{String(g.title || 'גלריה')}</div>
                  </div>

                  <Link
                    href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(gid)}`}
                    prefetch={false}
                    className="text-sm underline"
                  >
                    לכל התמונות
                  </Link>
                </div>

                {shuffled.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {shuffled.map((m: any) => {
                      const url = m.thumb_url || m.url || m.public_url
                      return (
                        <Link
                          key={m.id}
                          href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(gid)}`}
                          prefetch={false}
                          className="relative w-full overflow-hidden rounded-xl bg-zinc-100"
                          style={{ aspectRatio: '1 / 1' }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            style={{ objectPosition: m.crop_position === 'top' ? 'center top' : 'center' }}
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
