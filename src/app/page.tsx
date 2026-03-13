import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Row = {
  event_id: string
  event_name?: string | null
  og_default_image_url?: string | null
  updated_at?: string | null
  created_at?: string | null
}

type EventCard = {
  event_id: string
  event_name: string
  og_image_url: string | null
}

const OG_FALLBACK = '/og-fallback.png'

async function listEvents(): Promise<EventCard[]> {
  const sb = supabaseAnon()
  const { data, error } = await sb
    .from('event_settings')
    .select('event_id,event_name,og_default_image_url,updated_at,created_at')
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

  const out: EventCard[] = []
  for (const [id, r] of byId.entries()) {
    const name = String(r?.event_name || '').trim() || id
    const og = String(r?.og_default_image_url || '').trim() || null
    out.push({ event_id: id, event_name: name, og_image_url: og })
  }

  const prio: Record<string, number> = { demo: 0, wedding: 1, ido: 2, travel: 3 }
  out.sort((a, b) => (prio[a.event_id] ?? 50) - (prio[b.event_id] ?? 50) || a.event_id.localeCompare(b.event_id))
  return out
}

function EventPreviewCard({ event }: { event: EventCard }) {
  const siteHref = `/${encodeURIComponent(event.event_id)}`
  const eventAdminHref = `/admin?event=${encodeURIComponent(event.event_id)}`
  const siteAdminHref = `/admin/login?event=${encodeURIComponent(event.event_id)}`
  const imageUrl = event.og_image_url || OG_FALLBACK

  return (
    <Card className="overflow-hidden rounded-2xl border border-zinc-200 shadow-lg shadow-zinc-300/40 transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-zinc-400/30">
      <div className="relative aspect-[16/9] overflow-hidden bg-zinc-100">
        <img
          src={imageUrl}
          alt={event.event_name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      </div>

      <div className="space-y-1 p-4">
        <div className="truncate text-lg font-bold">{event.event_name}</div>
        <div className="text-xs text-zinc-600" dir="ltr">
          /{event.event_id}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <Link href={eventAdminHref}>
          <button
            type="button"
            className="flex min-h-[58px] w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-2 py-2 text-center text-sm leading-tight text-zinc-800 shadow-sm transition hover:bg-zinc-50"
          >
            <span>
              ניהול
              <br />
              האירוע
            </span>
          </button>
        </Link>

        <Link href={siteHref}>
          <button
            type="button"
            className="flex min-h-[58px] w-full items-center justify-center rounded-full bg-green-600 px-2 py-2 text-center text-sm leading-tight text-white shadow-sm transition hover:bg-green-700"
          >
            <span>
              כניסה
              <br />
              לאתר
            </span>
          </button>
        </Link>

        <Link href={siteAdminHref}>
          <button
            type="button"
            className="flex min-h-[58px] w-full items-center justify-center rounded-full bg-zinc-200 px-2 py-2 text-center text-sm leading-tight text-zinc-800 shadow-sm transition hover:bg-zinc-300"
          >
            <span>
              ניהול
              <br />
              האתר
            </span>
          </button>
        </Link>
      </div>
    </Card>
  )
}

export default async function RootDemoPage() {
  const events = await listEvents()

  return (
    <main dir="rtl" className="text-right">
      <Container>
        <div className="mt-6 space-y-4">
          <Card>
            <h1 className="text-2xl font-bold">דוגמאות אתרים</h1>
            <p className="mt-1 text-sm text-zinc-600">
              בחרו אתר לדוגמה או עברו לניהול. לכל אתר מוצגת תמונת השיתוף הראשית של האירוע.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Link href="/admin">
                <button
                  type="button"
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 transition hover:bg-zinc-50"
                >
                  כניסה למנהל
                </button>
              </Link>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventPreviewCard key={event.event_id} event={event} />
            ))}
          </div>
        </div>
      </Container>
    </main>
  )
}
