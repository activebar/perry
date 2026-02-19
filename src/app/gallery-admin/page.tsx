import { Container, Card } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminGalleryPage() {
  return (
    <main dir="rtl">
      <Container>
        <Card>
          <h2 className="text-xl font-bold">גלריות</h2>
          <p className="text-sm text-zinc-600">ניהול גלריות עבר לדף מנהל &gt; טאב גלריות.</p>
        </Card>
      </Container>
    </main>
  )
}
