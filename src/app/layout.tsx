import './globals.css'
import type { Metadata } from 'next'
import { fetchSettings } from '@/lib/db'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await fetchSettings()
    const eventName = String((settings as any)?.event_name || 'Event Gift Site')

    const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
    const imageUrl =
      (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : undefined)

    const title = eventName
    const description = String((settings as any)?.meta_description || 'Event gift website powered by Active Bar')

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: imageUrl ? [{ url: imageUrl }] : undefined
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
