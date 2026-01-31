import './globals.css'
import type { Metadata } from 'next'
import { fetchSettings } from '@/lib/db'
import { getSiteUrl, toAbsoluteUrl } from '@/lib/site-url'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await fetchSettings()
    const eventName = String((settings as any)?.event_name || 'Event Gift Site')

    const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
    const imageUrlRaw =
      (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : undefined)
    // Always point OG image to our own domain, so crawlers (WhatsApp/Facebook) can fetch it
    // even when Supabase storage is private.
    const imageUrl = toAbsoluteUrl('/og/default.jpg')


    const title = eventName
    const description = String((settings as any)?.meta_description || 'Event gift website powered by Active Bar')

    return {
      metadataBase: new URL(getSiteUrl()),
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        images: imageUrl
          ? [
              {
                url: imageUrl,
                width: 1200,
                height: 630,
                alt: title
              }
            ]
          : undefined
      },
      twitter: {
        card: imageUrl ? 'summary_large_image' : 'summary',
        title,
        description,
        images: imageUrl ? [imageUrl] : undefined
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
