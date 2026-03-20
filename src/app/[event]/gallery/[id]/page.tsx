// Path: src/app/[event]/gallery/[id]/page.tsx
// Version: V25.3
// Updated: 2026-03-20 13:20
// Note: pass sub-gallery pending approval count into GalleryClient so the notice appears immediately for the current gallery

import Link from 'next/link'
import { cookies } from 'next/headers'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'

import GalleryClient from '../ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type PageProps = {
  params: { event: string; id: string }
}

type BlockGalleryCfg = {
  gallery_id?: string
  title?: string
}

function buildReactionMaps(rows: any[], deviceId: string) {
  const reactionsByItem: Record<string, Record<string, number>> = {}
  const myReactionsByItem: Record<string, string[]> = {}
  const topReactionByItem: Record<string, { emoji: string; count: number } | null> = {}

  for (const row of rows || []) {
    const itemId = String((row as any).media_item_id || '').trim()
    const emoji = String((row as any).emoji || '').trim()
    const rowDevice = String((row as any).device_id || '').trim()

    if (!itemId || !emoji) continue

    reactionsByItem[itemId] ||= {}
    reactionsByItem[itemId][emoji] = Number(reactionsByItem[itemId][emoji] || 0) + 1

    if (deviceId && rowDevice === deviceId) {
      myReactionsByItem[itemId] ||= []
      if (!myReactionsByItem[itemId].includes(emoji)) {
        myReactionsByItem[itemId].push(emoji)
      }
    }
  }

  for (const [itemId, counts] of Object.entries(reactionsByItem)) {
    let bestEmoji = ''
    let bestCount = 0

    for (const [emoji, rawCount] of Object.entries(counts || {})) {
      const count = Number(rawCount || 0)
      if (count > bestCount) {
        bestEmoji = emoji
        bestCount = count
      }
    }

    topReactionByItem[itemId] =
      bestEmoji && bestCount > 0 ? { emoji: bestEmoji, count: bestCount } : null
  }

  return { reactionsByItem, myReactionsByItem, topReactionByItem }
}

export default async function GalleryByIdForEventPage({ params }: PageProps) {
  const eventId = String(params?.event || '').trim()
  const galleryId = decodeURIComponent(params.id)
  const sb = supabaseServiceRole()
  const deviceId = String(cookies().get('device_id')?.value || '').trim()

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
        title: String(cfg?.title || 'גלריה'),
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
      .filter((g: any) => g.is_active !== false)
      .map((g: any) => String(g.id))
  )

  const uploadEnabled = Boolean(
    (gRows || []).find((g: any) => String(g.id) === String(galleryId))?.upload_enabled
  )

  const { count: pendingCount } = await sb
    .from('media_items')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('gallery_id', galleryId)
    .eq('is_approved', false)
    .in('kind', ['gallery', 'video', 'galleries', 'gallery_video'])

  if (!activeSet.has(String(galleryId))) {
    return (
      <main dir="rtl" className="text-right">
        <Container>
          <Card>
            <div className="space-y-2 text-right">
              <div className="text-xl font-semibold">גלריה לא זמינה</div>
              <Link
                prefetch={false}
                className="underline"
                href={`/${encodeURIComponent(eventId)}/gallery`}
              >
                חזרה לגלריות
              </Link>
            </div>
          </Card>
        </Container>
      </main>
    )
  }

  const { data: items } = await sb
    .from('media_items')
    .select(
      'id,url,thumb_url,public_url,storage_path,gallery_id,kind,created_at,editable_until,is_approved,crop_position,crop_focus_x,crop_focus_y,uploader_device_id'
    )
    .eq('event_id', eventId)
    .in('kind', ['gallery', 'video', 'galleries', 'gallery_video'])
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(400)

  const itemIds = (items || []).map((x: any) => String(x?.id || '').trim()).filter(Boolean)

  let reactionsByItem: Record<string, Record<string, number>> = {}
  let myReactionsByItem: Record<string, string[]> = {}
  let topReactionByItem: Record<string, { emoji: string; count: number } | null> = {}

  if (itemIds.length > 0) {
    const { data: reactionRows } = await sb
      .from('reactions')
      .select('media_item_id, emoji, device_id')
      .in('media_item_id', itemIds as any)

    const built = buildReactionMaps(reactionRows || [], deviceId)
    reactionsByItem = built.reactionsByItem
    myReactionsByItem = built.myReactionsByItem
    topReactionByItem = built.topReactionByItem
  }

  const enrichedItems = (items || []).map((item: any) => {
    const id = String(item?.id || '').trim()
    return {
      ...item,
      reaction_counts: reactionsByItem[id] || {},
      my_reactions: myReactionsByItem[id] || [],
      top_reaction: topReactionByItem[id] || null,
    }
  })

  const nav = blockItems.filter((x) => activeSet.has(String(x.galleryId)))

  const { data: eventSettings } = await sb
    .from('event_settings')
    .select('gallery_video_max_mb,gallery_video_max_seconds')
    .eq('event_id', eventId)
    .maybeSingle()

  const galleryVideoMaxMb = Number((eventSettings as any)?.gallery_video_max_mb ?? 200)
  const galleryVideoMaxSeconds = Number((eventSettings as any)?.gallery_video_max_seconds ?? 60)

  return (
    <main dir="rtl" className="text-right">
      <Container>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-right">
              <div className="text-xl font-semibold">תמונות</div>
              <div className="text-sm opacity-80">בחרו גלריה</div>
            </div>
            <Link
              prefetch={false}
              className="underline"
              href={`/${encodeURIComponent(eventId)}/gallery`}
            >
              חזרה
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {nav.map((n) => (
              <Link
                key={n.galleryId}
                href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(
                  String(n.galleryId)
                )}`}
                prefetch={false}
                className={`rounded-full border px-3 py-1 text-sm ${
                  String(n.galleryId) === String(galleryId) ? 'bg-zinc-900 text-white' : 'bg-white'
                }`}
              >
                {n.title}
              </Link>
            ))}
          </div>
        </Card>

        <div className="mt-4">
          <GalleryClient
            initialItems={enrichedItems}
            galleryId={galleryId}
            uploadEnabled={uploadEnabled}
            pendingCount={pendingCount || 0}
            galleryVideoMaxMb={galleryVideoMaxMb}
            galleryVideoMaxSeconds={galleryVideoMaxSeconds}
          />
        </div>
      </Container>
    </main>
  )
}
