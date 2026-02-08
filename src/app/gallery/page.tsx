import Link from 'next/link'
import { Container, Card, Button } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'
import { fetchBlocks, fetchSettings, getBlockTitle } from '@/lib/db'
import GalleryClient from './ui'
import { getEventId } from '@/lib/event-id'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getGalleries() {
  const supabase = supabaseAnon()
  const event_id = getEventId()
  const { data, error } = await supabase
    .from('galleries')
    .select('id, title, order_index')
    .eq('event_id', event_id)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
  if (error) return []
  return data || []
}

async function getImages(galleryId: string | null) {
  const supabase = supabaseAnon()
  const event_id = getEventId()

  // Gallery items are stored in public.media_items (created by /api/upload)
  // NOTE: media_items schema uses: public_url, storage_path, mime_type, kind, deleted_at, archived_at
  let q: any = supabase
    .from('media_items')
    .select('id, public_url, storage_path, mime_type, created_at')
    .eq('event_id', event_id)
    .eq('kind', 'gallery')
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (galleryId) q = q.eq('gallery_id', galleryId)

  const { data, error } = await q

  if (error) return []

  return (data || []).map((row: any) => {
    const url = String(row.public_url || '')
    const mime = String(row.mime_type || '')
    const isVideo = mime.startsWith('video/')
    return {
      id: row.id,
      created_at: row.created_at,
      // keep UI contract from GalleryClient
      media_url: isVideo ? null : url,
      video_url: isVideo ? url : null,
      media_path: row.storage_path || null,
      author_name: null,
      status: null,
      kind: 'gallery',
    }
  })
}


export default async function GalleryPage({ searchParams }: { searchParams: { g?: string } }) {
  const [settings, blocks, galleries] = await Promise.all([fetchSettings(), fetchBlocks(), getGalleries()])

  const requested = String(searchParams?.g || '').trim()
  const first = galleries?.[0]?.id ? String(galleries[0].id) : ''
  const currentGalleryId = requested && galleries.some((x: any) => String(x.id) === requested) ? requested : (first || null)

  const items = await getImages(currentGalleryId)

  const blessingsTitle = getBlockTitle(blocks, 'blessings', (String((settings as any)?.blessings_title || '').trim() || 'ברכות'))
  const giftTitle = getBlockTitle(blocks, 'gift', 'מתנה')
  const galleryTitle = getBlockTitle(blocks, 'gallery', 'גלריה')


  return (
    <main>
      <Container>
        {/* ניווט עליון */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/"><Button variant="ghost">← חזרה לדף הבית</Button></Link>

            <div className="flex flex-wrap gap-2">
              <Link href="/"><Button variant="ghost">בית</Button></Link>
              <Link href="/gallery"><Button>{galleryTitle}</Button></Link>
              <Link href="/blessings"><Button variant="ghost">{blessingsTitle}</Button></Link>
              {settings.gift_enabled && (
                <Link href="/gift"><Button variant="ghost">{giftTitle}</Button></Link>
              )}
            </div>
          </div>
        </Card>

        <div className="mt-4">
  <Card>
    <h2 className="text-xl font-bold">{galleryTitle}</h2>
    <p className="text-sm text-zinc-600">העלו תמונות מהאירוע.</p>
  </Card>
</div>

        <div className="mt-4">
          <GalleryClient initialItems={items} galleries={galleries} currentGalleryId={currentGalleryId} />
        </div>
      </Container>
    </main>
  )
}
