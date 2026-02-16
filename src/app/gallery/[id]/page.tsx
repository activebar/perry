import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { GalleryTabs } from '@/components/GalleryTabs'
import { supabaseAnon } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

import GalleryClient from '../ui'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: { id: string }
}

export default async function GalleryByIdPage({ params }: PageProps) {
  const env = getServerEnv()
  const galleryId = decodeURIComponent(params.id)
  const sb = supabaseAnon()

  // tabs from enabled gallery blocks (so you can jump between galleries)
  const { data: blocks } = await sb
    .from('blocks')
    .select('id,type,is_visible,enabled,order_index,config')
    .eq('event_id', env.EVENT_SLUG)
    // Support multiple gallery blocks stored as: gallery, gallery_1, gallery_2...
    .ilike('type', 'gallery%')
    .order('order_index', { ascending: true })

    const tabIds = (blocks || [])
    .filter((b: any) => {
      const t = String(b?.type || '')
      const visible = (b as any).enabled ?? (b as any).is_visible ?? true
      return visible && (t === 'gallery' || t.startsWith('gallery_'))
    })
    .map((b: any) => String((b?.config as any)?.gallery_id || (b?.config as any)?.galleryId || ''))
    .filter(Boolean)

  const titlesById = new Map<string, string>()
  if (tabIds.length) {
    const { data: gs } = await sb
      .from('galleries')
      .select('id,title,is_active')
      .eq('event_id', env.EVENT_SLUG)
      .eq('is_active', true)
      .in('id', tabIds as any)

    for (const g of gs || []) {
      titlesById.set(String((g as any).id), String((g as any).title || '').trim())
    }
  }

  const tabs = tabIds
    .map((id) => ({ id, label: titlesById.get(id) || 'גלריה' }))
    .filter((t, idx, arr) => arr.findIndex((x) => x.id === t.id) === idx)

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
    <main className="py-4">
      <Container>
        <div dir="rtl" className="mb-6 flex items-center justify-between gap-3">
          <div className="text-right">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-zinc-600">כל התמונות המאושרות בגלריה זו.</p>
          </div>
          <Link href="/" className="text-sm font-medium text-zinc-700">
            חזרה לדף הבית
          </Link>
        </div>

        <div className="mb-6">
          <GalleryTabs tabs={tabs} activeId={galleryId} />
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
