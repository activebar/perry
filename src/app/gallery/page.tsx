import Link from 'next/link'
import { Container, Card, Button } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase';
import { fetchSettings } from '@/lib/db'
import GalleryClient from './ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getImages() {
  const supabase = supabaseAnon();

  // Gallery items are stored in public.media_items (created by /api/upload)
  const { data, error } = await supabase
    .from('media_items')
    .select('id, public_url, created_at, kind')
    .eq('kind', 'gallery')
    .order('created_at', { ascending: false })
    .limit(120);

  if (error) return [];

  // Map to the minimal shape expected by the GalleryGrid UI.
  return (data || [])
    .filter((x: any) => x?.id && x?.public_url)
    .map((x: any) => ({
      id: x.id,
      kind: 'gallery',
      status: 'approved',
      media_url: x.public_url,
      created_at: x.created_at,
    }));
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
