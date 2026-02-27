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
