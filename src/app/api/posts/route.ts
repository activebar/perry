import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'
import { moderateText } from '@/lib/moderation'

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

    const lockDaysRaw = Number(settings.approval_lock_after_days)
    const lockDays = Number.isFinite(lockDaysRaw) ? lockDaysRaw : 7
    const startAt = settings.start_at ? new Date(settings.start_at) : null
    const now = new Date()

    // We treat approval_lock_after_days as *calendar days in Israel* (Asia/Jerusalem),
    // not exact 24h blocks.
    // This prevents surprises when start_at is stored in UTC or has a late hour.
    // Rule: lock triggers at the start of the day after (lockDays + 1) days.
    // Example: lockDays=2 => open on event day + next 2 days, lock on day 4 00:00.
    const TZ = 'Asia/Jerusalem'
    const tzDayNumber = (d: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(d)
      const y = Number(parts.find(p => p.type === 'year')?.value || '1970')
      const m = Number(parts.find(p => p.type === 'month')?.value || '01')
      const day = Number(parts.find(p => p.type === 'day')?.value || '01')
      return Math.floor(Date.UTC(y, m - 1, day) / (24 * 60 * 60 * 1000))
    }

    // approval window anchor
    // 1) For the first opening (often before the event), the lock window is counted from the event start time.
    // 2) If approvals are opened again later (admin turns require_approval off again), the window is counted
    //    from the moment of that opening (approval_opened_at).
    // approval_opened_at is set only when the admin explicitly opens approvals.
    const openedAt = settings.approval_opened_at ? new Date(settings.approval_opened_at) : null
    const anchorAt = (startAt && openedAt && openedAt < startAt)
      ? startAt
      : (openedAt || startAt)

    // Compare by day number in Asia/Jerusalem.
    // Lock when nowDay >= anchorDay + lockDays + 1
    const anchorDay = anchorAt ? tzDayNumber(anchorAt) : null
    const nowDay = tzDayNumber(now)
    const lockDay = (anchorDay !== null && Number.isFinite(lockDays) && lockDays >= 0)
      ? (anchorDay + lockDays + 1)
      : null

    const isAfterLockWindow = lockDay !== null ? nowDay >= lockDay : false

    // Manager override:
    // If require_approval is ON, all blessings go to approval, including before the event.
    // If require_approval is OFF, blessings are live only until lockAt, then routed to approval.
    const requireApprovalEffective = Boolean(settings.require_approval) || isAfterLockWindow

    const maxLines = Number(settings.max_blessing_lines ?? 50)
    const textRaw = String(body.text || '')
    const textLines = kind === 'blessing' ? countLines(textRaw) : 0
    const forcePendingByLines = kind === 'blessing' && Number.isFinite(maxLines) && maxLines > 0 && textLines > maxLines

    // Soft moderation: always check blessings. If flagged, route to pending approval (do not hard block the guest).
    const moderation = kind === 'blessing' ? await moderateText(textRaw) : null
    const forcePendingByModeration = kind === 'blessing' && !!moderation?.ok && !!moderation?.flagged

    let pending_reason: string | null = null
    if (forcePendingByLines) pending_reason = 'lines'
    else if (forcePendingByModeration) pending_reason = 'moderation'
    else if (requireApprovalEffective) pending_reason = isAfterLockWindow ? 'approval_lock' : 'require_approval'

    const status =
      kind === 'gallery_admin'
        ? 'approved'
        : ((requireApprovalEffective || forcePendingByLines || forcePendingByModeration) ? 'pending' : 'approved')

    const insert = {
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
    if (post.kind === 'blessing' && 'text' in patch) {
      const settings = await getLatestSettingsRow(srv)
      const maxLines = Number(settings.max_blessing_lines ?? 50)
      const textRaw = String(patch.text || '')
      const textLines = countLines(textRaw)
      const tooManyLines = Number.isFinite(maxLines) && maxLines > 0 && textLines > maxLines

      const moderation = await moderateText(textRaw)
      const flagged = !!moderation?.ok && !!moderation?.flagged

      // Never hard-block the guest: route to pending.
      if (tooManyLines) {
        patch.status = 'pending'
        patch.pending_reason = 'lines'
      } else if (flagged) {
        patch.status = 'pending'
        patch.pending_reason = 'moderation'
      }

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
