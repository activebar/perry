// Path: src/components/public/EventHomeClient.tsx
// Version: V24.4
// Updated: 2026-03-19 15:20
// Note: render home gallery video previews with <video> instead of broken <img> thumbnails

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
  guestPreview?: any[]
  adminPreview?: any[]
  blessingsPreview: any[]
  galleryPreviews?: Record<string, any[]>
}

function formatVideoTime(seconds?: number | null) {
  const s = Math.max(0, Math.floor(Number(seconds || 0)))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function VideoBadge({
  src,
  duration,
}: {
  src?: string | null
  duration?: number | null
}) {
  const [seconds, setSeconds] = useState<number | null>(
    typeof duration === 'number' && duration > 0 ? duration : null
  )

  useEffect(() => {
    if (typeof duration === 'number' && duration > 0) {
      setSeconds(duration)
      return
    }
    if (!src) {
      setSeconds(null)
      return
    }

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = src

    const onLoaded = () => {
      const d = Number(video.duration || 0)
      if (Number.isFinite(d) && d > 0) {
        setSeconds(d)
      }
    }

    video.addEventListener('loadedmetadata', onLoaded)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.src = ''
    }
  }, [src, duration])

  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white text-2xl shadow">
          ▶
        </div>
      </div>
      <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-xs font-medium text-white">
        {typeof seconds === 'number' && seconds > 0 ? formatVideoTime(seconds) : 'וידאו'}
      </div>
    </>
  )
}

