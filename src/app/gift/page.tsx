import { redirect } from 'next/navigation'
import { getServerEnv } from '@/lib/env'

// Legacy route (before multi-event): keep old links working
export const dynamic = 'force-dynamic'

export default function LegacyGiftRedirect() {
  const env = getServerEnv()
  const eventId = env.EVENT_SLUG || 'ido'
  redirect(`/${encodeURIComponent(eventId)}/gift`)
}
