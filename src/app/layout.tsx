import './globals.css'
import type { Metadata } from 'next'
import { fetchBlocks, fetchSettings } from '@/lib/db'
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
  let showGiftNavButton: boolean | undefined = undefined
  let giftNavLabel: string | undefined = undefined
try {
  const s: any = await fetchSettings()
// Footer (admin controlled)
footerEnabled = Boolean(s?.footer_enabled)
footerLabel = (s?.footer_label ?? null) as any
footerUrl = (s?.footer_url ?? null) as any
footerLine2Enabled = Boolean(s?.footer_line2_enabled)
footerLine2Label = (s?.footer_line2_label ?? null) as any
footerLine2Url = (s?.footer_line2_url ?? null) as any


const blocks: any[] = await fetchBlocks()

// Gift nav button should behave like Hero gift button:
// shown only if the 'gift' block is visible and not auto-hidden by time.
const giftBlock = (blocks || []).find((b: any) => String(b?.type) === 'gift')
giftNavLabel = String(giftBlock?.config?.title || '').trim() || 'מתנה'
if (!giftBlock?.is_visible) {
  showGiftNavButton = false
} else if (giftBlock?.config?.auto_hide_after_hours) {
  const hours = Number(giftBlock.config.auto_hide_after_hours)
  if (Number.isFinite(hours) && hours > 0 && s?.start_at) {
    const start = new Date(String(s.start_at))
    const hideAt = new Date(start.getTime() + hours * 60 * 60 * 1000)
    showGiftNavButton = new Date() <= hideAt
  } else {
    showGiftNavButton = true
  }
} else {
  showGiftNavButton = true
}


  eventName = s?.event_name ? String(s.event_name) : undefined
} catch {
  eventName = undefined
      footerEnabled = undefined
      footerLabel = undefined
      footerUrl = undefined
      footerLine2Enabled = undefined
      footerLine2Label = undefined
      footerLine2Url = undefined
      showGiftNavButton = false
      giftNavLabel = undefined
}

  return (
    <html lang="he">
      <body>
        <SiteChrome eventName={eventName} footerEnabled={footerEnabled} footerLabel={footerLabel} footerUrl={footerUrl} footerLine2Enabled={footerLine2Enabled} footerLine2Label={footerLine2Label} footerLine2Url={footerLine2Url} showGiftNavButton={showGiftNavButton} giftNavLabel={giftNavLabel}>{children}</SiteChrome>
      </body>
    </html>
  )
}
