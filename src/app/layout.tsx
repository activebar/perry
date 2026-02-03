import './globals.css'
import type { Metadata } from 'next'
import { fetchSettings } from '@/lib/db'
import { getSiteUrl, toAbsoluteUrl } from '@/lib/site-url'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await fetchSettings()

    const siteUrl = getSiteUrl()
    const title =
      String((settings as any)?.event_name || 'Event Gift Site')

    const description =
      String(
        (settings as any)?.meta_description ||
          'Event gift website powered by Active Bar'
      )

    // ✅ תמונת OG ברירת מחדל – תמיד קיימת
    // v=1 מאפשר cache-busting עתידי
    const ogImage = toAbsoluteUrl('/api/og/image?default=1&v=1')

    return {
      metadataBase: new URL(siteUrl),
      title,
      description,

      openGraph: {
        type: 'website',
        url: siteUrl,
        title,
        description,
        images: [
          {
            url: ogImage,
            width: 800,
            height: 800,
            alt: title,
            type: 'image/jpeg'
          }
        ]
      },

      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [
          {
            url: ogImage,
            width: 800,
            height: 800,
            alt: title
          }
        ]
      }
    }
  } catch (err) {
    // fallback קשיח – שלא יהיה מצב בלי OG
    return {
      title: 'Event Gift Site',
      description: 'Event gift website powered by Active Bar',
      openGraph: {
        images: [
          {
            url: '/api/og/image?default=1',
            width: 800,
            height: 800
          }
        ]
      }
    }
  }
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  )
}
