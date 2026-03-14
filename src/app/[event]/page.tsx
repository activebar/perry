import EventHomeClient from '@/components/public/EventHomeClient'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()

  try {
    const s: any = await fetchSettings(eventId)

    const title =
      String(s?.og_title || s?.event_name || '').trim() || 'אירוע'

    const description =
      String(s?.og_description || '').trim() || ''

    const image =
      s?.og_image ||
      s?.share_logo_url ||
      '/og-placeholder.jpg'

    return {
      title,
      description,

      openGraph: {
        title,
        description,
        images: [
          {
            url: image,
            width: 1200,
            height: 630,
          },
        ],
      },

      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image],
      },
    }
  } catch {
    return {}
  }
}

export default function EventHomePage({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  return <EventHomeClient eventId={eventId} />
}
