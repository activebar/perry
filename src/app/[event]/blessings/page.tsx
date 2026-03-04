import type { Metadata } from 'next'

// Use relative imports to avoid path-alias / root-dir edge cases on deployments
import BlessingsClient from '../../blessings/ui'
import BlessingsShareHeader from '../../blessings/BlessingsShareHeader'
import { Container } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'
import { toAbsoluteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { event: string } }): Promise<Metadata> {
  const eventId = String(params?.event || '').trim()
  const title = `ברכות - ${eventId}`
  return {
    title,
    openGraph: {
      title,
      url: toAbsoluteUrl(`/${encodeURIComponent(eventId)}/blessings`)
    }
  }
}

export default async function BlessingsPageForEvent({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  const sb = supabaseServiceRole()

  const [{ data: settings }, { data: blocks }] = await Promise.all([
    sb
      .from('event_settings')
      .select('*')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    sb.from('blocks').select('*').eq('event_id', eventId).order('order_index', { ascending: true })
  ])

  const { data: posts } = await sb
    .from('posts')
    .select('id, created_at, author_name, author_relation, text, media_url, media_kind, video_url, link_url, status')
    .eq('event_id', eventId)
    .eq('kind', 'blessing')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(60)

  return (
    <main className="py-10">
      <Container>
        <BlessingsShareHeader settings={settings || {}} />
        <BlessingsClient settings={settings || {}} blocks={blocks || []} initialFeed={(posts || []) as any} />
      </Container>
    </main>
  )
}
