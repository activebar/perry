'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Container, Card, Button } from '@/components/ui'
import { computeEventPhase } from '@/lib/db'
import HeroRotator from '@/components/hero-rotator'

type HomePayload = {
  ok: boolean
  settings: any
  blocks: any[]
  guestPreview: any[]
  adminPreview: any[]
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

function HomeLinkPreview({ url, sizePx, showDetails }: { url?: string | null; sizePx: number; showDetails?: boolean }) {
  const d = useUnfurl(url || '')
  if (!url) return null
  if (!d) return null

  const img = d.image || youtubeThumb(d.url)

  // בלי תמונה -> מציגים רק "פתח קישור"
  if (!img) {
    return (
      <a
        className="mt-2 inline-block rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
        href={d.url}
        target="_blank"
        rel="noreferrer"
      >
        פתח קישור ({d.site_name || hostOf(d.url)})
      </a>
    )
  }

  // קומפקטי: בלי URL/כותרת ארוכה
  return (
    <a
      href={d.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-3 overflow-hidden rounded-xl border border-zinc-200 bg-white p-2 hover:bg-zinc-50"
    >
      <div className="relative flex-none overflow-hidden rounded-lg bg-zinc-100" style={{ width: sizePx, height: sizePx }}>
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        {showDetails ? (
          <>
            <div className="text-[11px] text-zinc-600">{d.site_name || hostOf(d.url)}</div>
            <div className="mt-1 text-xs text-zinc-500">לחצו לפתיחה</div>
          </>
        ) : null}
      </div>
    </a>
  )
}

export default function HomePage() {
  const [data, setData] = useState<HomePayload | null>(null)
  const [err, setErr] = useState<string | null>(null)

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

  const { settings, blocks, guestPreview, adminPreview, blessingsPreview } = data || ({} as any)

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

  const guestTitle = settings?.guest_gallery_title || 'גלריית אורחים'
  const adminTitle = settings?.admin_gallery_title || 'גלריית מנהל'
  const guestShowAll = settings?.guest_gallery_show_all_button !== false
  const adminShowAll = settings?.admin_gallery_show_all_button !== false

  const blessingsPreviewLimit = Number(settings?.blessings_preview_limit ?? 3)
  const blessingsShowAll = settings?.blessings_show_all_button !== false

  const heroImages = Array.isArray(settings?.hero_images) ? settings.hero_images : []
  const heroSeconds = Number(settings?.hero_rotate_seconds ?? 4)

  const mediaSize = Number(settings?.blessings_media_size ?? 140)

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
                <Button variant="ghost">גלריה</Button>
              </Link>
              <Link href="/blessings">
                <Button variant="ghost">ברכות</Button>
              </Link>
              {showGiftBlock && (
                <Link href="/gift">
                  <Button>מתנה</Button>
                </Link>
              )}
              <Link href="/admin">
                <Button variant="ghost">מנהל</Button>
              </Link>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-4">
          {showHero && (
            <Card dir="rtl">
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
                      <Button variant="ghost">מתנה</Button>
                    </Link>
                  )}
                  {showGalleryBlock && (
                    <Link href="/gallery">
                      <Button variant="ghost">גלריה</Button>
                    </Link>
                  )}
                  {showBlessingsBlock && (
                    <Link href="/blessings">
                      <Button variant="ghost">ברכות</Button>
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          )}

          {showGalleryBlock && (
            <Card dir="rtl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-right">
                  <p className="font-semibold">{guestTitle}</p>
                  <p className="text-sm text-zinc-600">תמונות מהאורחים.</p>
                </div>
                {guestShowAll && (
                  <Link href="/gallery">
                    <Button>לכל התמונות</Button>
                  </Link>
                )}
              </div>

              {Array.isArray(guestPreview) && guestPreview.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {guestPreview.map((it: any) => (
                    <div key={it.id} className="relative aspect-square overflow-hidden rounded-xl bg-zinc-50">
                      <img src={it.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {showGalleryBlock && (
            <Card dir="rtl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-right">
                  <p className="font-semibold">{adminTitle}</p>
                  <p className="text-sm text-zinc-600">תמונות המנהל.</p>
                </div>
                {adminShowAll && (
                  <Link href="/gallery-admin">
                    <Button>לכל התמונות</Button>
                  </Link>
                )}
              </div>

              {Array.isArray(adminPreview) && adminPreview.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {adminPreview.map((it: any) => (
                    <div key={it.id} className="relative aspect-square overflow-hidden rounded-xl bg-zinc-50">
                      <img src={it.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {showBlessingsBlock && (
            <Card dir="rtl">
              <div className="flex items-center justify-between gap-2">
                <div className="text-right">
                  <p className="font-semibold">ברכות</p>
                  <p className="text-sm text-zinc-600">כתבו ברכה, צרפו תמונה/וידאו או קישור.</p>
                </div>
                <div className="flex gap-2">
                  {blessingsShowAll && (
                    <Link href="/blessings">
                      <Button>שלח ברכה</Button>
                    </Link>
                  )}
                </div>
              </div>

              {Array.isArray(blessingsPreview) && blessingsPreview.length > 0 ? (
                <div className="mt-3 grid gap-3">
                  {blessingsPreview.slice(0, Math.max(0, blessingsPreviewLimit)).map((p: any) => (
                    <div key={p.id} className="rounded-2xl border border-zinc-200 p-3" dir="rtl">
                      {/* media centered + text below (mobile-friendly) */}
                      {(p.media_url || p.video_url) && (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            className="relative w-full max-w-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
                            style={{ aspectRatio: '1 / 1' }}
                            onClick={() => window.open((p.video_url || p.media_url) as string, '_blank')}
                            title="פתח מדיה"
                          >
                            <img
                              src={(p.media_url || p.video_url) as string}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          </button>
                        </div>
                      )}

                      <div className={(p.media_url || p.video_url) ? 'mt-3 text-right' : 'text-right'}>
                        <p className="font-medium">{p.author_name || 'אורח/ת'}</p>
                        {p.text && <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{p.text}</p>}
                      </div>

                      <HomeLinkPreview url={p.link_url} sizePx={mediaSize} showDetails={settings?.link_preview_show_details === true} />

                      <div className="mt-2 flex flex-wrap gap-2">
                        {EMOJIS.map(e => {
                          const count = Number(p.reaction_counts?.[e] || 0)
                          const active = Array.isArray(p.my_reactions) && p.my_reactions.includes(e)
                          return (
                            <button
                              key={e}
                              type="button"
                              onClick={() => react(p.id, e)}
                              className={
                                'rounded-full border px-3 py-1 text-sm ' +
                                (active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-700')
                              }
                            >
                              {e} {count > 0 ? count : ''}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-600 text-right">עדיין אין ברכות. תהיו הראשונים 💌</p>
              )}
            </Card>
          )}

          {showGiftBlock && (
            <Card dir="rtl">
              <div className="flex items-center justify-between">
                <div className="text-right">
                  <p className="font-semibold">מתנה</p>
                  <p className="text-sm text-zinc-600">אפשר להשאיר מתנה בלחיצה.</p>
                </div>
                <Link href="/gift">
                  <Button>למתנה</Button>
                </Link>
              </div>
            </Card>
          )}

          {settings?.footer_enabled && (
            <div className="pt-4 text-center text-sm text-zinc-500">
              <a href={settings.footer_url || 'https://www.activebar.co.il'} target="_blank" rel="noreferrer">
                {settings.footer_label || 'Active Bar'}
              </a>
            </div>
          )}
        </div>
      </Container>
    </main>
  )
}
