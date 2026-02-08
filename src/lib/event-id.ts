export function getEventId(): string {
  // Prefer NEXT_PUBLIC_EVENT_ID so the client and server share the same value.
  // Fallbacks are safe defaults for local/dev.
  // IMPORTANT: Do NOT fall back to Vercel project URLs/domains because those are not event_id values
  // and will cause DB queries (eq('event_id', ...)) to return empty results.
  return (
    process.env.NEXT_PUBLIC_EVENT_ID ||
    process.env.EVENT_ID ||
    'default'
  )
}
