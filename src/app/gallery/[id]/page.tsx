import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

import GalleryClient from '../ui'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: { id: string }
}

export default async function GalleryByIdPage({ params }: PageProps) {
  const galleryId = decodeURIComponent(params.id)
  const env = getServerEnv()
  const sb = supabaseServiceRole()

  // gallery settings (upload gating + auto approve window handled in API)
  const { data: g } = await sb.from('galleries').select('id, title, upload_enabled').eq('event_id', env.EVENT_SLUG).eq('id', galleryId).maybeSingle()

  const uploadEnabled = !!(g as any)?.upload_enabled

  // Visible galleries navigation (source of truth: galleries table)
  const { data: navGalleries } = await sb
    .from('galleries')
    .select('id,title,order_index')
    .eq('event_id', env.EVENT_SLUG)
    .eq('is_active', true)
    .order('order_index', { ascending: true })

  const nav = (navGalleries || []).map((x: any) => ({ id: String(x.id), title: String(x.title || 'גלריה') }))

  const { data: items } = await sb
    .from('media_items')
    .select('id, url, thumb_url, created_at, editable_until, is_approved')
    .eq('event_id', env.EVENT_SLUG)
    .eq('kind', 'gallery')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(500)

  const title = (g as any)?.title || 'גלריה'

  return (
    <main className="py-10">
      <Container>
        <div dir="rtl" className="mb-4 text-right">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-zinc-600">כל התמונות המאושרות בגלריה זו.</p>
        </div>

        {nav.length > 1 ? (
          <div dir="rtl" className="mb-5 flex justify-end">
            <div className="flex max-w-full gap-2 overflow-x-auto pb-2">
              {nav.map(gx => (
                <Link
                  key={gx.id}
                  href={`/gallery/${encodeURIComponent(gx.id)}`}
                  className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                    gx.id === galleryId ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {gx.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

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
