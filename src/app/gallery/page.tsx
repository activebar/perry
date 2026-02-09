import Link from 'next/link'
import { Container, Card, Button } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'
import { fetchBlocks, fetchSettings, getBlockTitle } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getGalleries() {
  const supabase = supabaseAnon()
  const { data, error } = await supabase
    .from('galleries')
    .select('id, title, order_index, upload_enabled, require_approval')
    .order('order_index', { ascending: true })
    .limit(100)
  if (error) return []
  return data || []
}

export default async function GalleriesIndexPage() {
  const [galleries, settings, blocks] = await Promise.all([getGalleries(), fetchSettings(), fetchBlocks()])

  const blessingsTitle = getBlockTitle(blocks, 'blessings', (String((settings as any)?.blessings_title || '').trim() || 'ברכות'))
  const giftTitle = getBlockTitle(blocks, 'gift', 'מתנה')
  const galleryTitle = getBlockTitle(blocks, 'gallery', 'גלריה')

  return (
    <main>
      <Container>
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
            <p className="text-sm text-zinc-600">בחרו גלריה לצפייה / העלאה.</p>
          </Card>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(galleries || []).map((g: any) => (
            <Link key={g.id} href={`/gallery/${g.id}`} className="block">
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{g.title || 'גלריה'}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {g.upload_enabled ? 'העלאה פתוחה' : 'צפייה בלבד'}
                      {g.require_approval ? ' · דורש אישור מנהל' : ''}
                    </div>
                  </div>
                  <Button>פתח</Button>
                </div>
              </Card>
            </Link>
          ))}

          {(!galleries || galleries.length === 0) && (
            <Card>
              <p className="text-sm text-zinc-600">עדיין לא נוצרו גלריות. מנהל יכול ליצור גלריה בטאב “גלריות”.</p>
            </Card>
          )}
        </div>
      </Container>
    </main>
  )
}
