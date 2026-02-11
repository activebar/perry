import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'
import { getEventId } from '@/lib/event-id'

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

async function fetchSettingsAndBlocks() {
  const sb = supabaseAnon()
  const eventId = getEventId()
  const [{ data: settings, error: sErr }, { data: blocks, error: bErr }] = await Promise.all([
    sb
      .from('event_settings')
      .select('*')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    sb.from('blocks').select('*').eq('event_id', eventId).order('order_index', { ascending: true })
  ])
  if (sErr) throw sErr
  if (bErr) throw bErr
  return { settings, blocks: blocks || [] }
}

// Gallery previews are now driven by *gallery blocks* (one block per gallery).
// We keep /api/public/home focused on settings + blocks + blessings.

async function fetchBlessingsPreview(limit: number, device_id?: string | null) {
  const sb = supabaseAnon()
  const eventId = getEventId()
  const safeLimit = Math.max(0, Math.min(20, Number(limit || 0)))
  if (!safeLimit) return []

  // Simple + reliable: latest approved blessings for THIS event.
  const { data: postsFinal, error: errFinal } = await sb
    .from('posts')
    .select('id, author_name, text, media_url, link_url, created_at')
    .eq('event_id', eventId)
    .eq('kind', 'blessing')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (errFinal || !postsFinal || postsFinal.length === 0) return []

  // counts + my reaction (service role)
  const ids = postsFinal.map(p => p.id)
  const srv = supabaseServiceRole()
  const { data: reactions } = await srv
    .from('reactions')
    .select('post_id, emoji, device_id')
    .in('post_id', ids)

  const countsById: Record<string, Record<string, number>> = {}
  const myById: Record<string, string | null> = {}

  for (const id of ids) {
    countsById[id] = { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
    myById[id] = null
  }

  for (const r of reactions || []) {
    const pid = (r as any).post_id
    const emo = (r as any).emoji
    if (!countsById[pid]) continue
    if (countsById[pid][emo] == null) continue
    countsById[pid][emo] += 1

    if (device_id && (r as any).device_id === device_id) {
      myById[pid] = emo
    }
  }

  return (postsFinal as any[]).map(p => ({
    ...p,
    reaction_counts: countsById[p.id] || { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
    my_reactions: myById[p.id] ? [myById[p.id]] : []
  }))
}

async function fetchGalleryPreviews(blocks: any[]) {
  const sb = supabaseAnon()
  const eventId = getEventId()

  const galleryBlocks = (blocks || []).filter((b: any) => String(b?.type || '').startsWith('gallery_'))
  if (galleryBlocks.length === 0) return {}

  // Fetch a small pool per gallery, then sample client-side.
  // NOTE: Requires media_items columns: url, thumb_url, is_approved, kind.
  const out: Record<string, any[]> = {}
  await Promise.all(
    galleryBlocks.map(async (b: any) => {
      const cfg = b?.config || {}
      const galleryId = String(cfg.gallery_id || cfg.galleryId || '')
      if (!galleryId) return
      const limit = Math.max(0, Math.min(24, Number(cfg.limit || 12)))
      const { data } = await sb
        .from('media_items')
        .select('id, url, thumb_url, created_at')
        .eq('event_id', eventId)
        .eq('kind', 'gallery')
        .eq('gallery_id', galleryId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(Math.max(limit, 12))
      out[galleryId] = (data || []).slice(0, limit)
    })
  )
  return out
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const { settings, blocks } = await fetchSettingsAndBlocks()
    const device_id = cookies().get('device_id')?.value || null

    // visible types
    const now = new Date()
    const visibleTypes = new Set(
      (blocks || [])
        .filter((b: any) => {
          if (!b?.is_visible) return false
          if (b.type === 'gift' && b.config?.auto_hide_after_hours) {
            const hours = Number(b.config.auto_hide_after_hours)
            if (Number.isFinite(hours) && hours > 0) {
              const start = new Date(settings.start_at)
              const hideAt = new Date(start.getTime() + hours * 60 * 60 * 1000)
              if (now > hideAt) return false
            }
          }
          return true
        })
        .map((b: any) => b.type)
    )

    const blessingsPreviewLimit = Number(settings.blessings_preview_limit ?? 3)

    const blessingsPreview = await fetchBlessingsPreview(blessingsPreviewLimit, device_id)
    const galleryPreviews = await fetchGalleryPreviews(blocks)

    return NextResponse.json({
      ok: true,
      settings,
      blocks,
      blessingsPreview,
      galleryPreviews
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
