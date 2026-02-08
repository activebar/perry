import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'
import { getEventId } from '@/lib/event-id'

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

async function fetchSettingsAndBlocks() {
  const sb = supabaseAnon()
  const event_id = getEventId()
  const [{ data: settings, error: sErr }, { data: blocks, error: bErr }] = await Promise.all([
    sb.from('event_settings').select('*').eq('event_id', event_id).order('updated_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).single(),
    sb.from('blocks').select('*').order('order_index', { ascending: true })
  ])
  if (sErr) throw sErr
  if (bErr) throw bErr
  return { settings, blocks: blocks || [] }
}

type GalleryPreviewItem = { id: string; public_url: string | null; mime_type: string | null; created_at: string | null }

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededSample<T>(arr: T[], limit: number, seed: string) {
  const safe = Math.max(0, Math.min(50, Number(limit || 0)))
  if (!safe) return []
  const s = Array.from(String(seed || '1')).reduce((a, c) => a + c.charCodeAt(0), 0) || 1
  const rnd = mulberry32(s)
  const copy = arr.slice()
  // Fisher–Yates
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy.slice(0, safe)
}

async function fetchGalleryPreviewByGalleryId(gallery_id: string, limit: number, seed: string) {
  const sb = supabaseAnon()
  const event_id = getEventId()
  const safeLimit = Math.max(0, Math.min(50, Number(limit || 0)))
  if (!safeLimit) return []

  // Fetch a window (latest 200 approved) then sample deterministically server-side.
  const { data, error } = await sb
    .from('posts')
    .select('id, media_url, video_url, created_at')
    .eq('event_id', event_id)
    .eq('kind', 'gallery')
    .eq('status', 'approved')
    .eq('gallery_id', gallery_id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return []
  const rows = (data || []).map((p: any) => ({
    id: p.id,
    created_at: p.created_at,
    media_url: p.media_url,
    video_url: p.video_url
  }))

  // Deterministic sampling based on seed
  const s = String(seed || '')
  const hash = (str: string) => {
    let h = 0
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
    return h
  }
  const base = hash(s)

  const scored = rows.map((r: any) => ({ r, score: hash(String(r.id)) ^ base }))
  scored.sort((a: any, b: any) => a.score - b.score)
  return scored.slice(0, safeLimit).map((x: any) => x.r)
}


async function fetchBlessingsPreview(limit: number, device_id?: string | null) {
  const sb = supabaseAnon()
  const event_id = getEventId()
  const safeLimit = Math.max(0, Math.min(20, Number(limit || 0)))
  if (!safeLimit) return []

  // Prefer server-side random order via RPC (if exists)
const { data: rpcPosts, error: rpcErr } = await sb.rpc('get_home_posts_random', { p_limit: safeLimit, p_event_id: event_id })
const posts = (rpcErr ? null : (rpcPosts as any[] | null)) || null
const error = rpcErr || null

// Fallback: latest first if RPC not installed yet
const fallback = async () => {
  const { data, error } = await sb
    .from('posts')
    .select('id, author_name, text, media_url, link_url, created_at')
    .eq('event_id', event_id)
    .eq('kind', 'blessing')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(safeLimit)
  return { data, error }
}

const final = !posts ? await fallback() : { data: posts, error: null }
const postsFinal = final.data as any[] | null
const errFinal = final.error

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

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const event_id = getEventId()
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

    const showGalleryBlocks = visibleTypes.has('gallery')

    // Collect visible gallery blocks (supports multiple blocks of the same type)
    const galleryBlocks = (blocks || []).filter((b: any) => b?.is_visible && String(b?.type) === 'gallery')

    const blessingsPreviewLimit = Number(settings.blessings_preview_limit ?? 3)

    // Use service role to avoid any RLS / anon policy surprises.
    const galleries = showGalleryBlocks
      ? (await supabaseServiceRole()
          .from('galleries')
          .select('id, title, order_index, is_active')
          .eq('event_id', event_id)
          .eq('is_active', true)
          .order('order_index', { ascending: true }))
      : ({ data: [] } as any)

    const galleriesList = (galleries.data || []) as any[]
    const titleById = new Map<string, string>(galleriesList.map(g => [String(g.id), String(g.title || '')]))

    const galleryBlocksPreview = await Promise.all(
      (showGalleryBlocks ? galleryBlocks : []).map(async (b: any) => {
        
const gid = String(b?.config?.gallery_id || '').trim()
const limit = Number(b?.config?.preview_limit ?? 6)
if (!gid) return { block_id: b.id, gallery_id: null, title: String(b?.config?.title || 'גלריה'), items: [] }
const items = await fetchGalleryPreviewByGalleryId(gid, limit, String(Date.now()))
const title = String(b?.config?.title || titleById.get(gid) || 'גלריה')
return { block_id: b.id, gallery_id: gid, title, items }      })
    )

    const blessingsPreview = await fetchBlessingsPreview(blessingsPreviewLimit, device_id)

    return NextResponse.json({
      ok: true,
      settings,
      blocks,
      galleryBlocksPreview,
      galleries: galleriesList,
      blessingsPreview
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
