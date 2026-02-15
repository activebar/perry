import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'


async function getLatestSettingsRow() {
  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('event_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) throw error
  return data as any
}

function isGalleryBlockType(t: string) {
  // Blocks use: gallery, gallery_1, gallery_2, ...
  return t === 'gallery' || t.startsWith('gallery_')
}

export default async function GalleryIndexPage() {
  const env = getServerEnv()
  const srv = supabaseServiceRole()

  const { data: blocks } = await srv
    .from('blocks')
    .select('*')
    .eq('event_id', env.EVENT_SLUG)
    .eq('is_visible', true)
    .order('order_index', { ascending: true })

  const galleryBlocksRaw = (blocks || []).filter((b: any) => isGalleryBlockType(String((b as any)?.type || '')))
  // Only blocks that point to a real gallery (config.gallery_id). Keep order_index order and de-dupe.
  const seen = new Set<string>()
  const galleryBlocks: any[] = []
  const galleryIds: string[] = []

  for (const blk of galleryBlocksRaw as any[]) {
    const gid = String((blk?.config as any)?.gallery_id || (blk?.config as any)?.galleryId || '')
    if (!gid) continue
    if (seen.has(gid)) continue
    seen.add(gid)
    galleryBlocks.push(blk)
    galleryIds.push(gid)
  }

  const titlesById = new Map<string, string>()
  const previewByGalleryId = new Map<string, string[]>()
if (galleryIds.length) {
  const { data: gs } = await srv.from('galleries').select('id,title').eq('event_id', env.EVENT_SLUG).in('id', galleryIds as any)
  for (const g of gs || []) {
    titlesById.set(String((g as any).id), String((g as any).title || '').trim())
  }
}


// Settings-driven preview for gallery cards (same controls as Home)
let settings: any = null
try {
  settings = await getLatestSettingsRow()
} catch {
  settings = null
}

const previewLimitRaw = Number(settings?.home_gallery_preview_limit ?? 6)
const previewColsRaw = Number(settings?.home_gallery_preview_cols ?? 3)

const previewLimit = Math.max(1, Math.min(30, Number.isFinite(previewLimitRaw) && previewLimitRaw > 0 ? previewLimitRaw : 6))
const previewCols = Math.max(1, Math.min(6, Number.isFinite(previewColsRaw) && previewColsRaw > 0 ? previewColsRaw : 3))

// Per-gallery limit for the preview grid inside each card
const perGalleryLimit = previewLimit

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
      .limit(Math.min(400, galleryIds.length * Math.max(20, perGalleryLimit * 3)))

    for (const it of recent || []) {
      const gid = String((it as any).gallery_id || '')
      if (!gid) continue
      const u = (it as any).thumb_url || (it as any).url
      if (!u) continue
      const arr = previewByGalleryId.get(gid) || []
      if (arr.length < perGalleryLimit) {
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
              const galleryId = String((b?.config as any)?.gallery_id || (b?.config as any)?.galleryId || '')
              const title = titlesById.get(galleryId) || b?.title || 'גלריה'
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
                          <div className="mt-3 grid gap-2"
                            style={{ gridTemplateColumns: `repeat(${previewCols}, minmax(0, 1fr))` }}>
                            {previews.slice(0, perGalleryLimit).map((u, idx) => (
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
