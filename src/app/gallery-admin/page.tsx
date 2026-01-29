import { Container, Card } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'
import GalleryClient from '@/app/gallery/ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getImages() {
  const sb = supabaseAnon()
  const { data, error } = await sb
    .from('posts')
    .select('*')
    .eq('kind', 'gallery_admin')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw error
  return data || []
}

export default async function AdminGalleryPage() {
  const items = await getImages()
  return (
    <main dir="rtl">
      <Container>
        <Card>
          <h2 className="text-xl font-bold">גלריית מנהל</h2>
          <p className="text-sm text-zinc-600">תמונות שנוספו ע״י מנהלים.</p>
        </Card>

        <div className="mt-4">
          <GalleryClient initialItems={items} readOnly />
        </div>
      </Container>
    </main>
  )
}
