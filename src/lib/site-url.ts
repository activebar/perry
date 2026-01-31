export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit.replace(/\/$/, '')

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
