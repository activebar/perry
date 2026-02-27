export function getEventId(): string {
  // Prefer NEXT_PUBLIC_EVENT_ID so the client and server share the same value.
  // Fallbacks are safe defaults for local/dev.
  return (
    process.env.NEXT_PUBLIC_EVENT_ID ||
    process.env.EVENT_ID ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL || // not ideal, but better than empty
    'default'
  )
}


export function getEventIdFromRequest(req: { url: string }): string {
  try {
    const u = new URL(req.url)
    const q = String(u.searchParams.get('event') || '').trim()
    if (q) return q
    // Also support path-based routing: /{event}/...
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length > 0) return parts[0]
  } catch {}
  return getEventId()
}
