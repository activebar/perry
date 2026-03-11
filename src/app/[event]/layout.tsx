import SiteChrome from '@/components/SiteChrome'
import { fetchBlocks, fetchSettings } from '@/lib/db'

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { event: string }
}) {
  const eventId = params.event

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
  let galleryNavLabel: string | undefined = undefined
  let blessingsNavLabel: string | undefined = undefined

  try {
    const s: any = await fetchSettings(eventId)
    const blocks: any[] = await fetchBlocks(eventId)

    // Footer (fully controlled by admin)
    footerEnabled = !!s?.footer_enabled
    footerLabel = s?.footer_label ?? null
    footerUrl = s?.footer_url ?? null
    footerLine2Enabled = !!s?.footer_line2_enabled
    footerLine2Label = s?.footer_line2_label ?? null
    footerLine2Url = s?.footer_line2_url ?? null

    // Dynamic nav labels
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

    // Gift nav button: shown only if the 'gift' block is visible and not auto-hidden by time.
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
