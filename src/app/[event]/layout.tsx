// Path: src/app/[event]/layout.tsx
// Version: V27.0
// Updated: 2026-03-21 21:35
// Note: dynamic per-event metadata from current host + event settings, shared automatically across all event pages

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import SiteChrome from '@/components/SiteChrome'
import { fetchBlocks, fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function getBaseUrl() {
  const h = headers()
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  const proto = h.get('x-forwarded-proto') || 'https'
  return host ? `${proto}://${host}` : ''
}

export async function generateMetadata({
  params,
}: {
  params: { event: string }
}): Promise<Metadata> {
  const eventId = String(params?.event || '').trim()
  const base = getBaseUrl()
  const pageUrl = base ? `${base}/${encodeURIComponent(eventId)}` : `/${eventId}`

  try {
    const s: any = await fetchSettings(eventId)

    const title = String(s?.event_name || '').trim() || 'אירוע'
    const description =
      String(s?.meta_description || '').trim() ||
      String(s?.share_gallery_description || '').trim() ||
      title

    const image =
      base
        ? `${base}/api/og/image?event=${encodeURIComponent(eventId)}&default=1`
        : `/api/og/image?event=${encodeURIComponent(eventId)}&default=1`

    return {
      metadataBase: base ? new URL(base) : undefined,
      title,
      description,
      alternates: {
        canonical: pageUrl,
      },
      openGraph: {
        title,
        description,
        type: 'website',
        url: pageUrl,
        locale: 'he_IL',
        images: [
          {
            url: image,
            width: 630,
            height: 630,
            alt: title,
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
    const title = 'אירוע'
    const description = 'אירוע'
    const image =
      base
        ? `${base}/api/og/image?event=${encodeURIComponent(eventId)}&default=1`
        : `/api/og/image?event=${encodeURIComponent(eventId)}&default=1`

    return {
      metadataBase: base ? new URL(base) : undefined,
      title,
      description,
      alternates: {
        canonical: pageUrl,
      },
      openGraph: {
        title,
        description,
        type: 'website',
        url: pageUrl,
        locale: 'he_IL',
        images: [
          {
            url: image,
            width: 630,
            height: 630,
            alt: title,
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
  }
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { event: string }
}) {
  const eventId = params.event

  let eventName: string | undefined = undefined
  let footerEnabled: boolean | undefined = undefined
  let footerLabel: string | null | undefined = undefined
  let footerUrl: string | null | undefined = undefined
  let footerLine2Enabled: boolean | null | undefined = undefined
  let footerLine2Label: string | null | undefined = undefined
  let footerLine2Url: string | null | undefined = undefined
  let showGiftNavButton: boolean | undefined = undefined
  let giftNavLabel: string | undefined = undefined
  let galleryNavLabel: string | undefined = undefined
  let blessingsNavLabel: string | undefined = undefined

  try {
    const s: any = await fetchSettings(eventId)
    const blocks: any[] = await fetchBlocks(eventId)

    footerEnabled = !!s?.footer_enabled
    footerLabel = s?.footer_label ?? null
    footerUrl = s?.footer_url ?? null
    footerLine2Enabled = !!s?.footer_line2_enabled
    footerLine2Label = s?.footer_line2_label ?? null
    footerLine2Url = s?.footer_line2_url ?? null

    const sortedBlocks = [...(blocks || [])].sort(
      (a: any, b: any) => Number(a?.order_index || 0) - Number(b?.order_index || 0)
    )

    const galleryBlock = sortedBlocks.find(
      (b: any) =>
        String(b?.type) === 'gallery' ||
        String(b?.type || '').startsWith('gallery_')
    )

    const blessingsBlock = sortedBlocks.find(
      (b: any) => String(b?.type) === 'blessings'
    )

    galleryNavLabel =
      String(galleryBlock?.config?.title || '').trim() || 'גלריות'

    blessingsNavLabel =
      String(
        blessingsBlock?.config?.title ||
          s?.blessings_title ||
          ''
      ).trim() || 'ברכות'

    const giftBlock = sortedBlocks.find((b: any) => String(b?.type) === 'gift')
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
    // keep fallbacks
  }

  return (
    <SiteChrome
      basePath={`/${eventId}`}
      eventName={eventName}
      footerEnabled={footerEnabled}
      footerLabel={footerLabel}
      footerUrl={footerUrl}
      footerLine2Enabled={footerLine2Enabled}
      footerLine2Label={footerLine2Label}
      footerLine2Url={footerLine2Url}
      showGiftNavButton={showGiftNavButton}
      giftNavLabel={giftNavLabel}
      blessingsNavLabel={blessingsNavLabel}
    >
      {children}
    </SiteChrome>
  )
}
