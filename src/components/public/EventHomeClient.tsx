'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container, Card, Button } from '@/components/ui'
import { computeEventPhase } from '@/lib/db'
import HeroRotator from '@/components/hero-rotator'
import ShareModal from '@/components/share/ShareModal'
import { buildShareMessage } from '@/lib/share/buildShareMessage'

type HomePayload = {
  ok: boolean
  settings: any
  blocks: any[]
  // legacy fields (older API) - optional
  guestPreview?: any[]
  adminPreview?: any[]
  blessingsPreview: any[]
  galleryPreviews?: Record<string, any[]>
}

function fmt(dt: string) {
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

const EMOJIS: Array<'👍' | '😍' | '🔥' | '🙏'> = ['👍', '😍', '🔥', '🙏']
type UnfurlData = { url: string; title: string; description: string; image: string; site_name: string }
const unfurlCache = new Map<string, UnfurlData>()

function hostOf(u: string) {
  try {
    return new URL(u).hostname
  } catch {
    return u
  }
}

function youtubeThumb(u: string) {
  try {
    const url = new URL(u)
    const host = url.hostname.replace(/^www\./, '')
    let id = ''
    if (host === 'youtu.be') id = url.pathname.replace(/^\//, '')
    else if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || ''
      else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || ''
      else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] || ''
    }
    if (!id) return ''
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  } catch {
    return ''
  }
}

function useUnfurl(url?: string) {
  const [data, setData] = useState<UnfurlData | null>(null)

  useEffect(() => {
    const u = (url || '').trim()
    if (!u) return
    if (unfurlCache.has(u)) {
      setData(unfurlCache.get(u)!)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/unfurl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: u })
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return
        const d = json?.data as UnfurlData
        if (!d?.url) return
        unfurlCache.set(u, d)
        if (!cancelled) setData(d)
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [url])

  return data
}

function HomeLinkThumb({ url }: { url?: string | null }) {
  const d = useUnfurl(url || undefined)
  if (!url) return null
  if (!d) return null
  const img = d.image || youtubeThumb(d.url)
  if (!img) return null
  return (
    <a
      href={d.url}
      target="_blank"
      rel="noreferrer"
      className="mx-auto block w-full max-w-[320px] overflow-hidden rounded-2xl bg-zinc-50 aspect-square"
      aria-label="פתח קישור"
    >
      <img src={img} alt="" className="h-full w-full object-cover" />
    </a>
  )
}

