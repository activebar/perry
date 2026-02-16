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


// Tabs should follow the visible gallery blocks only (if a block is hidden, its tab should not appear)
const { data: blocks, error: bErr } = await sb
  .from('blocks')
  .select('id,type,is_visible,order_index,config')
  .eq('event_id', eventId)
  .eq('is_visible', true)

if (bErr) console.error('Failed to load blocks for gallery tabs', bErr)

const galleryBlocks = (blocks || [])
  .filter((b: any) => b.type === 'gallery' && b.is_visible)
  .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))

const galleryIdsFromBlocks = Array.from(
  new Set(
    galleryBlocks
      .map((b: any) => String((b as any)?.config?.gallery_id || ''))
      .filter(Boolean)
  )
)

const { data: galleriesForTabs, error: gErr } = galleryIdsFromBlocks.length
  ? await sb
      .from('galleries')
      .select('id,title,is_active')
      .eq('event_id', eventId)
      .in('id', galleryIdsFromBlocks)
      .eq('is_active', true)
  : { data: [], error: null as any }

if (gErr) console.error('Failed to load galleries for tabs', gErr)

const gMap = new Map((galleriesForTabs || []).map((g: any) => [String(g.id), g]))

const tabs: { id: string; label: string; href: string }[] = []
const seen = new Set<string>()
for (const b of galleryBlocks as any[]) {
  const cfg = (b as any)?.config || {}
  const gid = String(cfg?.gallery_id || '')
  if (!gid || seen.has(gid)) continue
  const g = gMap.get(gid)
  if (!g) continue
  tabs.push({ id: gid, label: String(cfg?.title || g.title || 'גלריה'), href: `/gallery/${gid}` })
  seen.add(gid)
}
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
    <main className="py-3">
      <Container>
        <div dir="rtl" className="mb-4">
          <div className="text-right">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-zinc-600">כל התמונות המאושרות בגלריה זו.</p>
          </div>

          {/* Gallery-to-gallery navigation (based on enabled gallery blocks) */}
          <div className="mt-3">
            <GalleryTabs tabs={tabs} activeId={galleryId} />
          </div>
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