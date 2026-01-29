import { Container, Card } from '@/components/ui'
import AdminApp from './ui'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  return (
    <main>
      <Container>
        <Card>
          <h2 className="text-xl font-bold">Admin</h2>
          <p className="text-sm text-zinc-600">
            ניהול האתר: בלוקים, ברכות, גלריה, תשלום ופרסומות.
          </p>
        </Card>

        <div className="mt-4">
          <AdminApp />
        </div>
      </Container>
    </main>
  )
}
