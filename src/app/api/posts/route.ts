import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'
import { matchContentRules } from '@/lib/contentRules'
import { getServerEnv } from '@/lib/env'

const ALLOWED_KINDS = new Set(['blessing', 'gallery', 'gallery_admin'])

function extractUploadsPathFromUrl(u: string) {
  try {
    const marker = '/storage/v1/object/public/uploads/'
    const idx = u.indexOf(marker)
    if (idx === -1) return null
    const raw = u.slice(idx + marker.length)
    return decodeURIComponent(raw).replace(/^\/+/, '')
  } catch {
    return null
  }
}

function ensureThumbPath(storagePath: string) {
  return storagePath.endsWith('.thumb.webp') ? storagePath : `${storagePath}.thumb.webp`
}

function stripThumbSuffix(storagePath: string) {
  return storagePath.endsWith('.thumb.webp') ? storagePath.replace(/\.thumb\.webp$/, '') : storagePath
}

async function deletePostMediaBestEffort(opts: {
  srv: ReturnType<typeof supabaseServiceRole>
  eventId: string
  mediaPath?: string | null
  mediaUrl?: string | null
}) {
  const { srv, eventId } = opts
  const sp = (opts.mediaPath && String(opts.mediaPath)) || (opts.mediaUrl ? extractUploadsPathFromUrl(String(opts.mediaUrl)) : null)
  if (!sp) return

  const base = stripThumbSuffix(sp)
  const paths = [base, ensureThumbPath(base)]

  try {
    await srv.storage.from('uploads').remove(paths)
  } catch (_) {}

  // best-effort DB cleanup for media_items (scoped by event when possible)
  try {
    await srv.from('media_items').delete().eq('event_id', eventId).eq('storage_path', base)
  } catch (_) {}
  if (opts.mediaUrl) {
    try {
      const u = String(opts.mediaUrl)
      await srv
        .from('media_items')
        .delete()
        .eq('event_id', eventId)
        // support both legacy `url` and newer `public_url`
        .or(`url.eq.${u},public_url.eq.${u},thumb_url.eq.${u}`)
    } catch (_) {}
  }
}

function withinOneHour(iso: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  return { since }
}

