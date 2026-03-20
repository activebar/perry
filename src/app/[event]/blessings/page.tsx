// Path: src/app/[event]/blessings/page.tsx
// Version: V25.1
// Updated: 2026-03-20 12:55
// Note: show total pending blessings count on public blessings page so users know submissions await approval

import type { Metadata } from 'next'

import BlessingsClient from './ui'
import BlessingsShareHeader from './BlessingsShareHeader'
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

  const { count: pendingBlessingsCount } = await sb
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('kind', 'blessing')
    .eq('status', 'pending')

  return (
    <main className="py-6 sm:py-10">
      <div className="w-full">
        <BlessingsShareHeader settings={settings || {}} />
        {(pendingBlessingsCount || 0) > 0 && (
          <div className="mx-auto mb-4 max-w-3xl rounded-full bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-700">
            יש {pendingBlessingsCount || 0} ברכות שממתינות לאישור מנהל
          </div>
        )}
        <BlessingsClient settings={settings || {}} blocks={blocks || []} initialFeed={(posts || []) as any} />
      </div>
    </main>
  )
}
