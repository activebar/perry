import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

async function fetchSettingsAndBlocks() {
  const sb = supabaseAnon()
  const [{ data: settings, error: sErr }, { data: blocks, error: bErr }] = await Promise.all([
    sb.from('event_settings').select('*').order('updated_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).single(),
    sb.from('blocks').select('*').order('order_index', { ascending: true })
  ])
  if (sErr) throw sErr
  if (bErr) throw bErr
  return { settings, blocks: blocks || [] }
}

// Gallery previews are now driven by *gallery blocks* (one block per gallery).
// We keep /api/public/home focused on settings + blocks + blessings.


async function fetchGalleryPreviews(blocks: any[]) {
  const sb = supabaseAnon()
  const galleryBlocks = (blocks || []).filter((b: any) => String(b?.type || '').startsWith('gallery'))
  const galleryIds = galleryBlocks
    .map((b: any) => (b?.config as any)?.gallery_id)
    .filter((x: any) => typeof x === 'string' && x.length > 0)

  if (galleryIds.length === 0) return {}

  const { data, error } = await sb
    .from('media_items')
    .select('id, gallery_id, url, thumb_url, public_url, storage_path, created_at, kind, is_approved')
    .eq('kind', 'gallery')
    .eq('is_approved', true)
    .in('gallery_id', galleryIds as any)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error || !data) return {}

  // limit per gallery block (default 12)
  const limitById: Record<string, number> = {}
  for (const b of galleryBlocks) {
    const gid = (b?.config as any)?.gallery_id
    const lim = Number((b?.config as any)?.limit ?? 12)
    if (typeof gid === 'string' && gid) limitById[gid] = Number.isFinite(lim) ? Math.max(0, Math.min(48, lim)) : 12
  }

  const out: Record<string, any[]> = {}
  for (const it of data as any[]) {
    const gid = String((it as any).gallery_id || '')
    if (!gid) continue
    const url = String((it as any).thumb_url || (it as any).url || (it as any).public_url || '')
    if (!url) continue
    if (!out[gid]) out[gid] = []
    if (out[gid].length >= (limitById[gid] ?? 12)) continue
    out[gid].push({
      id: (it as any).id,
      url,
      created_at: (it as any).created_at
    })
  }
  return out
}


async function fetchBlessingsPreview(limit: number, device_id?: string | null) {
  const sb = supabaseAnon()
  const safeLimit = Math.max(0, Math.min(20, Number(limit || 0)))
  if (!safeLimit) return []

  // Prefer server-side random order via RPC (if exists)
const { data: rpcPosts, error: rpcErr } = await sb.rpc('get_home_posts_random', { p_limit: safeLimit })
const posts = (rpcErr ? null : (rpcPosts as any[] | null)) || null
const error = rpcErr || null

// Fallback: latest first if RPC not installed yet
const fallback = async () => {
  const { data, error } = await sb
    .from('posts')
    .select('id, author_name, text, media_url, link_url, created_at')
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

    const blessingsPreview,
      galleryPreviewsLimit = Number(settings.blessings_preview_limit ?? 3)

    const blessingsPreview = await fetchBlessingsPreview(blessingsPreviewLimit, device_id)
    const galleryPreviews = await fetchGalleryPreviews(blocks)

    return NextResponse.json({
      ok: true,
      settings,
      blocks,
      blessingsPreview
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
