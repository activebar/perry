import EventHomeClient from '@/components/public/EventHomeClient'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({
  params,
}: {
  params: { event: string }
}) {
  const eventId = String(params?.event || '').trim()

  try {
    const s: any = await fetchSettings(eventId)

    const title =
      String(s?.event_name || '').trim() || 'אירוע'

    const description =
      String(s?.meta_description || '').trim() || title

    const image =
      String(s?.og_default_image_url || '').trim() ||
      '/og-placeholder.jpg'

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
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
    return {
      title: 'אירוע',
      description: 'אירוע',
      openGraph: {
        title: 'אירוע',
        description: 'אירוע',
        type: 'website',
        images: ['/og-placeholder.jpg'],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'אירוע',
        description: 'אירוע',
        images: ['/og-placeholder.jpg'],
      },
    }
  }
}

export default function EventHomePage({ params }: { params: { event: string } }) {
  const eventId = String(params?.event || '').trim()
  return <EventHomeClient eventId={eventId} />
}
