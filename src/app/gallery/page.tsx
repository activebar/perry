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

export default async function GalleryIndexPage() {
  const env = getServerEnv()
  const srv = supabaseServiceRole()

  // Source of truth for gallery names/buttons/order: blocks (Admin -> "עיצוב ותוכן")
  const { data: blocks, error: bErr } = await srv
    .from('blocks')
    .select('id,type,order_index,is_visible,config,event_id')
    .eq('event_id', env.EVENT_SLUG)
    .eq('is_visible', true)
    .or('type.eq.gallery,type.like.gallery_%')
    .order('order_index', { ascending: true })

  if (bErr) throw bErr

  const galleryItems = (blocks || [])
    .map((b: any) => {
      const cfg = (b as any).config || {}
      const galleryId = String(cfg.gallery_id || '').trim()
      if (!galleryId) return null

      return {
        galleryId,
        title: String(cfg.title || 'גלריה'),
        buttonLabel: String(cfg.button_label || 'לכל התמונות'),
        limit: Number(cfg.limit || 12),
        orderIndex: Number((b as any).order_index || 0)
      }
    })
    .filter(Boolean) as Array<{
    galleryId: string
    title: string
    buttonLabel: string
    limit: number
    orderIndex: number
  }>

  const galleryIds = galleryItems.map((g) => g.galleryId)

  // Fetch active galleries only (still respect DB activation)
  const { data: galleriesRows } = await srv
    .from('galleries')
    .select('id,is_active,order_index,event_id')
    .eq('event_id', env.EVENT_SLUG)
    .in('id', galleryIds as any)

  const activeSet = new Set(
    (galleriesRows || [])
      .filter((r: any) => r && (r as any).is_active === true)
      .map((r: any) => String((r as any).id))
  )

  const visibleItems = galleryItems.filter((g) => activeSet.has(g.galleryId))

  const previewByGalleryId = new Map<string, string[]>()

  // Settings-driven preview for gallery cards
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

  const perGalleryLimit = previewLimit

  if (visibleItems.length) {
    const { data: recent } = await srv
      .from('media_items')
      .select('gallery_id, thumb_url, url, created_at, is_approved, kind, event_id')
      .eq('event_id', env.EVENT_SLUG)
      .eq('kind', 'gallery')
      .eq('is_approved', true)
      .in('gallery_id', visibleItems.map((x) => x.galleryId) as any)
      .order('created_at', { ascending: false })
      .limit(Math.min(400, visibleItems.length * Math.max(20, perGalleryLimit * 3)))

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

        {/* Navigation bar */}
        {visibleItems.length > 1 ? (
          <div dir="rtl" className="mb-5 flex justify-end">
            <div className="flex max-w-full gap-2 overflow-x-auto pb-2">
              {visibleItems.map((g) => (
                <Link
                  key={g.galleryId}
                  href={`/gallery/${encodeURIComponent(String(g.galleryId))}`}
                  className="shrink-0 rounded-full border bg-white px-3 py-1 text-sm"
                >
                  {g.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {visibleItems.length === 0 ? (
          <Card dir="rtl">
            <div className="text-right text-sm text-zinc-600">אין גלריות פעילות.</div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {visibleItems.map((g) => {
              const galleryId = String(g.galleryId)
              const title = String(g.title || 'גלריה')
              const buttonLabel = String(g.buttonLabel || 'לכל התמונות')

              return (
                <Link key={galleryId} href={`/gallery/${encodeURIComponent(galleryId)}`} className="block">
                  <Card dir="rtl" className="hover:shadow-sm transition-shadow">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-right">
                          <p className="font-semibold">{title}</p>
                          <p className="text-sm text-zinc-600">{buttonLabel}</p>
                        </div>
                        <span className="text-sm font-medium">פתיחה</span>
                      </div>

                      {(() => {
                        const previews = previewByGalleryId.get(galleryId) || []
                        if (!previews.length) return null
                        return (
                          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${previewCols}, minmax(0, 1fr))` }}>
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
