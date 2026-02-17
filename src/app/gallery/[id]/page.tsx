import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'

import GalleryClient from '../ui'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: { id: string }
}

export default async function GalleryByIdPage({ params }: PageProps) {
  const galleryId = decodeURIComponent(params.id)
  const sb = supabaseAnon()

  // gallery settings (upload gating + auto approve window handled in API)
  const { data: g } = await sb.from('galleries').select('id, title, upload_enabled').eq('id', galleryId).maybeSingle()

  const uploadEnabled = !!(g as any)?.upload_enabled

  const { data: items } = await sb
    .from('media_items')
    .select('id, url, thumb_url, created_at, editable_until, is_approved')
    .eq('kind', 'gallery')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(500)

  const title = (g as any)?.title || 'גלריה'

  return (
    <main className="py-10">
      <Container>
        <div dir="rtl" className="mb-6 flex items-center justify-between gap-3">
          <div className="text-right">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-zinc-600">כל התמונות המאושרות בגלריה זו.</p>
          </div>
          <Link href="/" className="text-sm font-medium underline">
            חזרה לדף הבית
          </Link>
        </div>

        {(items || []).length === 0 ? (
          <Card dir="rtl">
            <div className="text-right text-sm text-zinc-600">אין תמונות עדיין.</div>
          </Card>
        ) : null}

        <GalleryClient initialItems={items || []} galleryId={galleryId} uploadEnabled={uploadEnabled} />
      </Container>
    </main>
  )
}
