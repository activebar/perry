'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Container, Card, Button } from '@/components/ui'
import { computeEventPhase } from '@/lib/db'
import HeroRotator from '@/components/hero-rotator'
import ShareModal from '@/components/share/ShareModal'
import { buildShareMessage } from '@/lib/share/buildShareMessage'

type HomePayload = {
  ok: boolean
  settings: any
  blocks: any[]
  galleries?: any[]
  galleryBlocksPreview?: Array<{ block_id: string; gallery_id: string | null; title: string; items: any[] }>
  blessingsPreview: any[]
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

function HomeLinkThumb({ url, sizePx }: { url?: string | null; sizePx: number }) {
  const d = useUnfurl(url || undefined)
  if (!url) return null
  if (!d) return null
  const img = d.image || youtubeThumb(d.url)
  if (!img) return null
  return (
    <a href={d.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-zinc-50" style={{ width: sizePx, height: sizePx }} aria-label="פתח קישור">
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

export default function HomePage() {
  const [data, setData] = useState<HomePayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ id?: string; url: string; isVideo: boolean } | null>(null)

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

  async function triggerShareFromLightbox() {
    if (!lightbox) return
    const origin = window.location.origin
    const eventName = String(settings?.event_name || '')

    // If we have an id (gallery media item), share an OG-friendly page for WhatsApp.
    const mediaId = String(lightbox.id || '').trim()
    let link = ''
    if (mediaId) {
      const code = mediaId.slice(0, 8)
      const targetPath = `/gallery/p/${mediaId}`
      try {
        await fetch('/api/short-links', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'gl', post_id: mediaId, code, target_path: targetPath })
        })
      } catch {}
      link = `${origin}/gl/${code}`
    } else {
      link = lightbox.url
    }

    const message = buildShareMessage(
      (settings as any)?.share_template,
      { EVENT_NAME: eventName, TEXT: 'תמונה מהאירוע', LINK: link },
      'תמונה מהאירוע'
    )

    setSharePayload({ message, link })
    setShareOpen(true)
  }

  async function load() {
    setErr(null)
    try {
      const res = await fetch(`/api/public/home?ts=${Date.now()}`, { cache: 'no-store' })
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

  const { settings, blocks, galleries, galleryBlocksPreview, blessingsPreview } = data || ({} as any)

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

  const showHero = visibleTypes.has('hero')
  const showMenu = visibleTypes.has('menu')
  const showGalleryBlock = visibleTypes.has('gallery')
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

  const guestTitle = settings?.guest_gallery_title || 'גלריית אורחים'
  const adminTitle = settings?.admin_gallery_title || 'גלריית מנהל'
  const guestShowAll = settings?.guest_gallery_show_all_button !== false
  const adminShowAll = settings?.admin_gallery_show_all_button !== false

  const blessingsPreviewLimit = Number(settings?.blessings_preview_limit ?? 3)
  const blessingsShowAll = settings?.blessings_show_all_button !== false

  // Blessings labels (dynamic for white-label reuse)
  const blessingsTitle = (settings?.blessings_title || settings?.blessings_label || 'ברכות') as string
  const blessingsSubtitle = (settings?.blessings_subtitle || 'כתבו ברכה, צרפו תמונה/וידאו או קישור.') as string

  const heroImages = Array.isArray(settings?.hero_images) ? settings.hero_images : []
  const heroSeconds = Number(settings?.hero_rotate_seconds ?? 4)

  const mediaSize = Number(settings?.blessings_media_size ?? 140)
  // Link preview is controlled via event_settings (global)
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
    try {
      const res = await fetch('/api/reactions/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post_id: postId, emoji })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Request failed')

      setData(prev => {
        if (!prev) return prev
        const upd = (arr: any[]) =>
          (arr || []).map(p => (p.id === postId ? { ...p, reaction_counts: json.counts, my_reactions: json.my } : p))
        return { ...prev, blessingsPreview: upd(prev.blessingsPreview) }
      })
    } catch {}
  }

  // Share (Home blessings preview)
  const [shareOpen, setShareOpen] = useState(false)
  const [sharePayload, setSharePayload] = useState<{ message: string; link: string } | null>(null)

  const shareEnabled = settings?.share_enabled !== false
  const shareUsePermalink = settings?.share_use_permalink !== false
  const shareWhatsappEnabled = settings?.share_whatsapp_enabled !== false
  const shareWebshareEnabled = settings?.share_webshare_enabled !== false

  function buildLinkForPost(postId?: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const base = origin ? `${origin}` : ''
    const blessings = `${base}/blessings`
    if (postId && shareUsePermalink) {
      const code = String(postId).split('-')[0]
      return `${base}/bl/${code}`
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
        DATE: p?.created_at || ''
      },
      noTextFallback
    )

    const canNative = shareWebshareEnabled && typeof navigator !== 'undefined' && (navigator as any).share
    if (canNative) {
      try {
        // Pass URL separately so WhatsApp/Facebook can generate a rich preview,
        // while keeping the text clean (no duplicated links).
        const textOnly = message.split(link).join('').trim() || message
        await (navigator as any).share({ title: eventName, text: textOnly, url: link })
        return
      } catch {
        // fall back
      }
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
              <Link href="/gallery">
                <Button variant="ghost">{galleryLabel}</Button>
              </Link>
              <Link href="/blessings">
                <Button variant="ghost">{blessingsTitle}</Button>
              </Link>
              {showGiftBlock && (
                <Link href="/gift">
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
                          <Link href="/gift">
                            <Button variant="ghost">{giftLabel}</Button>
                          </Link>
                        )}
                        {showGalleryBlock && (
                          <Link href="/gallery">
                            <Button variant="ghost">{galleryLabel}</Button>
                          </Link>
                        )}
                        {showBlessingsBlock && (
                          <Link href="/blessings">
                            <Button variant="ghost">{blessingsTitle}</Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              }

              if (type === 'gallery') {
                const blockData = (galleryBlocksPreview || []).find((x: any) => String(x.block_id) === String(b.id))
                const title = String(blockData?.title || b?.config?.title || 'גלריה')
                const items = Array.isArray(blockData?.items) ? blockData.items : []

                return (
                  <Card key={b.id} dir="rtl">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-right">
                        <p className="font-semibold">{title}</p>
                        <p className="text-sm text-zinc-600">תמונות מהאירוע.</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/public/home?ts=${Date.now()}`, { cache: 'no-store' as any })
                              const j = await res.json().catch(() => ({}))
                              if (j?.ok) setData(j)
                            } catch {}
                          }}
                        >
                          רענן
                        </Button>
                        <Link href="/gallery">
                          <Button>לכל התמונות</Button>
                        </Link>
                      </div>
                    </div>

                    {items.length > 0 ? (
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {items.map((it: any) => {
                          const url = String(it.public_url || '')
                          const mime = String(it.mime_type || '')
                          const isVideo = mime.startsWith('video/')
                          return (
                            <button
                              key={it.id}
                              type="button"
                              className="relative aspect-square overflow-hidden rounded-xl bg-zinc-50"
                              onClick={() => setLightbox({ id: String(it.id), url, isVideo })}
                            >
                              {isVideo ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-3xl">▶️</span>
                                </div>
                              ) : (
                                <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 text-right text-sm text-zinc-600">עדיין אין תמונות.</div>
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
                        <p className="text-sm text-zinc-600">כתבו ברכה, צרפו תמונה ותנו ריאקשן.</p>
                      </div>
                      <Link href="/blessings">
                        <Button>לכל הברכות</Button>
                      </Link>
                    </div>

                    {Array.isArray(blessingsPreview) && blessingsPreview.length > 0 ? (
                      <div className="mt-3 space-y-3">
                        {blessingsPreview.map((p: any) => (
                          <div key={p.id} className="rounded-2xl bg-zinc-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 text-right">
                                <div className="text-sm font-semibold">{p.author_name || 'אנונימי'}</div>
                                {p.text ? <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{p.text}</div> : null}
                                {p.link_url ? (
                                  <div className="mt-2">
                                    <HomeLinkThumb url={p.link_url} sizePx={120} />
                                    <HomeLinkMeta url={p.link_url} />
                                  </div>
                                ) : null}
                              </div>

                              {p.media_url ? (
                                <button
                                  type="button"
                                  className="relative h-20 w-20 flex-none overflow-hidden rounded-2xl bg-zinc-200"
                                  onClick={() => setLightbox({ url: p.media_url, isVideo: false })}
                                >
                                  <img src={p.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                                </button>
                              ) : null}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-2">
                                {EMOJIS.map(e => (
                                  <button
                                    key={e}
                                    type="button"
                                    className={`rounded-full border px-3 py-1 text-sm ${
                                      (p.my_reactions || []).includes(e) ? 'bg-black text-white' : 'bg-white'
                                    }`}
                                    onClick={async () => {
                                      try {
                                        const res = await fetch('/api/reactions', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ post_id: p.id, emoji: e })
                                        })
                                        if (!res.ok) return
                                        const j = await res.json().catch(() => ({}))
                                        if (!j?.ok) return
                                        // update counts locally (simple)
                                        setData(prev => {
                                          if (!prev) return prev
                                          const next = { ...prev }
                                          next.blessingsPreview = (next.blessingsPreview || []).map((x: any) => {
                                            if (x.id !== p.id) return x
                                            return j.post
                                          })
                                          return next
                                        })
                                      } catch {}
                                    }}
                                  >
                                    {e} {Number(p.reaction_counts?.[e] || 0)}
                                  </button>
                                ))}
                              </div>

                              <Link href="/blessings">
                                <Button variant="ghost">כתוב ברכה</Button>
                              </Link>
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
                  <Card key={b.id} dir="rtl">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-right">
                        <p className="font-semibold">{giftLabel}</p>
                        <p className="text-sm text-zinc-600">לתרומה/מתנה באהבה.</p>
                      </div>
                      <Link href="/gift">
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="bg-white/90 text-black shadow hover:bg-white"
              onClick={triggerShareFromLightbox}
              type="button"
            >
              שתף
            </Button>
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
          </div>
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