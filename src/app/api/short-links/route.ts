import { NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Body = {
  post_id?: string
  postId?: string
  code?: string
  target_path?: string
  targetPath?: string
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

// Creates/updates a short link record.
// Used by the client share UI so that /b/<code> can be resolved server-side.
export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return jsonError('Invalid JSON')
  }

  const postId = String(body.post_id || body.postId || '').trim()
  if (!postId) return jsonError('Missing post_id')

  // Default code: first 8 chars of UUID (stable, short, low collision risk)
  const code = String(body.code || postId.slice(0, 8)).trim().toLowerCase()
  if (!/^[0-9a-f]{6,16}$/.test(code)) return jsonError('Invalid code format')

  const targetPath = String(body.target_path || body.targetPath || `/blessings/p/${postId}`).trim()
  if (!targetPath.startsWith('/')) return jsonError('target_path must start with /')

  const srv = supabaseServiceRole()
  // Some deployments may have `short_links` without `post_id` column (legacy).
  // We try to write post_id first, and fallback to writing only target_path.
  const first = await srv.from('short_links').upsert(
    { code, post_id: postId, target_path: targetPath } as any,
    { onConflict: 'code' }
  )

  if (first.error) {
    const fallback = await srv
      .from('short_links')
      .upsert({ code, target_path: targetPath } as any, { onConflict: 'code' })

    if (fallback.error) {
      return jsonError(first.error.message || fallback.error.message || 'Failed to save short link', 500)
    }
  }

  return NextResponse.json({ ok: true, code, target_path: targetPath })
}