function objectPositionFromCrop(item: {
  crop_position?: string | null
  crop_focus_x?: number | null
  crop_focus_y?: number | null
}) {
  const x =
    typeof item?.crop_focus_x === 'number'
      ? Math.max(0, Math.min(1, item.crop_focus_x))
      : null

  const y =
    typeof item?.crop_focus_y === 'number'
      ? Math.max(0, Math.min(1, item.crop_focus_y))
      : null

  if (x != null && y != null) {
    return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`
  }

  if (item?.crop_position === 'top') return '50% 12%'
  if (item?.crop_position === 'bottom') return '50% 82%'
  return '50% 50%'
}

function isVideoItem(item: any) {
  const kind = String(item?.kind || '').toLowerCase()
  const url = String(item?.url || '')
  const thumb = String(item?.thumb_url || '')

  return (
    kind.includes('video') ||
    /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) ||
    /\.(mp4|mov|webm|m4v)(\?|$)/i.test(thumb)
  )
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
          body: JSON.stringify({ url: u }),
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

function HomeLinkThumb({ url }: { url?: string | null; sizePx: number }) {
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

function HomeLinkMeta({
  url,
  showDetails = false,
}: {
  url?: string | null
  showDetails?: boolean
}) {
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

  const base = eventId ? `/${encodeURIComponent(eventId)}` : ''
  const hrefOf = (p: string) => `${base}${p.startsWith('/') ? p : `/${p}`}`
  const [data, setData] = useState<HomePayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; isVideo: boolean } | null>(null)

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
        cache: 'no-store',
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
  }, [])

  const { settings, blocks, blessingsPreview } = data || ({} as any)

  const phase = useMemo(() => {
    if (!settings?.start_at) return 'pre'
    return computeEventPhase(settings.start_at)
  }, [settings?.start_at])

  const visibleTypes = useMemo(() => {
    const s = settings || {}
    const now = new Date()
    return new Set(
      (blocks || [])
        .filter((b: any) => {
          if (!b?.is_visible) return false
          if (b.type === 'gift' && b.config?.auto_hide_after_hours) {
            const hours = Number(b.config.auto_hide_after_hours)
            if (Number.isFinite(hours) && hours > 0) {
              const start = new Date(s.start_at)
              const hideAt = new Date(start.getTime() + hours * 60 * 60 * 1000)
              if (now > hideAt) return false
            }
          }
          return true
        })
        .map((b: any) => b.type)
    )
  }, [blocks, settings])

  const showMenu = visibleTypes.has('menu')
  const showGalleryBlock = Array.from(visibleTypes).some((t) => t === 'gallery' || (typeof t === 'string' && t.startsWith('gallery')))
  const showBlessingsBlock = visibleTypes.has('blessings')
  const showGiftBlock = visibleTypes.has('gift')

  const orderedBlocks = useMemo(() => {
    return (blocks || [])
      .slice()
      .sort((a: any, b: any) => Number(a?.order_index || 0) - Number(b?.order_index || 0))
  }, [blocks])

  const galleryLabel = useMemo(() => {
    const b = (blocks || []).find((x: any) => String(x?.type) === 'gallery')
    const t = String(b?.config?.title || '').trim()
    return t || 'גלריה'
  }, [blocks])

  const giftLabel = useMemo(() => {
    const b = (blocks || []).find((x: any) => String(x?.type) === 'gift')
    const t = String(b?.config?.title || '').trim()
    return t || 'מתנה'
  }, [blocks])

  const blessingsTitle = (settings?.blessings_title || settings?.blessings_label || 'ברכות') as string
  const blessingsSubtitle = (settings?.blessings_subtitle || 'כתבו ברכה, צרפו תמונה/וידאו או קישור.') as string
  const blessingsAllLabel = String(settings?.blessings_show_all_label || `לכל ה${blessingsTitle}`)

  const heroImages = Array.isArray(settings?.hero_images) ? settings.hero_images : []
  const heroSeconds = Number(settings?.hero_rotate_seconds ?? 4)

  const mediaSize = Number(settings?.blessings_media_size ?? 140)
  const linkPreviewEnabled = settings?.link_preview_enabled === true
  const linkPreviewShowDetails = settings?.link_preview_show_details === true

  const heroPre =
    settings?.hero_pre_text ||
    `מחכים לכם באירוע 🎉\n${settings?.location_text || ''}`.trim()

  const heroLive =
    settings?.hero_live_text ||
    'האירוע התחיל! 📸\nהעלו תמונות, כתבו ברכות, ותעשו שמח.'.trim()

  const heroPost =
    settings?.hero_post_text ||
    (settings?.thank_you_text || 'תודה שבאתם ❤️ נשמח שתמשיכו להעלות תמונות וברכות למזכרת.')

  const heroText = phase === 'pre' ? heroPre : phase === 'live' ? heroLive : heroPost

  async function react(postId: string, emoji: string) {
    const currentPost = (data?.blessingsPreview || []).find((p: any) => p.id === postId)
    const currentSelected = (currentPost?.my_reactions || [])[0] || null
    const isSame = currentSelected === emoji

    setData((prev) => {
      if (!prev) return prev

      const nextBlessings = (prev.blessingsPreview || []).map((p: any) => {
        if (p.id !== postId) return p

        const nextCounts = { ...(p.reaction_counts || {}) }

        if (currentSelected && nextCounts[currentSelected]) {
          nextCounts[currentSelected] = Math.max(0, Number(nextCounts[currentSelected]) - 1)
          if (nextCounts[currentSelected] <= 0) delete nextCounts[currentSelected]
        }

        let nextMy: string[] = []
        if (!isSame) {
          nextCounts[emoji] = Number(nextCounts[emoji] || 0) + 1
          nextMy = [emoji]
        }

        return {
          ...p,
          reaction_counts: nextCounts,
          my_reactions: nextMy,
        }
      })

      return {
        ...prev,
        blessingsPreview: nextBlessings,
      }
    })

    try {
      const res = await fetch(`/api/reactions/toggle?event=${encodeURIComponent(eventId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post_id: postId, emoji }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Request failed')

      setData((prev) => {
        if (!prev) return prev

        const nextBlessings = (prev.blessingsPreview || []).map((p: any) =>
          p.id === postId
            ? {
                ...p,
                reaction_counts: json.counts || {},
                my_reactions: json.selected_emoji ? [json.selected_emoji] : [],
              }
            : p
        )

        return {
          ...prev,
          blessingsPreview: nextBlessings,
        }
      })
    } catch {
      try {
        const res = await fetch(
          `/api/public/home?event=${encodeURIComponent(eventId)}&ts=${Date.now()}`,
          { cache: 'no-store' }
        )
        const json = await res.json().catch(() => ({}))
        if (res.ok) setData(json)
      } catch {}
    }
  }

  const [shareOpen, setShareOpen] = useState(false)
  const [sharePayload, setSharePayload] = useState<{ message: string; link: string } | null>(null)

  const shareEnabled = settings?.share_enabled !== false
  const shareUsePermalink = settings?.share_use_permalink !== false
  const shareWhatsappEnabled = settings?.share_whatsapp_enabled !== false
  const shareWebshareEnabled = settings?.share_webshare_enabled !== false

  function buildLinkForPost(postId?: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const baseUrl = origin ? `${origin}${base}` : base
    const blessings = `${baseUrl}/blessings`
    if (postId && shareUsePermalink) {
      const code = String(postId).split('-')[0]
      return `/bl/${code}`
    }
    return blessings
  }

  async function shareBlessing(p: any) {
    if (!shareEnabled) return
    const link = buildLinkForPost(p?.id)
    const eventName = String(settings?.event_name || 'Event')
    const template = settings?.share_message_template || null
    const noTextFallback = String(settings?.share_no_text_fallback || 'נשלחה ברכה מהממת 💙')
    const message = buildShareMessage(
      template,
      {
        EVENT_NAME: eventName,
        AUTHOR_NAME: p?.author_name || '',
        TEXT: p?.text || '',
        LINK: link,
        DATE: p?.created_at || '',
      },
      noTextFallback
    )

    const canNative = shareWebshareEnabled && typeof navigator !== 'undefined' && (navigator as any).share
    if (canNative) {
      try {
        const textOnly = message.split(link).join('').trim() || message
        await (navigator as any).share({ title: eventName, text: textOnly, url: link })
        return
      } catch {}
    }

    setSharePayload({ message, link })
    setShareOpen(true)
  }

  if (!data) {
    return (
      <main>
        <Container>
          <Card dir="rtl">
            <div className="text-right">
              <p className="font-semibold">טוען…</p>
              {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            </div>
          </Card>
        </Container>
      </main>
    )
  }

  return (
    <main>
      <Container>
        <div className="flex items-center justify-between gap-3" dir="rtl">
          <div className="text-right">
            <h1 className="text-2xl font-bold">{settings?.event_name}</h1>
            {settings?.start_at && <p className="text-sm text-zinc-600">{fmt(settings.start_at)}</p>}
          </div>

          {showMenu && (
            <div className="flex gap-2">
              <Link href={hrefOf('/gallery')}>
                <Button variant="ghost">{galleryLabel}</Button>
              </Link>
              <Link href={hrefOf('/blessings')}>
                <Button variant="ghost">{blessingsTitle}</Button>
              </Link>
              {showGiftBlock && (
                <Link href={hrefOf('/gift')}>
                  <Button>{giftLabel}</Button>
                </Link>
              )}
              <Link href="/admin">
                <Button variant="ghost">מנהל</Button>
              </Link>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-4">
          {orderedBlocks
            .filter((b: any) => !!b?.is_visible && String(b?.type) !== 'menu')
            .map((b: any) => {
              const type = String(b?.type || '')

              if (type === 'hero') {
                return (
                  <Card key={b.id} dir="rtl">
                    <div className="space-y-3 text-right">
                      {heroImages.length > 0 && <HeroRotator images={heroImages} seconds={heroSeconds} />}
                      <div className="whitespace-pre-wrap text-sm text-zinc-700">{heroText}</div>

                      <div className="flex flex-wrap gap-2">
                        {settings?.waze_url && (
                          <a href={settings.waze_url} target="_blank" rel="noreferrer">
                            <Button>Waze</Button>
                          </a>
                        )}
                        {showGiftBlock && (
                          <Link href={hrefOf('/gift')}>
                            <Button variant="ghost">{giftLabel}</Button>
                          </Link>
                        )}
                        {showGalleryBlock && (
                          <Link href={hrefOf('/gallery')}>
                            <Button variant="ghost">{galleryLabel}</Button>
                          </Link>
                        )}
                        {showBlessingsBlock && (
                          <Link href={hrefOf('/blessings')}>
                            <Button variant="ghost">{blessingsTitle}</Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              }

              if (type === 'gallery' || type.startsWith('gallery_')) {
                const cfg = (b as any)?.config || {}
                const galleryId = String(cfg.gallery_id || cfg.galleryId || b.id)
                const title = String(cfg.title || b.title || cfg.label || cfg.name || b.type || 'גלריה')
                const subtitle = String(cfg.subtitle || cfg.description || 'תמונות מהאירוע.')
                const buttonLabel = String(cfg.button_label || 'לכל התמונות')

                const previews: any[] = (data as any)?.galleryPreviews?.[galleryId] || []

                return (
                  <Card
                    key={b.id}
                    dir="rtl"
                    className="cursor-pointer"
                    onClick={() => router.push(hrefOf(`/gallery/${encodeURIComponent(galleryId)}`))}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-right">
                        <p className="font-semibold">{title}</p>
                        <p className="text-sm text-zinc-600">{subtitle}</p>
                      </div>
                      <Link href={hrefOf(`/gallery/${encodeURIComponent(galleryId)}`)}>
                        <Button>{buttonLabel}</Button>
                      </Link>
                    </div>

                    {previews.length === 0 ? (
                      <div className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-600">אין תמונות עדיין.</div>
                    ) : (
                      <div
                        className="mt-3 grid gap-2"
                        style={{
                          gridTemplateColumns: `repeat(${Math.max(1, Number(settings?.home_gallery_preview_cols || 3))}, minmax(0, 1fr))`,
                        }}
                      >
                        {previews
                          .slice(0, Math.max(1, Number(settings?.home_gallery_preview_limit || 6)))
                          .map((it: any) => {
                            const video = isVideoItem(it)
                            const imageUrl = String(it?.thumb_url || it?.url || '')
                            const videoUrl = String(it?.url || '')

                            return (
                              <div
                                key={String(it.id)}
                                className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-200"
                              >
                                {video ? (
                                  <>
                                    <video
                                      src={videoUrl}
                                      className="absolute inset-0 h-full w-full object-cover"
                                      style={{ objectPosition: objectPositionFromCrop(it) }}
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                    <VideoBadge
                                      src={videoUrl}
                                      duration={(it as any).video_duration_sec ?? (it as any).duration_sec ?? 0}
                                    />
                                  </>
                                ) : imageUrl ? (
                                  <img
                                    src={imageUrl}
                                    alt=""
                                    className="absolute inset-0 h-full w-full object-cover"
                                    style={{ objectPosition: objectPositionFromCrop(it) }}
                                  />
                                ) : null}
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </Card>
                )
              }

              if (type === 'blessings') {
                return (
                  <Card key={b.id} dir="rtl">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-right">
                        <p className="font-semibold">{blessingsTitle}</p>
                        <p className="text-sm text-zinc-600">{blessingsSubtitle}</p>
                      </div>
                      <Link href={hrefOf('/blessings')}>
                        <Button>{blessingsAllLabel}</Button>
                      </Link>
                    </div>

                    {Array.isArray(blessingsPreview) && blessingsPreview.length > 0 ? (
                      <div className="mt-3 space-y-3">
                        {blessingsPreview.map((p: any) => (
                          <div key={p.id} className="rounded-2xl bg-zinc-50 p-3">
                            <div dir="rtl" className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1 text-right">
                                  <div className="truncate text-sm font-semibold">{p.author_name || 'אנונימי'}</div>
                                </div>
                              </div>

                              {!p.media_url && linkPreviewEnabled && p.link_url ? (
                                <div className="text-right">
                                  <HomeLinkThumb url={p.link_url} sizePx={Math.max(120, Math.min(220, mediaSize))} />
                                  {linkPreviewShowDetails ? <HomeLinkMeta url={p.link_url} /> : null}
                                </div>
                              ) : null}

                              {(p.video_url || p.media_url) ? (
                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    className="relative overflow-hidden rounded-2xl bg-zinc-200"
                                    style={{
                                      width: Math.max(120, Math.min(260, mediaSize)),
                                      height: Math.max(120, Math.min(260, mediaSize)),
                                    }}
                                    onClick={() => setLightbox({ url: (p.video_url || p.media_url) as string, isVideo: !!p.video_url })}
                                  >
                                    {p.video_url ? (
                                      <>
                                        <video
                                          src={p.video_url}
                                          className="absolute inset-0 h-full w-full object-cover"
                                          style={{ objectPosition: objectPositionFromCrop(p) }}
                                          muted
                                          playsInline
                                          preload="metadata"
                                        />
                                        <VideoBadge src={p.video_url} duration={(p as any).video_duration_sec ?? (p as any).duration_sec ?? 0} />
                                      </>
                                    ) : (
                                      <img
                                        src={p.media_url as string}
                                        alt=""
                                        className="absolute inset-0 h-full w-full object-cover"
                                        style={{ objectPosition: objectPositionFromCrop(p) }}
                                      />
                                    )}
                                  </button>
                                </div>
                              ) : null}

                              {p.text ? <div className="whitespace-pre-wrap text-right text-sm text-zinc-700">{p.text}</div> : null}

                              {p.media_url && linkPreviewEnabled && p.link_url ? (
                                <div className="text-right">
                                  <HomeLinkThumb url={p.link_url} sizePx={Math.max(120, Math.min(220, mediaSize))} />
                                  {linkPreviewShowDetails ? <HomeLinkMeta url={p.link_url} /> : null}
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-2 space-y-2">
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                {EMOJIS.map((e) => (
                                  <button
                                    key={e}
                                    type="button"
                                    className={`rounded-full border px-3 py-1 text-sm whitespace-nowrap ${
                                      (p.my_reactions || []).includes(e) ? 'bg-black text-white' : 'bg-white'
                                    }`}
                                    onClick={() => react(p.id, e)}
                                  >
                                    {e} {Number((p.reaction_counts || {})[e] || 0)}
                                  </button>
                                ))}
                              </div>

                              <div dir="rtl" className="flex items-center justify-between gap-2">
                                {shareEnabled ? (
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-full border px-3 py-1 text-sm bg-white"
                                    onClick={() => shareBlessing(p)}
                                    aria-label="שתף"
                                    title="שתף"
                                  >
                                    🔗
                                  </button>
                                ) : (
                                  <span className="w-10" />
                                )}

                                <Link href={hrefOf('/blessings')} className="flex-1">
                                  <Button variant="ghost" className="w-full">
                                    כתוב ברכה
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-right text-sm text-zinc-600">עדיין אין ברכות. תהיו הראשונים 😊</div>
                    )}
                  </Card>
                )
              }

              if (type === 'gift') {
                return (
                  <Card key={b.id} dir="rtl" className="cursor-pointer" onClick={() => router.push(hrefOf('/gift'))}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-right">
                        <p className="font-semibold">{giftLabel}</p>
                        <p className="text-sm text-zinc-600">לתרומה/מתנה באהבה.</p>
                      </div>
                      <Link href={hrefOf('/gift')}>
                        <Button>{giftLabel}</Button>
                      </Link>
                    </div>
                  </Card>
                )
              }

              return null
            })}
        </div>

        {lightbox && (
          <div className="fixed inset-0 z-50 bg-black/80 p-4" onClick={() => setLightbox(null)}>
            <div className="mx-auto flex h-full max-w-5xl items-center justify-center">
              <div className="w-full" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  {!lightbox.isVideo && (
                    <Button
                      variant="ghost"
                      className="bg-white/90 text-black shadow hover:bg-white"
                      onClick={() => triggerDownload(lightbox.url)}
                      type="button"
                    >
                      הורד תמונה
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="bg-white/90 text-black shadow hover:bg-white"
                    onClick={() => setLightbox(null)}
                    type="button"
                  >
                    סגור
                  </Button>
                </div>
                <div className="w-full overflow-hidden rounded-2xl bg-black">
                  {lightbox.isVideo ? (
                    <video
                      src={lightbox.url}
                      controls
                      autoPlay
                      playsInline
                      className="max-h-[85vh] w-full object-contain"
                    />
                  ) : (
                    <img src={lightbox.url} alt="" className="max-h-[85vh] w-full object-contain" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {sharePayload && (
          <ShareModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            title={String(settings?.share_modal_title || 'שיתוף')}
            message={sharePayload.message}
            link={sharePayload.link}
            whatsappEnabled={shareWhatsappEnabled}
            whatsappLabel={String(settings?.share_whatsapp_button_label || 'שתף בוואטסאפ')}
            copyLabel={String(settings?.qr_btn_copy_label || 'העתק קישור')}
          />
        )}
      </Container>
    </main>
  )
      }
