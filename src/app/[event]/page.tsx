// Path: src/app/[event]/page.tsx
// Version: V27.0
// Updated: 2026-03-21 21:35
// Note: homepage uses shared metadata from [event]/layout to avoid per-site manual metadata files

import EventHomeClient from '@/components/public/EventHomeClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function EventHomePage({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  return <EventHomeClient eventId={eventId} />
}
