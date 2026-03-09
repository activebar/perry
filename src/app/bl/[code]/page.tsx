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

async function resolve(code: string) {
  const srv = supabaseServiceRole()
  const { data: row } = await srv
    .from('short_links')
    .select('code, target_path, kind, event_id, post_id')
    .eq('code', code)
    .maybeSingle()

  const kind = String((row as any)?.kind || '').trim()
  const eventId = String((row as any)?.event_id || '').trim()
  const postId = String((row as any)?.post_id || '').trim()
  const targetPath = String((row as any)?.target_path || '').trim()

  if (postId) {
    const { data: post } = await srv.from('posts').select('id,event_id,status').eq('id', postId).maybeSingle()
    const postEventId = String((post as any)?.event_id || '').trim() || eventId
    if (postEventId) {
      return `/${postEventId}/blessings#post-${postId}`
    }
  }

  if (targetPath) {
    if (/^\/[a-z0-9_-]+\/blessings(?:#.*)?$/i.test(targetPath)) return targetPath
    if (/^\/blessings(?:#.*)?$/i.test(targetPath) && eventId) return `/${eventId}${targetPath}`
    if (/^\/blessings\/p\/([0-9a-f-]{36})$/i.test(targetPath)) {
      const id = targetPath.match(/^\/blessings\/p\/([0-9a-f-]{36})$/i)?.[1]
      if (id) return eventId ? `/${eventId}/blessings#post-${id}` : `/blessings#post-${id}`
    }
    if (!kind || kind === 'bl') return targetPath
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
