import { Container, Card } from '@/components/ui'
import AdminDashboard from './AdminDashboard'

export type AdminMainTab = 'event' | 'blessings' | 'galleries' | 'design' | 'permissions'

export const dynamic = 'force-dynamic'

export default function AdminPage({
  searchParams
}: {
  searchParams?: { tab?: AdminMainTab; sub?: string }
}) {
  const tab = (searchParams?.tab || 'event') as AdminMainTab
  const sub = (searchParams?.sub || '') as string

  return (
    <main dir="rtl">
      <Container>
        <Card>
          <h2 className="text-xl font-bold">מערכת ניהול</h2>
          <p className="text-sm text-zinc-600">
            טאבים: אירוע, ברכות, גלריות, עיצוב ותוכן, הרשאות..
          </p>
        </Card>

        <div className="mt-4">
          <AdminDashboard tab={tab} sub={sub} />
        </div>
      </Container>
    </main>
  )
}
