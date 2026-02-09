import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Container, Card, Button } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'
import { fetchBlocks, fetchSettings, getBlockTitle } from '@/lib/db'
import GalleryClient from '../ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getGallery(id: string) {
  const supabase = supabaseAnon()
  const { data, error } = await supabase
    .from('galleries')
    .select('id, title, upload_enabled, require_approval')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

async function getApprovedItems(galleryId: string) {
  const supabase = supabaseAnon()
  const { data, error } = await supabase
    .from('posts')
    .select('id, created_at, media_url, video_url, status')
    .eq('kind', 'gallery')
    .eq('gallery_id', galleryId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return []
  return data || []
}

export default async function GalleryByIdPage({ params }: { params: { id: string } }) {
  const id = String(params?.id || '')
  if (!id) return notFound()

  const [gallery, items, settings, blocks] = await Promise.all([getGallery(id), getApprovedItems(id), fetchSettings(), fetchBlocks()])
  if (!gallery) return notFound()

  const blessingsTitle = getBlockTitle(blocks, 'blessings', (String((settings as any)?.blessings_title || '').trim() || 'ברכות'))
  const giftTitle = getBlockTitle(blocks, 'gift', 'מתנה')
  const galleryTitle = getBlockTitle(blocks, 'gallery', 'גלריה')

  return (
    <main>
      <Container>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/gallery"><Button variant="ghost">← לכל הגלריות</Button></Link>

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
            <h2 className="text-xl font-bold">{gallery.title || 'גלריה'}</h2>
            <p className="text-sm text-zinc-600">
              {gallery.upload_enabled ? 'אפשר להעלות תמונות לגלריה זו.' : 'צפייה והורדה בלבד.'}
              {gallery.require_approval ? ' (דורש אישור מנהל להצגה באתר)' : ''}
            </p>
          </Card>
        </div>

        <div className="mt-4">
          <GalleryClient initialItems={items} galleryId={id} uploadEnabled={!!gallery.upload_enabled} />
        </div>
      </Container>
    </main>
  )
}
