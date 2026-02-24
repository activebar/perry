import Link from 'next/link'

import { Container, Card, Button } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Row = {
  event_id: string
  event_name?: string | null
  updated_at?: string | null
  created_at?: string | null
}

async function listEvents(): Promise<Array<{ event_id: string; event_name: string }>> {
  const sb = supabaseAnon()
  const { data, error } = await sb
    .from('event_settings')
    .select('event_id,event_name,updated_at,created_at')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !data) return []

  const byId = new Map<string, Row>()
  for (const r of data as any[]) {
    const id = String((r as any)?.event_id || '').trim()
    if (!id) continue
    if (!byId.has(id)) byId.set(id, r as any)
  }

  const out: Array<{ event_id: string; event_name: string }> = []
  for (const [id, r] of byId.entries()) {
    const name = String((r as any)?.event_name || '').trim() || id
    out.push({ event_id: id, event_name: name })
  }

  const prio: Record<string, number> = { demo: 0, wedding: 1, ido: 2 }
  out.sort((a, b) => (prio[a.event_id] ?? 50) - (prio[b.event_id] ?? 50) || a.event_id.localeCompare(b.event_id))
  return out
}

export default async function RootDemoPage() {
  const events = await listEvents()

  return (
    <main dir="rtl" className="text-right">
      <Container>
        <div className="mt-6 space-y-4">
          <Card>
            <h1 className="text-2xl font-bold">דוגמאות אתרים</h1>
            <p className="mt-1 text-sm text-zinc-600">בחרו אתר לדוגמה. בהמשך יהיה כאן קטלוג מסודר לפי סוג אתר.</p>
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <Link href="/admin"><Button>כניסה למנהל</Button></Link>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <Card key={e.event_id}>
                <div className="space-y-1">
                  <div className="text-lg font-bold truncate">{e.event_name}</div>
                  <div className="text-xs text-zinc-600" dir="ltr">/{e.event_id}</div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Link href={`/${encodeURIComponent(e.event_id)}`}>
                    <Button>פתח אתר</Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Container>
    </main>
  )
}
