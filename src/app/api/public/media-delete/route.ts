import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function derivePathFromPublicUrl(u: any): string | null {
  if (typeof u !== 'string') return null
  const m = u.match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/)
  return m?.[1] ? String(m[1]) : null
}

function thumbCandidates(basePath: string): string[] {
  const out = new Set<string>()
  // Current convention: original.ext.thumb.webp
  out.add(`${basePath}.thumb.webp`)
  // Fallback convention: original.thumb.webp (strip extension)
  const stripped = basePath.replace(/\.[^./]+$/, '')
  if (stripped && stripped !== basePath) out.add(`${stripped}.thumb.webp`)
  return Array.from(out)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const id = String(body.id || '').trim()
    const event = String(body.event || '').trim()
    const deviceId = String(body.device_id || '').trim()

    if (!id || !event || !deviceId) return jsonError('missing fields', 400)

    const sb = supabaseServiceRole()
    const { data: row, error } = await sb
      .from('media_items')
      .select('id, kind, storage_path, url, public_url, thumb_url, uploader_device_id, editable_until, created_at')
      .eq('event_id', event)
      .eq('id', id)
      .single()

    if (error) return jsonError(error.message, 500)
    if (!row) return jsonError('not found', 404)

    // Only allow for gallery items and only by same device within editable window
    if (String((row as any).kind) !== 'gallery') return jsonError('forbidden', 403)
    if (String((row as any).uploader_device_id || '') !== deviceId) return jsonError('forbidden', 403)

    const now = Date.now()
    const editableUntil = (row as any).editable_until
      ? new Date(String((row as any).editable_until)).getTime()
      : (row as any).created_at
        ? new Date(String((row as any).created_at)).getTime() + 60 * 60 * 1000
        : 0

    if (!editableUntil || now > editableUntil) return jsonError('expired', 403)

    // delete storage (best-effort) + delete thumb variants
    const base = (typeof (row as any).storage_path === 'string' && (row as any).storage_path.trim())
      ? (row as any).storage_path.trim()
      : (derivePathFromPublicUrl((row as any).public_url) || derivePathFromPublicUrl((row as any).url) || derivePathFromPublicUrl((row as any).thumb_url))

    if (base) {
      const paths: string[] = [base]
      if (!base.endsWith('.thumb.webp')) paths.push(...thumbCandidates(base))
      await sb.storage.from('uploads').remove(Array.from(new Set(paths))).catch(() => null as any)
    }

    const { error: derr } = await sb.from('media_items').delete().eq('event_id', event).eq('id', id)
    if (derr) return jsonError(derr.message, 500)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}
