import { redirect } from 'next/navigation'
import { getServerEnv } from '@/lib/env'

// Legacy route (before multi-event): keep old links working
export const dynamic = 'force-dynamic'

export default function LegacyGalleryRedirect() {
  const env = getServerEnv()
  const eventId = env.EVENT_SLUG || 'ido'
  redirect(`/${encodeURIComponent(eventId)}/gallery`)
}