export async function POST(req: Request) {
  try {
    const env = getServerEnv()
    const url = new URL(req.url)
    const eventId = String(url.searchParams.get('event') || '').trim() || env.EVENT_SLUG

    const body = await req.json()
    const kind = String(body.kind || '')
    if (!ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: 'bad kind' }, { status: 400 })

    // Content rules (block/allow) – apply to public submissions
// Behavior: allow rules override block rules.
// If a block rule matches (and no allow matched), we DO NOT reject –
// we send the post to 'pending' for admin approval.
let moderation: any = null
let matchedBlock = false
if (kind === 'blessing' || kind === 'gallery') {
  const m = await matchContentRules({
    author_name: body.author_name || null,
    text: body.text || null,
    link_url: body.link_url || null,
    media_url: body.media_url || null,
    video_url: body.video_url || null
  }, { eventId })
  if (m.matched && m.rule?.rule_type === 'block') {
    matchedBlock = true
    moderation = { source: 'content_rules', action: 'pending', rule_id: m.rule.id, matched_on: m.matched_on }
  }
}
const device_id = cookies().get('device_id')?.value || null
    const srv = supabaseServiceRole()

    // anti-spam (public only): limit PER KIND (so gallery doesn't block blessings)
    // defaults: 10/hour per device for blessings, 10/hour for gallery
    if (device_id && (kind === 'gallery' || kind === 'blessing')) {
      const { since } = withinOneHour(new Date().toISOString())
      const limit = 100
      const { count, error: cerr } = await srv
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', device_id)
        .eq('kind', kind)
        .gte('created_at', since)

      if (!cerr && (count || 0) >= limit) {
        return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
      }
    }

    const { data: settings, error: serr } = await srv
      .from('event_settings')
      .select('require_approval')
      .eq('event_id', eventId)
      .limit(1)
      .single()
    if (serr) throw serr

    const baseStatus = kind === 'gallery_admin' ? 'approved' : (settings.require_approval ? 'pending' : 'approved')
    const status = matchedBlock ? 'pending' : baseStatus

    const insert = {
      event_id: eventId,
      kind,
      author_name: body.author_name || null,
      text: body.text || null,
      media_path: body.media_path || null,
      media_url: body.media_url || null,
      video_url: body.video_url || null,
      link_url: body.link_url || null,
      status,
      device_id
    }

    const { data, error } = await srv.from('posts').insert(insert).select('*').single()
    if (error) throw error

    if (insert.media_path) {
      const mediaPatch: any = { post_id: data.id, kind }
      if ('crop_position' in body) mediaPatch.crop_position = body.crop_position
      if ('crop_focus_x' in body) mediaPatch.crop_focus_x = body.crop_focus_x
      if ('crop_focus_y' in body) mediaPatch.crop_focus_y = body.crop_focus_y
      await srv
        .from('media_items')
        .update(mediaPatch)
        .eq('storage_path', insert.media_path)
        .is('post_id', null)
    }

    const post = { ...data, reaction_counts: { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }, my_reactions: [] }
    return NextResponse.json({ ok: true, status, post, moderation })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const device_id = cookies().get('device_id')?.value || null
    if (!device_id) return NextResponse.json({ error: 'missing device_id' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data: post, error: perr } = await srv.from('posts').select('*').eq('id', id).limit(1).single()
    if (perr) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (post.device_id !== device_id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    // allow edit/delete only within 1 hour from creation
    const createdAt = new Date(post.created_at)
    const now = new Date()
    const oneHour = 60 * 60 * 1000
    if (now.getTime() - createdAt.getTime() > oneHour) {
      return NextResponse.json({ error: 'אפשר לערוך/למחוק רק בשעה הראשונה.' }, { status: 403 })
    }

    const patch: any = {}
    if ('author_name' in body) patch.author_name = body.author_name || null
    if ('text' in body) patch.text = body.text || null
    if ('link_url' in body) patch.link_url = body.link_url || null

    // media update / remove (public)
    if ('media_url' in body) patch.media_url = body.media_url || null
    if ('media_path' in body) patch.media_path = body.media_path || null
    if ('video_url' in body) patch.video_url = body.video_url || null

    // Re-check content rules on edit (only for public kinds)
    let moderation: any = null
    if (post.kind === 'blessing' || post.kind === 'gallery') {
      const m = await matchContentRules({
        author_name: ('author_name' in patch ? patch.author_name : post.author_name) || null,
        text: ('text' in patch ? patch.text : post.text) || null,
        link_url: ('link_url' in patch ? patch.link_url : post.link_url) || null,
        media_url: ('media_url' in patch ? patch.media_url : post.media_url) || null,
        video_url: ('video_url' in patch ? patch.video_url : post.video_url) || null
      })
      if (m.matched && m.rule?.rule_type === 'block') {
        // Do not reject: send to pending for admin approval
        patch.status = 'pending'
        moderation = { source: 'content_rules', action: 'pending', rule_id: m.rule.id, matched_on: m.matched_on }
      }
    }

    const { data, error } = await srv.from('posts').update(patch).eq('id', id).select('*').single()
    if (error) throw error

    // If media was cleared/replaced, delete the previous blob + media_items (best-effort)
    const incomingMediaUrl = 'media_url' in patch ? patch.media_url : undefined
    const incomingMediaPath = 'media_path' in patch ? patch.media_path : undefined

    const clearedMedia = incomingMediaUrl === null || incomingMediaPath === null
    const replacedMedia =
      (typeof incomingMediaUrl === 'string' && post.media_url && incomingMediaUrl !== post.media_url) ||
      (typeof incomingMediaPath === 'string' && post.media_path && incomingMediaPath !== post.media_path)

    if ((clearedMedia || replacedMedia) && post?.event_id && (post.media_url || post.media_path)) {
      await deletePostMediaBestEffort({
        srv,
        eventId: String(post.event_id),
        mediaUrl: post.media_url,
        mediaPath: post.media_path,
      })
    }

    // attach media_items if a new media_path is provided
    if (patch.media_path) {
      const mediaPatch: any = { post_id: data.id, kind: data.kind }
      if ('crop_position' in body) mediaPatch.crop_position = body.crop_position
      if ('crop_focus_x' in body) mediaPatch.crop_focus_x = body.crop_focus_x
      if ('crop_focus_y' in body) mediaPatch.crop_focus_y = body.crop_focus_y
      await srv
        .from('media_items')
        .update(mediaPatch)
        .eq('storage_path', patch.media_path)
        .is('post_id', null)
    }

    if ('crop_position' in body || 'crop_focus_x' in body || 'crop_focus_y' in body) {
      const cropPatch: any = {}
      if ('crop_position' in body) cropPatch.crop_position = body.crop_position
      if ('crop_focus_x' in body) cropPatch.crop_focus_x = body.crop_focus_x
      if ('crop_focus_y' in body) cropPatch.crop_focus_y = body.crop_focus_y
      await srv
        .from('media_items')
        .update(cropPatch)
        .eq('post_id', data.id)
    }

    return NextResponse.json({ ok: true, post: data, moderation })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()
    const postId = String(id || '')
    if (!postId) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const device_id = cookies().get('device_id')?.value || null
    if (!device_id) return NextResponse.json({ error: 'missing device_id' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data: post, error: perr } = await srv.from('posts').select('*').eq('id', postId).limit(1).single()
    if (perr) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (post.device_id !== device_id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const createdAt = new Date(post.created_at)
    const now = new Date()
    const oneHour = 60 * 60 * 1000
    if (now.getTime() - createdAt.getTime() > oneHour) {
      return NextResponse.json({ error: 'אפשר למחוק רק בשעה הראשונה.' }, { status: 403 })
    }

    const { error } = await srv.from('posts').update({ status: 'deleted' }).eq('id', postId)
    if (error) throw error

    // best-effort cleanup of the media blob + media_items row
    if (post?.event_id && (post?.media_url || post?.media_path)) {
      await deletePostMediaBestEffort({
        srv,
        eventId: String(post.event_id),
        mediaUrl: post.media_url,
        mediaPath: post.media_path,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
