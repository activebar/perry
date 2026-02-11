import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

function isGalleryBlockType(t: string) {
  return t === 'gallery' || t.startsWith('gallery')
}

export default async function GalleryIndexPage() {
  const env = getServerEnv()
  const srv = supabaseServiceRole()

  const { data: blocks } = await srv
    .from('blocks')
    .select('*')
    .eq('is_visible', true)
    .order('order_index', { ascending: true })

  const galleryBlocks = (blocks || []).filter((b: any) => isGalleryBlockType(String((b as any)?.type || '')))
  const galleryIds = galleryBlocks
    .map((b: any) => (b?.config as any)?.gallery_id)

  const previewByGalleryId = new Map<string, string[]>()

  if (galleryIds.length) {
    // Fetch a pool of recent approved items for these galleries and slice per gallery in JS
    const { data: recent } = await srv
      .from('media_items')
      .select('gallery_id, thumb_url, url, created_at, is_approved, kind, event_id')
      .eq('event_id', env.EVENT_SLUG)
      .eq('kind', 'gallery')
      .eq('is_approved', true)
      .in('gallery_id', galleryIds as any)
      .order('created_at', { ascending: false })
      .limit(Math.min(200, galleryIds.length * 40))

    for (const it of recent || []) {
      const gid = String((it as any).gallery_id || '')
      if (!gid) continue
      const u = (it as any).thumb_url || (it as any).url
      if (!u) continue
      const arr = previewByGalleryId.get(gid) || []
      if (arr.length < 4) {
        arr.push(u)
        previewByGalleryId.set(gid, arr)
      }
    }
  }

  return (
    <main className="py-10">
      <Container>
        <div dir="rtl" className="mb-6 text-right">
          <h1 className="text-2xl font-semibold">גלריות</h1>
          <p className="mt-1 text-sm text-zinc-600">בחרו גלריה כדי לצפות בכל התמונות.</p>
        </div>

        {galleryBlocks.length === 0 ? (
          <Card dir="rtl">
            <div className="text-right text-sm text-zinc-600">אין גלריות מוגדרות בדף הבית.</div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {galleryBlocks.map((b: any) => {
              const galleryId = b?.config?.gallery_id || b?.config?.galleryId || b.id
              const title = b?.config?.title || b?.config?.label || b?.title || 'גלריה'
              return (
                <Link key={b.id} href={`/gallery/${encodeURIComponent(String(galleryId))}`} className="block">
                  <Card dir="rtl" className="hover:shadow-sm transition-shadow">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-right">
                          <p className="font-semibold">{title}</p>
                          <p className="text-sm text-zinc-600">לצפייה בכל התמונות</p>
                        </div>
                        <span className="text-sm font-medium">פתיחה</span>
                      </div>

                      {(() => {
                        const previews = previewByGalleryId.get(String(galleryId)) || []
                        if (!previews.length) return null
                        return (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {previews.slice(0, 4).map((u, idx) => (
                              <div key={idx} className="aspect-square overflow-hidden rounded-lg bg-zinc-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt="" className="h-full w-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </Container>
    </main>
  )
}