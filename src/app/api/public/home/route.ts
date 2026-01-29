import { NextResponse } from 'next/server'

import { computeEventPhase, fetchBlocks, fetchSettings } from '@/lib/db'
import { supabaseAnon } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function fetchGalleryPreview(kind: 'gallery' | 'gallery_admin', limit: number) {
  const sb = supabaseAnon()
  const safeLimit = Math.max(0, Math.min(50, Number(limit || 0)))
  if (!safeLimit) return []

  const { data, error } = await sb
    .from('posts')
    .select('id, media_url, created_at')
    .eq('kind', kind)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) return []
  return data || []
}

export async function GET() {
  const now = new Date()
  const [settings, blocks] = await Promise.all([fetchSettings(), fetchBlocks()])

  const guestPreviewLimit = Number((settings as any).guest_gallery_preview_limit ?? 6)
  const adminPreviewLimit = Number((settings as any).admin_gallery_preview_limit ?? 6)

  const [guestPreview, adminPreview] = await Promise.all([
    fetchGalleryPreview('gallery', guestPreviewLimit),
    fetchGalleryPreview('gallery_admin', adminPreviewLimit)
  ])

  const phase = computeEventPhase(settings.start_at, now)

  return NextResponse.json(
    {
      ok: true,
      now: now.toISOString(),
      phase,
      settings,
      blocks,
      guestPreview,
      adminPreview
    },
    {
      headers: {
        // חשוב כדי שלא יהיו "תקיעות" בעדכון נתונים אחרי שמירה באדמין
        'Cache-Control': 'no-store, max-age=0'
      }
    }
  )
}
