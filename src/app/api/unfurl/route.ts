// Lightweight OpenGraph unfurl (link preview)
// Returns { url, title, description, image, site_name }
// Minimal implementation (no deps). Limits schemes to http/https.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type UnfurlData = {
  url: string
  title: string
  description: string
  image: string
  site_name: string
}

function safeUrl(u: string) {
  try {
    const url = new URL(u)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

function pickMeta(html: string, key: string) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(
    `<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  )
  const m = html.match(rx)
  return m?.[1] ? m[1].trim() : ''
}

function pickTitle(html: string) {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
  return m?.[1]?.trim() || ''
}

function minimal(finalUrl: string): UnfurlData {
  const host = (() => {
    try {
      return new URL(finalUrl).hostname
    } catch {
      return finalUrl
    }
  })()
  return { url: finalUrl, title: host || finalUrl, description: '', image: '', site_name: '' }
}

async function fetchHtml(url: string) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'activebar-unfurl/1.0',
        accept: 'text/html,application/xhtml+xml'
      }
    })
    const ct = res.headers.get('content-type') || ''
    if (!res.ok) return { ok: false as const, finalUrl: url, html: '' }
    if (!ct.includes('text/html')) return { ok: false as const, finalUrl: url, html: '' }
    const html = await res.text()
    return { ok: true as const, finalUrl: res.url || url, html: html.slice(0, 200_000) }
  } catch {
    return { ok: false as const, finalUrl: url, html: '' }
  } finally {
    clearTimeout(t)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const raw = String(body.url || '')
    const parsed = safeUrl(raw)
    if (!parsed) return NextResponse.json({ ok: true, data: minimal(raw) })

    const { ok, finalUrl, html } = await fetchHtml(parsed.toString())
    if (!ok || !html) return NextResponse.json({ ok: true, data: minimal(finalUrl) })

    const ogTitle = pickMeta(html, 'og:title')
    const ogDesc = pickMeta(html, 'og:description')
    const ogImage = pickMeta(html, 'og:image')
    const ogSite = pickMeta(html, 'og:site_name')
    const twTitle = pickMeta(html, 'twitter:title')
    const twDesc = pickMeta(html, 'twitter:description')
    const twImage = pickMeta(html, 'twitter:image')

    const title = ogTitle || twTitle || pickTitle(html) || minimal(finalUrl).title
    const description = ogDesc || twDesc || ''
    let image = ogImage || twImage || ''

    // Make relative images absolute
    if (image && image.startsWith('/')) {
      try {
        const base = new URL(finalUrl)
        image = new URL(image, base).toString()
      } catch {
        // ignore
      }
    }

    const data: UnfurlData = {
      url: finalUrl,
      title,
      description,
      image,
      site_name: ogSite || ''
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: true, data: minimal('') })
  }
}
