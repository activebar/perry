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
  // only blocks that point to a real gallery
  const galleryBlocks = galleryBlocksRaw.filter((b: any) => Boolean((b?.config as any)?.gallery_id || (b?.config as any)?.galleryId))
      const galleryIds = Array.from(
    new Set(
      (galleryBlocks || [])
        .map((b: any) => (b?.config as any)?.gallery_id || (b?.config as any)?.galleryId)
        .filter(Boolean)
        .map((x: any) => String(x))
    )
  )

  const previewByGalleryId = new Map<string, string[]>()

const titlesById = new Map<string, string>()
if (galleryIds.length) {
  const { data: gs } = await srv.from('galleries').select('id,title,is_active,upload_enabled').eq('event_id', env.EVENT_SLUG).eq('is_active', true).in('id', galleryIds as any)
  let galleriesNav: any[] = []
  for (const g of gs || []) {
    const id = String((g as any).id)
    titlesById.set(id, String((g as any).title || '').trim())
    galleriesNav.push({ id, title: String((g as any).title || '').trim(), upload_enabled: !!(g as any).upload_enabled })
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

        {galleriesNav.length === 0 ? (
          <Card dir="rtl">
            <div className="text-right text-sm text-zinc-600">אין גלריות מוגדרות בדף הבית.</div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {galleriesNav.map((g: any) => {
              const galleryId = String(g.id)
              const title = String(g.title || titlesById.get(galleryId) || 'גלריה')
              const uploadsOpen = Boolean(g.upload_enabled)
              return (
                <Link key={galleryId} href={`/gallery/${encodeURIComponent(galleryId)}`} className="block">
                  <Card dir="rtl" className="hover:shadow-sm transition-shadow">
                    <div className="text-center">
                      <p className="text-lg font-semibold">{title}</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        {uploadsOpen ? 'העלו תמונות כדי לשתף את כולם 🥳' : 'צפייה בתמונות המאושרות'}
                      </p>
                    </div>

                    {(() => {
                      const previews = previewByGalleryId.get(String(galleryId)) || []
                      if (!previews.length) return null
                      return (
                        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${previewCols}, minmax(0, 1fr))` }}>
                          {previews.slice(0, perGalleryLimit).map((u, idx) => (
                            <div key={idx} className="aspect-square overflow-hidden rounded-lg bg-zinc-100">
                              <img src={u} alt="" className="h-full w-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )
                    })()}
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