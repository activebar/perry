import { Container, Card } from '@/components/ui'
import AdminDashboard from './AdminDashboard'

export type AdminMainTab = 'event' | 'blessings' | 'galleries' | 'design'

export const dynamic = 'force-dynamic'

export default function AdminPage({
  searchParams
}: {
  searchParams?: { tab?: AdminMainTab }
}) {
  const tab = (searchParams?.tab || 'event') as AdminMainTab

  return (
    <main dir="rtl">
      <Container>
        <Card>
          <h2 className="text-xl font-bold">מערכת ניהול</h2>
          <p className="text-sm text-zinc-600">
            טאבים: אירוע, ברכות, גלריות, עיצוב ותוכן.
          </p>
        </Card>

        <div className="mt-4">
          <AdminDashboard tab={tab} />
        </div>
      </Container>
    </main>
  )
}
