import { redirect, notFound } from 'next/navigation'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function cleanCode(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
}

function normalizeBlessingTarget(targetPath: string | null, eventId?: string | null, postId?: string | null) {
  const event = String(eventId || '').trim()
  const post = String(postId || '').trim()
  const raw = String(targetPath || '').trim()

  if (post && event) {
    if (!raw || /^\/blessings(?:\/p\/[0-9a-f-]{36})?(?:[#?].*)?$/i.test(raw)) {
      return `/${encodeURIComponent(event)}/blessings#post-${post}`
    }
  }

  if (raw) {
    if (event && /^\/blessings(?:[#/?].*)?$/i.test(raw)) return `/${encodeURIComponent(event)}${raw}`
    return raw
  }

  if (post && event) return `/${encodeURIComponent(event)}/blessings#post-${post}`
  if (post) return `/blessings#post-${post}`
  if (event) return `/${encodeURIComponent(event)}/blessings`
  return null
}

async function resolve(code: string) {
  const srv = supabaseServiceRole()

  const first = await srv
    .from('short_links')
    .select('target_path, kind, post_id, event_id')
    .eq('code', code)
    .maybeSingle()

  if (first.data) {
    const k = String((first.data as any).kind || '').trim()
    if (!k || k === 'bl') {
      let eventId = String((first.data as any).event_id || '').trim() || null
      const postId = String((first.data as any).post_id || '').trim() || null

      if (!eventId && postId) {
        const postRes = await srv.from('posts').select('event_id').eq('id', postId).maybeSingle()
        eventId = String((postRes.data as any)?.event_id || '').trim() || null
      }

      const normalized = normalizeBlessingTarget(String((first.data as any).target_path || ''), eventId, postId)
      if (normalized) return normalized
    }
  }

  const second = await srv
    .from('short_links')
    .select('target_path, post_id, event_id')
    .eq('code', code)
    .maybeSingle()

  if (second.data) {
    let eventId = String((second.data as any).event_id || '').trim() || null
    const postId = String((second.data as any).post_id || '').trim() || null

    if (!eventId && postId) {
      const postRes = await srv.from('posts').select('event_id').eq('id', postId).maybeSingle()
      eventId = String((postRes.data as any)?.event_id || '').trim() || null
    }

    return normalizeBlessingTarget(String((second.data as any).target_path || ''), eventId, postId)
  }

  return null
}

export default async function ShortBLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const target = await resolve(code)
  if (!target) notFound()

  redirect(target)
}
