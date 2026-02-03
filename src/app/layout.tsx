import './globals.css'
import type { Metadata } from 'next'
import { fetchSettings } from '@/lib/db'
import { getSiteUrl, toAbsoluteUrl } from '@/lib/site-url'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await fetchSettings()
    const eventName = String((settings as any)?.event_name || 'Event Gift Site')

    // OG image: generated server-side (supports admin-selected background image).
    // WhatsApp/Facebook handle query strings fine, and changing it helps cache-busting.
    const imageUrl = toAbsoluteUrl('/api/og/image?default=1&v=1')


    const title = eventName
    const description = String((settings as any)?.meta_description || 'Event gift website powered by Active Bar')

    return {
      metadataBase: new URL(getSiteUrl()),
      title,
      description,
      openGraph: {
        title,
        description,
        images: imageUrl
          ? [{ url: imageUrl, width: 800, height: 800, alt: title, type: 'image/jpeg' }]
          : undefined
      },
      twitter: {
        card: imageUrl ? 'summary_large_image' : 'summary',
        title,
        description,
        images: imageUrl ? [{ url: imageUrl, width: 800, height: 800, alt: title }] : undefined
      }
    }
  } catch {
    return {
      title: 'Event Gift Site',
      description: 'Event gift website powered by Active Bar'
    }
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he">
      <body>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  )
}
