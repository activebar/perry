import Link from 'next/link'
import { Container, Card, Button } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'
import GalleryClient from './ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getImages() {
  const supabase = supabaseAnon()

  // Gallery items are stored in public.media_items (created by /api/upload)
  // NOTE: media_items schema uses: public_url, storage_path, mime_type, kind, deleted_at, archived_at
  const { data, error } = await supabase
    .from('media_items')
    .select('id, public_url, storage_path, mime_type, created_at')
    .eq('kind', 'gallery')
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

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


export default async function GalleryPage() {
  const [items, settings] = await Promise.all([getImages(), fetchSettings()])

    const blessingsTitle = (String((settings as any)?.blessings_title || '').trim() || 'ברכות')


  return (
    <main>
      <Container>
        {/* ניווט עליון */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/"><Button variant="ghost">← חזרה לדף הבית</Button></Link>

            <div className="flex flex-wrap gap-2">
              <Link href="/"><Button variant="ghost">בית</Button></Link>
              <Link href="/gallery"><Button>גלריה</Button></Link>
              <Link href="/blessings"><Button variant="ghost">{blessingsTitle}</Button></Link>
              {settings.gift_enabled && (
                <Link href="/gift"><Button variant="ghost">מתנה</Button></Link>
              )}
            </div>
          </div>
        </Card>

        <div className="mt-4">
  <Card>
    <h2 className="text-xl font-bold">גלריה</h2>
    <p className="text-sm text-zinc-600">העלו תמונות מהאירוע.</p>
  </Card>
</div>

        <div className="mt-4">
          <GalleryClient initialItems={items} />
        </div>
      </Container>
    </main>
  )
}
