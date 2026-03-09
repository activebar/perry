export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit.replace(/\/$/, '')

  // When running on Vercel, prefer the current request host (so OG tags match
  // the exact domain the user is visiting, e.g. perry-b.vercel.app).
  try {
    // next/headers is only available on the server
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { headers } = require('next/headers')
    const h = headers()
    const host = h.get('x-forwarded-host') || h.get('host')
    const proto = h.get('x-forwarded-proto') || 'https'
    if (host) return `${proto}://${host}`.replace(/\/$/, '')
  } catch {
    // ignore (not in a request context)
  }

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`.replace(/\/$/, '')

  // fallback (local / unknown)
  return 'http://localhost:3000'
}

export function toAbsoluteUrl(u?: string | null) {
  if (!u) return undefined
  const s = String(u).trim()
  if (!s) return undefined
  if (/^https?:\/\//i.test(s)) return s
  const base = getSiteUrl()
  if (s.startsWith('/')) return `${base}${s}`
  return `${base}/${s}`
}
