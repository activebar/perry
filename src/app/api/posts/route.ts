
function getEventIdFromEnv() {
  const v = (process.env.EVENT_ID || process.env.NEXT_PUBLIC_EVENT_ID || '').trim()
  return v || 'IDO'
}

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'
import { moderateText } from '@/lib/moderation'
import { matchContentRules } from '@/lib/contentRules'

const ALLOWED_KINDS = new Set(['blessing', 'gallery', 'gallery_admin'])

function withinOneHour(iso: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  return { since }
}


async function getLatestSettingsRow(srv: ReturnType<typeof supabaseServiceRole>) {
  const { data, error } = await srv
    .from('event_settings')
    .select('id, require_approval, start_at, approval_lock_after_days, max_blessing_lines, approval_opened_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) throw error
  return data as any
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDayUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function countLines(text: string) {
  if (!text) return 0
  const parts = String(text).split(/\r?\n/)
  return parts.length
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const kind = String(body.kind || '')
    if (!ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: 'bad kind' }, { status: 400 })

    const device_id = cookies().get('device_id')?.value || null
    const srv = supabaseServiceRole()

    // anti-spam (public only): limit PER KIND (so gallery doesn't block blessings)
    // defaults: 10/hour per device for blessings, 10/hour for gallery
    if (device_id && (kind === 'gallery' || kind === 'blessing')) {
      const { since } = withinOneHour(new Date().toISOString())
      const limit = 10
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

    const settings = await getLatestSettingsRow(srv)

    const lockDays = Number(settings.approval_lock_after_days ?? 7)
    const startAt = settings.start_at ? new Date(settings.start_at) : null
    const now = new Date()

    // approval window anchor
    // 1) For the first opening (often before the event), the lock window is counted from the event start time.
    // 2) If approvals are opened again later (admin turns require_approval off again), the window is counted
    //    from the moment of that opening (approval_opened_at).
    // approval_opened_at is set only when the admin explicitly opens approvals.
    const openedAt = settings.approval_opened_at ? new Date(settings.approval_opened_at) : null
const anchorAt = (startAt && openedAt && openedAt < startAt) ? startAt : (openedAt || startAt)

// Lock window is calculated in calendar days, not exact hours.
// Example: if approval_lock_after_days is 2, then submissions are auto-published on:
// event day, plus the next 2 calendar days, and lock starts at 00:00 of the following day.
const lockAt =
  anchorAt && Number.isFinite(lockDays) && lockDays >= 0
    ? new Date(startOfDayUtc(anchorAt).getTime() + (lockDays + 1) * DAY_MS)
    : null
const isAfterLockWindow = lockAt ? now >= lockAt : false

    // Manager override:
    // If require_approval is ON, all blessings go to approval, including before the event.
    // If require_approval is OFF, blessings are live only until lockAt, then routed to approval.
    const requireApprovalEffective = Boolean(settings.require_approval) || isAfterLockWindow

    const maxLines = Number(settings.max_blessing_lines ?? 50)
    const textRaw = String(body.text || '')
    const textLines = kind === 'blessing' ? countLines(textRaw) : 0
    const forcePendingByLines = kind === 'blessing' && Number.isFinite(maxLines) && maxLines > 0 && textLines > maxLines

    // Manager-controlled rules apply to blessings and cover text + meta.
    const ruleMatch = kind === 'blessing'
      ? await matchContentRules({
          author_name: body.author_name || null,
          text: body.text || null,
          link_url: body.link_url || null,
          media_url: body.media_url || null,
          video_url: body.video_url || null
        })
      : { matched: false } as any

    const forcePendingByRule = kind === 'blessing' && ruleMatch?.matched && ruleMatch?.rule?.rule_type === 'block'

    // Soft moderation: if flagged, route to pending approval (do not hard block the guest).
    // If an allow-rule matches, we treat it as a whitelist hint and do not force pending by moderation alone.
    const moderation = kind === 'blessing' ? await moderateText(textRaw) : null
    const allowByRule = kind === 'blessing' && ruleMatch?.matched && ruleMatch?.rule?.rule_type === 'allow'
    const forcePendingByModeration = kind === 'blessing' && !!moderation?.ok && !!moderation?.flagged && !allowByRule

    let pending_reason: string | null = null
    if (forcePendingByLines) pending_reason = 'lines'
    else if (forcePendingByRule) pending_reason = 'blocked_rule'
    else if (forcePendingByModeration) pending_reason = 'moderation'
    else if (requireApprovalEffective) pending_reason = isAfterLockWindow ? 'approval_lock' : 'require_approval'

    const status =
      kind === 'gallery_admin'
        ? 'approved'
        : ((requireApprovalEffective || forcePendingByLines || forcePendingByRule || forcePendingByModeration) ? 'pending' : 'approved')

    const insert = {
      event_id: getEventIdFromEnv(),
      kind,
      author_name: body.author_name || null,
      text: body.text || null,
      media_path: body.media_path || null,
      media_url: body.media_url || null,
      video_url: body.video_url || null,
      link_url: body.link_url || null,
      status,
      moderation_flagged: forcePendingByModeration ? true : false,
      moderation_provider: moderation?.provider || null,
      moderation_raw: moderation?.raw || null,
      pending_reason,
      content_rule_hit: forcePendingByRule ? {
        id: ruleMatch?.rule?.id,
        match_type: ruleMatch?.rule?.match_type,
        expression: ruleMatch?.rule?.expression,
        matched_on: ruleMatch?.matched_on
      } : null,
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
    return NextResponse.json({
      ok: true,
      status,
      pending_reason: pending_reason || undefined,
      post,
      too_many_lines: forcePendingByLines ? true : undefined,
      flagged: forcePendingByModeration ? true : undefined
    })
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

    // If editing a blessing text, re-validate: max lines + soft moderation.
    if (post.kind === 'blessing' && ('text' in patch || 'author_name' in patch || 'link_url' in patch || 'media_url' in patch || 'video_url' in patch)) {
      const settings = await getLatestSettingsRow(srv)
      const maxLines = Number(settings.max_blessing_lines ?? 50)
      const nextText = ('text' in patch) ? (patch.text || '') : (post.text || '')
      const textRaw = String(nextText || '')
      const textLines = countLines(textRaw)
      const tooManyLines = Number.isFinite(maxLines) && maxLines > 0 && textLines > maxLines

      const ruleMatch = await matchContentRules({
        author_name: ('author_name' in patch) ? (patch.author_name || null) : (post.author_name || null),
        text: nextText || null,
        link_url: ('link_url' in patch) ? (patch.link_url || null) : (post.link_url || null),
        media_url: ('media_url' in patch) ? (patch.media_url || null) : (post.media_url || null),
        video_url: ('video_url' in patch) ? (patch.video_url || null) : (post.video_url || null)
      })

      const blockedByRule = ruleMatch?.matched && ruleMatch?.rule?.rule_type === 'block'
      const allowedByRule = ruleMatch?.matched && ruleMatch?.rule?.rule_type === 'allow'

      const moderation = await moderateText(textRaw)
      const flagged = !!moderation?.ok && !!moderation?.flagged && !allowedByRule

      // Never hard-block the guest: route to pending.
      if (tooManyLines) {
        patch.status = 'pending'
        patch.pending_reason = 'lines'
      } else if (blockedByRule) {
        patch.status = 'pending'
        patch.pending_reason = 'blocked_rule'
      } else if (flagged) {
        patch.status = 'pending'
        patch.pending_reason = 'moderation'
      }

      patch.content_rule_hit = blockedByRule ? {
        id: ruleMatch?.rule?.id,
        match_type: ruleMatch?.rule?.match_type,
        expression: ruleMatch?.rule?.expression,
        matched_on: ruleMatch?.matched_on
      } : null

      patch.moderation_flagged = flagged ? true : false
      patch.moderation_provider = moderation?.provider || null
      patch.moderation_raw = moderation?.raw || null
    }

    const { data, error } = await srv.from('posts').update(patch).eq('id', id).select('*').single()
    if (error) throw error

    // attach media_items if a new media_path is provided
    if (patch.media_path) {
      await srv
        .from('media_items')
        .update({ post_id: data.id, kind: data.kind })
        .eq('storage_path', patch.media_path)
        .is('post_id', null)
    }

    return NextResponse.json({ ok: true, post: data })
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
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}