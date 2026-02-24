import EventHomeClient from '@/components/public/EventHomeClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function EventHomePage({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  return <EventHomeClient eventId={eventId} />
}
