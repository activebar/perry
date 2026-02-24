import GalleryClient from '@/app/gallery/ui'
import { supabaseAnon } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function GalleryPageForEvent({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  const sb = supabaseAnon()

  const { data: galleries } = await sb
    .from('galleries')
    .select('id, name, slug, upload_enabled, show_in_home, is_enabled, cover_url')
    .eq('event_id', eventId)
    .eq('is_enabled', true)
    .order('created_at', { ascending: true })

  const { data: media } = await sb
    .from('media_items')
    .select('id, url, thumb_url, public_url, storage_path, gallery_id, kind, created_at, crop_position')
    .eq('event_id', eventId)
    .eq('is_approved', true)
    .in('kind', ['gallery', 'galleries'])
    .order('created_at', { ascending: false })
    .limit(400)

  return <GalleryClient galleries={galleries || []} media={media || []} />
}
