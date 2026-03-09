import GiftClient from './ui'
import { supabaseAnon } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function GiftPageForEvent({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  const sb = supabaseAnon()

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

  return <GiftClient settings={settings || {}} blocks={blocks || []} basePath={`/${eventId}`} />
}
