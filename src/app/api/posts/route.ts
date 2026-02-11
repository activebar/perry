import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'
import { matchContentRules } from '@/lib/contentRules'

const ALLOWED_KINDS = new Set(['blessing', 'gallery', 'gallery_admin'])

function withinOneHour(iso: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  return { since }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const kind = String(body.kind || '')
    if (!ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: 'bad kind' }, { status: 400 })

    // Optional: gallery scope (for kind='gallery')
    const gallery_id = kind === 'gallery' ? (String(body.gallery_id || '').trim() || null) : null

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
        .eq('device_id', device_id)
        .eq('kind', kind)
        .gte('created_at', since)

      if (!cerr && (count || 0) >= limit) {
        return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
      }
    }

    // Moderation behavior for gallery can be controlled per-gallery.
    let requireApproval = true
    if (kind === 'gallery' && gallery_id) {
      const { data: gal, error: gerr } = await srv
        .from('galleries')
        .select('require_approval, upload_enabled')
        .eq('id', gallery_id)
        .limit(1)
        .maybeSingle()
      if (gerr) throw gerr
      if (!gal) return NextResponse.json({ error: 'גלריה לא נמצאה' }, { status: 404 })
      if (gal.upload_enabled === false) return NextResponse.json({ error: 'העלאה לגלריה זו חסומה' }, { status: 403 })
      requireApproval = gal.require_approval !== false
    } else {
      const { data: settings, error: serr } = await srv
        .from('event_settings')
        .select('require_approval')
        .limit(1)
        .single()
      if (serr) throw serr
      requireApproval = !!settings.require_approval
    }

    const baseStatus = kind === 'gallery_admin' ? 'approved' : (requireApproval ? 'pending' : 'approved')
    const status = matchedBlock ? 'pending' : baseStatus

    const insert = {
      kind,
      author_name: body.author_name || null,
      text: body.text || null,
      media_path: body.media_path || null,
      media_url: body.media_url || null,
      video_url: body.video_url || null,
      link_url: body.link_url || null,
      gallery_id,
      status,
      device_id
    }

    const { data, error } = await srv.from('posts').insert(insert).select('*').single()
    if (error) throw error

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

    const oldMediaPath = String(post.media_path || '').trim()
    const newMediaPath = typeof body.media_path === 'string' ? String(body.media_path || '').trim() : ''

    const { data, error } = await srv.from('posts').update(patch).eq('id', id).select('*').single()
    if (error) throw error

    // If media was replaced, delete old file from storage and link the new media_items row.
    if (newMediaPath && oldMediaPath && newMediaPath !== oldMediaPath) {
      try {
        await srv.storage.from('uploads').remove([oldMediaPath])
      } catch {
        // ignore
      }
      await srv.from('media_items').update({ deleted_at: new Date().toISOString() }).eq('storage_path', oldMediaPath)
    }

    if (newMediaPath) {
      await srv
        .from('media_items')
        .update({ post_id: data.id, kind: String(data.kind || 'gallery') })
        .eq('storage_path', newMediaPath)
        .is('post_id', null)
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

    // mark deleted
    const { error } = await srv.from('posts').update({ status: 'deleted' }).eq('id', postId)
    if (error) throw error

    // If the post has an uploaded file – delete it from storage + mark media_items.deleted_at
    const mediaPath = String(post.media_path || '').trim()
    if (mediaPath) {
      try {
        await srv.storage.from('uploads').remove([mediaPath])
      } catch {
        // ignore storage errors (we still mark as deleted)
      }
      await srv
        .from('media_items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('storage_path', mediaPath)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
