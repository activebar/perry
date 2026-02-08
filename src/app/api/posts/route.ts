import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'
import { matchContentRules } from '@/lib/contentRules'
import { getEventId } from '@/lib/event-id'

const ALLOWED_KINDS = new Set(['blessing', 'gallery'])

function withinOneHour(iso: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  return { since }
}

export async function POST(req: Request) {
  try {
    const event_id = getEventId()
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
  })
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
        .eq('event_id', event_id)
        .eq('device_id', device_id)
        .eq('kind', kind)
        .gte('created_at', since)

      if (!cerr && (count || 0) >= limit) {
        return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
      }
    }

    // Approval policy:
// - blessings: event_settings.require_approval
// - gallery: per-gallery require_approval (public.galleries.require_approval)
let baseStatus: 'pending' | 'approved' = 'approved'

if (kind === 'blessing') {
  const { data: settings, error: serr } = await srv
    .from('event_settings')
    .select('require_approval')
    .eq('event_id', event_id)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (serr) throw serr
  baseStatus = settings.require_approval ? 'pending' : 'approved'
}

if (kind === 'gallery') {
  const gallery_id = String(body.gallery_id || '').trim()
  if (!gallery_id) return NextResponse.json({ error: 'missing gallery_id' }, { status: 400 })

  const { data: g, error: gerr } = await srv
    .from('galleries')
    .select('id, require_approval, is_active')
    .eq('event_id', event_id)
    .eq('id', gallery_id)
    .maybeSingle()
  if (gerr) throw gerr
  if (!g || g.is_active === false) return NextResponse.json({ error: 'gallery not found' }, { status: 404 })

  baseStatus = g.require_approval ? 'pending' : 'approved'
}

const status = matchedBlock ? 'pending' : baseStatus


    const insert = {
      event_id,
      kind,
      author_name: body.author_name || null,
      text: body.text || null,
      media_path: body.media_path || null,
      media_url: body.media_url || null,
      video_url: body.video_url || null,
      link_url: body.link_url || null,
      gallery_id: kind === 'gallery' ? (String(body.gallery_id || '').trim() || null) : null,
      status,
      device_id
    }

    const { data, error } = await srv.from('posts').insert(insert).select('*').single()
    if (error) throw errorr

    if (insert.media_path) {
      await srv
        .from('media_items')
        .update({ post_id: data.id, kind })
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
    const event_id = getEventId()
    const body = await req.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const device_id = cookies().get('device_id')?.value || null
    if (!device_id) return NextResponse.json({ error: 'missing device_id' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data: post, error: perr } = await srv.from('posts').select('*').eq('event_id', event_id).eq('id', id).limit(1).single()
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

const oldMediaPath = String((post as any)?.media_path || '')
const newMediaPath = 'media_path' in patch ? String(patch.media_path || '') : oldMediaPath

const { data, error } = await srv.from('posts').update(patch).eq('event_id', event_id).eq('id', id).select('*').single()
    if (error) throw errorr

    // If media_path changed: delete old object to avoid storage leftovers
    if (newMediaPath && oldMediaPath && newMediaPath !== oldMediaPath) {
      try { await srv.storage.from('uploads').remove([oldMediaPath]) } catch {}
      try { await srv.from('media_items').update({ deleted_at: new Date().toISOString() }).eq('storage_path', oldMediaPath) } catch {}
    }


    if (error) throw errorr

    // attach media_items if a new media_path is provided
    if (patch.media_path) {
      await srv
        .from('media_items')
        .update({ post_id: data.id, kind: data.kind })
        .eq('storage_path', patch.media_path)
        .is('post_id', null)
    }

    return NextResponse.json({ ok: true, post: data, moderation })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const event_id = getEventId()
    const { id } = await req.json()
    const postId = String(id || '')
    if (!postId) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const device_id = cookies().get('device_id')?.value || null
    if (!device_id) return NextResponse.json({ error: 'missing device_id' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data: post, error: perr } = await srv.from('posts').select('*').eq('event_id', event_id).eq('id', postId).limit(1).single()
    if (perr) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (post.device_id !== device_id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const createdAt = new Date(post.created_at)
    const now = new Date()
    const oneHour = 60 * 60 * 1000
    if (now.getTime() - createdAt.getTime() > oneHour) {
      return NextResponse.json({ error: 'אפשר למחוק רק בשעה הראשונה.' }, { status: 403 })
    }

    const { error } = await srv.from('posts').update({ status: 'deleted' }).eq('event_id', event_id).eq('id', postId)
    if (error) throw errorr
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
