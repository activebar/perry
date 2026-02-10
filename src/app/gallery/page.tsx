import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole, supabaseAnon } from '@/lib/supabase'
import { getEventId } from '@/lib/event-id'

export const dynamic = 'force-dynamic'

function isGalleryBlockType(t: string) {
  return t.startsWith('gallery_')
}

export default async function GalleryIndexPage() {
  const eventId = getEventId()
  const srv = supabaseServiceRole()
  const sb = supabaseAnon()

  const { data: blocks } = await srv
    .from('blocks')
    .select('*')
    .eq('event_id', eventId)
    .eq('is_visible', true)
    .order('order_index', { ascending: true })

  const galleryBlocks = (blocks || []).filter((b: any) => isGalleryBlockType(String(b.type || '')))

  // Fetch preview items for each gallery block (server-side)
  const previewsByGalleryId: Record<string, any[]> = {}
  await Promise.all(
    galleryBlocks.map(async (b: any) => {
      const galleryId = String(b?.config?.gallery_id || b?.config?.galleryId || '')
      if (!galleryId) return
      const limit = Math.max(0, Math.min(6, Number(b?.config?.limit || 6)))
      const { data: items } = await sb
        .from('media_items')
        .select('id, url, thumb_url, created_at')
        .eq('event_id', eventId)
        .eq('kind', 'gallery')
        .eq('gallery_id', galleryId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(Math.max(limit, 6))
      previewsByGalleryId[galleryId] = (items || []).slice(0, 6)
    })
  )

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
              const galleryId = String(b?.config?.gallery_id || b?.config?.galleryId || b.id)
              const title = String(b?.config?.title || b?.config?.label || b?.title || 'גלריה')
              const items = previewsByGalleryId[galleryId] || []
              return (
                <Link key={b.id} href={`/gallery/${encodeURIComponent(String(galleryId))}`} className="block">
                  <Card dir="rtl" className="hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-right">
                        <p className="font-semibold">{title}</p>
                        <p className="text-sm text-zinc-600">לצפייה בכל התמונות</p>
                      </div>
                      <span className="text-sm font-medium">פתיחה</span>
                    </div>

                    {Array.isArray(items) && items.length > 0 ? (
                      <div className="mt-3 grid grid-cols-6 gap-2">
                        {items.slice(0, 6).map((it: any) => {
                          const url = String(it.thumb_url || it.url || '')
                          return (
                            <div key={String(it.id)} className="relative aspect-square overflow-hidden rounded-xl bg-zinc-200">
                              {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
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
