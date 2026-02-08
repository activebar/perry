import Link from 'next/link'
import { Container, Card, Button } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { fetchBlocks, fetchSettings, getBlockTitle } from '@/lib/db'
import GalleryClient from './ui'
import { getEventId } from '@/lib/event-id'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getGalleries() {
  // Use service role to avoid any RLS / anon policy surprises.
  // This page is rendered on the server and we still only return *active* galleries for the current event.
  const supabase = supabaseServiceRole()
  const event_id = getEventId()
  const { data, error } = await supabase
    .from('galleries')
    .select('id, title, order_index, upload_enabled, require_approval')
    .eq('event_id', event_id)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
  if (error) return []
  return data || []
}

async function getImages(galleryId: string | null) {
  const event_id = getEventId()
  const device_id = cookies().get('device_id')?.value || null
  const srv = supabaseServiceRole()

  if (!galleryId) return []

  const { data: posts, error } = await srv
    .from('posts')
    .select('id, created_at, media_url, video_url, status, device_id, gallery_id')
    .eq('event_id', event_id)
    .eq('kind', 'gallery')
    .eq('status', 'approved')
    .eq('gallery_id', galleryId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return []

  const oneHour = 60 * 60 * 1000
  const now = Date.now()

  return (posts || []).map((p: any) => {
    const created = new Date(p.created_at).getTime()
    const isMine = device_id && p.device_id && String(p.device_id) === String(device_id)
    const within = now - created <= oneHour
    return {
      id: p.id,
      created_at: p.created_at,
      media_url: p.media_url,
      video_url: p.video_url,
      status: p.status,
      kind: 'gallery',
      can_delete: Boolean(isMine && within),
      can_edit: Boolean(isMine && within),
      editable_until: new Date(created + oneHour).toISOString()
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