function HomeLinkMeta({ url, showDetails = false }: { url?: string | null; showDetails?: boolean }) {
  const d = useUnfurl(url || undefined)
  if (!url) return null
  if (!d) return null

  const title = (d.title || '').trim()
  const desc = (d.description || '').trim()
  const host = hostOf(d.url)

  return (
    <div className="mt-2 text-[11px] text-zinc-600">
      <a
        href={d.url}
        target="_blank"
        rel="noreferrer"
        className="block max-w-full truncate whitespace-nowrap"
        dir="ltr"
        title={d.url}
      >
        {host}
      </a>

      {showDetails && (title || desc) ? (
        <div className="mt-1 space-y-0.5">
          {title ? <div className="truncate whitespace-nowrap">{title}</div> : null}
          {desc ? <div className="truncate whitespace-nowrap opacity-80">{desc}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

export default function EventHomeClient({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [data, setData] = useState<HomePayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; isVideo: boolean } | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const base = `/${encodeURIComponent(eventId || '')}`
  const hrefOf = (p: string) => `${base}${p.startsWith('/') ? p : `/${p}`}`

  async function triggerDownload(url: string) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = 'image'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  async function load() {
    setErr(null)
    try {
      const res = await fetch(`/api/public/home?event=${encodeURIComponent(eventId)}&ts=${Date.now()}`, {
        cache: 'no-store'
      })
      const json = (await res.json().catch(() => ({}))) as HomePayload
      if (!res.ok) throw new Error((json as any)?.error || 'Request failed')
      setData(json)
    } catch (e: any) {
      setErr(e?.message || 'שגיאה')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const { settings, blocks, blessingsPreview, galleryPreviews } = data || ({} as any)

  const phase = useMemo(() => {
    if (!settings?.start_at) return 'pre'
    return computeEventPhase(settings.start_at)
  }, [settings?.start_at])

  const visibleTypes = useMemo<Set<string>>(() => {
    const s = settings || {}
    const now = new Date()
    return new Set<string>(
      (blocks || [])
        .filter((b: any) => b && b.is_visible)
        .filter((b: any) => {
          const showFrom = (b as any)?.show_from ? new Date((b as any).show_from) : null
          const showUntil = (b as any)?.show_until ? new Date((b as any).show_until) : null
          if (showFrom && !Number.isNaN(showFrom.getTime()) && now < showFrom) return false
          if (showUntil && !Number.isNaN(showUntil.getTime()) && now > showUntil) return false
          return true
        })
        .map((b: any) => String(b.type))
    )
  }, [blocks, settings])

  const getBlock = (type: string) => (blocks || []).find((b: any) => String(b?.type) === type)

  const heroCfg = getBlock('hero')?.config || {}
  // Backward compat: allow hero images to come from event_settings.hero_images
  if ((!Array.isArray((heroCfg as any).images) || !(heroCfg as any).images.length) && Array.isArray((settings as any)?.hero_images)) {
    ;(heroCfg as any).images = (settings as any).hero_images
  }
  if (!Number((heroCfg as any).rotate_seconds) && Number((settings as any)?.hero_rotate_seconds)) {
    ;(heroCfg as any).rotate_seconds = Number((settings as any).hero_rotate_seconds)
  }
  const showHero = visibleTypes.has('hero')

  const blessingCfg = getBlock('blessings')?.config || {}
  const showBlessings = visibleTypes.has('blessings')

  const galleryCfg = getBlock('gallery')?.config || {}
  const showGallery = visibleTypes.has('gallery') || [...visibleTypes].some((t) => t.startsWith('gallery_'))

  const giftCfg = getBlock('gift')?.config || {}
  const showGift = visibleTypes.has('gift')

  const title = (settings?.event_name || settings?.title || '').trim() || 'אירוע'
  const locationText = (settings?.location_text || '').trim()
  const wazeUrl = (settings?.waze_url || '').trim()

  const startAt = settings?.start_at ? fmt(settings.start_at) : ''

  const shareEnabled = settings?.share_enabled !== false
  const shareTitle = String(settings?.share_title || title || '').trim() || title
  const shareBody = String(settings?.share_body || '').trim()

  const shareLink = typeof window !== 'undefined' ? window.location.href : ''
  const shareMsg = buildShareMessage(
    settings?.share_template ?? null,
    {
      EVENT_NAME: shareTitle,
      TEXT: shareBody,
      LINK: shareLink
    },
    ''
  )

  return (
    <main dir="rtl" className="text-right">
      <Container>
        <div className="mt-4 space-y-4">
          {showHero ? (
            <Card>
              <div className="space-y-2 text-right">
                <div className="text-2xl font-bold">{title}</div>
                {startAt ? <div className="text-sm text-zinc-600">{startAt}</div> : null}
                {locationText ? <div className="text-sm text-zinc-600">{locationText}</div> : null}
                {wazeUrl ? (
                  <a href={wazeUrl} target="_blank" rel="noreferrer">
                    <Button className="mt-2">Waze</Button>
                  </a>
                ) : null}
              </div>

              {Array.isArray(heroCfg?.images) && heroCfg.images.length ? (
                <div className="mt-4">
                  <HeroRotator images={heroCfg.images} seconds={Number(heroCfg.rotate_seconds || 4) || 4} />
                </div>
              ) : null}

              {shareEnabled ? (
                <div className="mt-4 flex justify-end">
                  <Button type="button" variant="ghost" onClick={() => setShareOpen(true)}>
                    שיתוף
                  </Button>
                  <ShareModal
                    open={shareOpen}
                    onClose={() => setShareOpen(false)}
                    title={shareTitle}
                    message={shareMsg}
                    link={shareLink}
                  />
                </div>
              ) : null}
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {showGallery ? (
              <Card>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold">{String(galleryCfg?.title || 'גלריות')}</div>
                  <Link href={hrefOf('/gallery')}>
                    <Button variant="ghost">פתח</Button>
                  </Link>
                </div>
                <p className="mt-2 text-sm text-zinc-600">תמונות מהאירוע</p>
                {(() => {
                  const pv = (galleryPreviews as any) || {}
                  const all = Object.values(pv).flat() as any[]
                  const lim = Number((settings as any)?.home_gallery_preview_limit ?? 6) || 6
                  const items = all.slice(0, lim)
                  if (!items.length) return null
                  return (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {items.map((it: any) => {
                        const url = it.thumb_url || it.public_url || it.url
                        if (!url) return null
                        return (
                          <button
                            key={String(it.id || url)}
                            type="button"
                            className="aspect-square overflow-hidden rounded-xl bg-zinc-50"
                            onClick={() => setLightbox({ url: it.url || url, isVideo: false })}
                            aria-label="פתח תמונה"
                          >
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
              </Card>
            ) : null}

            {showBlessings ? (
              <Card>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold">{String(blessingCfg?.title || 'ברכות')}</div>
                  <Link href={hrefOf('/blessings')}>
                    <Button variant="ghost">פתח</Button>
                  </Link>
                </div>
                <p className="mt-2 text-sm text-zinc-600">כתבו ברכה והשאירו מזכרת</p>
              </Card>
            ) : null}

            {showGift ? (
              <Card>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold">{String(giftCfg?.title || 'מתנה')}</div>
                  <Link href={hrefOf('/gift')}>
                    <Button variant="ghost">פתח</Button>
                  </Link>
                </div>
                <p className="mt-2 text-sm text-zinc-600">אפשרות למתנה דיגיטלית</p>
              </Card>
            ) : null}

            <Card>
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold">מנהל</div>
                <Link href="/admin">
                  <Button variant="ghost">פתח</Button>
                </Link>
              </div>
              <p className="mt-2 text-sm text-zinc-600">ניהול תוכן, גלריות, ברכות ושכפול</p>
            </Card>
          </div>

          {showBlessings && (blessingsPreview || []).length ? (
            <Card>
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold">ברכות אחרונות</div>
                <Link href={hrefOf('/blessings')}>
                  <Button variant="ghost">לכל הברכות</Button>
                </Link>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(blessingsPreview || []).slice(0, 6).map((p: any) => (
                  <div key={p.id} className="rounded-2xl border border-zinc-200 p-3">
                    <div className="text-sm font-semibold">{String(p.author_name || '').trim() || 'אורח'}</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{String(p.text || '').trim()}</div>
                    {p.media_url ? (
                      <div className="mt-2">
                        <img
                          src={String(p.media_url)}
                          alt=""
                          className="w-full rounded-2xl object-cover aspect-square"
                          onClick={() => setLightbox({ url: String(p.media_url), isVideo: false })}
                        />
                      </div>
                    ) : null}
                    {p.link_url ? (
                      <div className="mt-2">
                        <HomeLinkThumb url={String(p.link_url)} />
                        <HomeLinkMeta url={String(p.link_url)} showDetails={settings?.link_preview_show_details === true} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {err ? (
            <Card>
              <div className="text-sm text-red-600">{err}</div>
              <div className="mt-3 flex justify-end">
                <Button onClick={load}>נסה שוב</Button>
              </div>
            </Card>
          ) : null}
        </div>
      </Container>

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="max-h-[90vh] w-full max-w-[720px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end gap-2 pb-2">
              <Button variant="ghost" onClick={() => setLightbox(null)}>
                סגור
              </Button>
              <Button variant="ghost" onClick={() => triggerDownload(lightbox.url)}>
                הורד
              </Button>
            </div>
            <img src={lightbox.url} alt="" className="max-h-[80vh] w-full rounded-2xl object-contain bg-black" />
          </div>
        </div>
      ) : null}
    </main>
  )
}
