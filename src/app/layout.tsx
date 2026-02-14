import './globals.css'
import type { Metadata } from 'next'
import { fetchSettings } from '@/lib/db'
import { getSiteUrl, toAbsoluteUrl } from '@/lib/site-url'
import SiteChrome from '@/components/SiteChrome'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await fetchSettings()
    const eventName = String((settings as any)?.event_name || 'Event Gift Site')

    // OG image: generated server-side (supports admin-selected background image).
    // WhatsApp/Facebook handle query strings fine, and changing it helps cache-busting.
    const v = encodeURIComponent(String((settings as any)?.updated_at || Date.now()))
    const imageUrl = toAbsoluteUrl(`/api/og/image?default=1&v=${v}`)


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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
// Public site chrome title (event name) – safe fallback
let eventName: string | undefined = undefined
  let footerEnabled: boolean | undefined = undefined
  let footerLabel: string | null | undefined = undefined
  let footerUrl: string | null | undefined = undefined
  let footerLine2Enabled: boolean | null | undefined = undefined
  let footerLine2Label: string | null | undefined = undefined
  let footerLine2Url: string | null | undefined = undefined
try {
  const s: any = await fetchSettings()
  eventName = s?.event_name ? String(s.event_name) : undefined
} catch {
  eventName = undefined
      footerEnabled = undefined
      footerLabel = undefined
      footerUrl = undefined
      footerLine2Enabled = undefined
      footerLine2Label = undefined
      footerLine2Url = undefined
}

  return (
    <html lang="he">
      <body>
        <SiteChrome eventName={eventName} footerEnabled={footerEnabled} footerLabel={footerLabel} footerUrl={footerUrl} footerLine2Enabled={footerLine2Enabled} footerLine2Label={footerLine2Label} footerLine2Url={footerLine2Url}>{children}</SiteChrome>
      </body>
    </html>
  )
}
