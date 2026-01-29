'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Button, Card, Container } from '@/components/ui'
import HeroRotator from '@/components/hero-rotator'

type HomePayload = {
  ok: boolean
  now: string
  phase: 'pre' | 'live' | 'post'
  settings: any
  blocks: any[]
  guestPreview: any[]
  adminPreview: any[]
}

function fmt(dt: string) {
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

async function getHome(): Promise<HomePayload> {
  const res = await fetch('/api/public/home', { cache: 'no-store' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'Failed')
  return json as any
}

export default function HomePage() {
  const searchParams = useSearchParams()
  const debug = searchParams.get('debug') === '1'

  const [data, setData] = useState<HomePayload | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const d = await getHome()
        if (alive) setData(d)
      } catch (e: any) {
        if (alive) setErr(e?.message || 'שגיאה')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const computed = useMemo(() => {
    if (!data) return null
    const settings = data.settings || {}
    const blocks = data.blocks || []
    const now = new Date(data.now)

    const visibleTypes = new Set(
      (blocks || [])
        .filter((b: any) => {
          if (!b?.is_visible) return false

          // auto-hide ל-gift
          if (b.type === 'gift' && b.config?.auto_hide_after_hours) {
            const hours = Number(b.config.auto_hide_after_hours)
            if (Number.isFinite(hours) && hours > 0) {
              const start = new Date(settings.start_at)
              const hideAt = new Date(start.getTime() + hours * 60 * 60 * 1000)
              if (now > hideAt) return false
            }
          }

          return true
        })
        .map((b: any) => b.type)
    )

    const showHero = visibleTypes.has('hero')
    const showMenu = visibleTypes.has('menu')
    const showGalleryBlock = visibleTypes.has('gallery')
    const showBlessingsBlock = visibleTypes.has('blessings')
    const showGiftBlock = visibleTypes.has('gift')

    const guestTitle = settings.guest_gallery_title || 'גלריית אורחים'
    const adminTitle = settings.admin_gallery_title || 'גלריית מנהל'
    const guestShowAll = settings.guest_gallery_show_all_button !== false
    const adminShowAll = settings.admin_gallery_show_all_button !== false

    const heroPre = settings.hero_pre_text || `מחכים לכם באירוע 🎉\n${settings.location_text || ''}`.trim()
    const heroLive = settings.hero_live_text || 'האירוע התחיל! 📸\nהעלו תמונות, כתבו ברכה, ותנו אהבה.'.trim()
    const heroPost = settings.hero_post_text || (settings.thank_you_text || 'תודה שהייתם איתנו ❤️ אפשר להמשיך להעלות תמונות וברכות למזכרת.')
    const heroText = data.phase === 'pre' ? heroPre : data.phase === 'live' ? heroLive : heroPost

    const heroImages = Array.isArray(settings.hero_images) ? settings.hero_images : []
    const heroSeconds = Number(settings.hero_rotate_seconds ?? 4)

    return {
      settings,
      showHero,
      showMenu,
      showGalleryBlock,
      showBlessingsBlock,
      showGiftBlock,
      guestTitle,
      adminTitle,
      guestShowAll,
      adminShowAll,
      heroText,
      heroImages,
      heroSeconds,
    }
  }, [data])

  if (err) {
    return (
      <main>
        <Container>
          <Card>
            <p className="text-right text-sm text-red-600">{err}</p>
          </Card>
        </Container>
      </main>
    )
  }

  if (!data || !computed) {
    return (
      <main>
        <Container>
          <Card>
            <p className="text-right text-sm text-zinc-600">טוען...</p>
          </Card>
        </Container>
      </main>
    )
  }

  const { settings } = computed

  return (
    <main>
      <Container>
        <div className="flex items-center justify-between gap-3">
          <div className="text-right">
            <h1 className="text-2xl font-bold">{settings.event_name}</h1>
            <p className="text-sm text-zinc-600">{fmt(settings.start_at)}</p>
          </div>

          {computed.showMenu && (
            <div className="flex gap-2">
              <Link href="/gallery"><Button variant="ghost">גלריה</Button></Link>
              <Link href="/blessings"><Button variant="ghost">ברכות</Button></Link>
              {computed.showGiftBlock && <Link href="/gift"><Button>מתנה</Button></Link>}
            </div>
          )}
        </div>

        {debug && (
          <div className="mt-2 text-right text-[11px] text-zinc-500">
            <div>phase: {data.phase}</div>
            <div>now: {data.now}</div>
            <div>start_at: {settings.start_at}</div>
            <div>updated_at: {settings.updated_at || '—'}</div>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {/* HERO */}
          {computed.showHero && (
            <Card>
              <div className="space-y-3 text-right">
                {computed.heroImages.length > 0 && (
                  <HeroRotator images={computed.heroImages} seconds={computed.heroSeconds} />
                )}

                <div className="whitespace-pre-wrap text-sm text-zinc-700">{computed.heroText}</div>

                {/* CTA לפי מצב */}
                {data.phase === 'pre' && (
                  <div className="flex flex-wrap gap-2">
                    {settings.waze_url && (
                      <a href={settings.waze_url} target="_blank" rel="noreferrer">
                        <Button>Waze</Button>
                      </a>
                    )}
                    {computed.showGiftBlock && <Link href="/gift"><Button>מתנה</Button></Link>}
                    {computed.showGalleryBlock && <Link href="/gallery"><Button variant="ghost">לגלריה</Button></Link>}
                    {computed.showBlessingsBlock && <Link href="/blessings"><Button variant="ghost">לברכות</Button></Link>}
                  </div>
                )}

                {data.phase === 'live' && (
                  <div className="flex flex-wrap gap-2">
                    {computed.showGalleryBlock && <Link href="/gallery"><Button>העלאת תמונה</Button></Link>}
                    {computed.showBlessingsBlock && <Link href="/blessings"><Button variant="ghost">כתיבת ברכה</Button></Link>}
                    {computed.showGiftBlock && <Link href="/gift"><Button variant="ghost">מתנה</Button></Link>}
                  </div>
                )}

                {data.phase === 'post' && (
                  <div className="flex flex-wrap gap-2">
                    {computed.showGalleryBlock && <Link href="/gallery"><Button>לגלריה</Button></Link>}
                    {computed.showBlessingsBlock && <Link href="/blessings"><Button variant="ghost">לברכות</Button></Link>}
                    {computed.showGiftBlock && <Link href="/gift"><Button variant="ghost">מתנה</Button></Link>}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* גלריות (אורחים + מנהל) */}
          {computed.showGalleryBlock && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-right">
                  <p className="font-semibold">{computed.guestTitle}</p>
                  <p className="text-sm text-zinc-600">תמונות מהאורחים.</p>
                </div>

                {computed.guestShowAll && (
                  <Link href="/gallery"><Button>לכל התמונות</Button></Link>
                )}
              </div>

              {data.guestPreview.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {data.guestPreview.map((it: any) => (
                    <div key={it.id} className="relative aspect-square overflow-hidden rounded-xl bg-zinc-50">
                      <img src={it.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {computed.showGalleryBlock && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-right">
                  <p className="font-semibold">{computed.adminTitle}</p>
                  <p className="text-sm text-zinc-600">תמונות שמנהלים העלו.</p>
                </div>

                {computed.adminShowAll && (
                  <Link href="/gallery-admin"><Button>לכל התמונות</Button></Link>
                )}
              </div>

              {data.adminPreview.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {data.adminPreview.map((it: any) => (
                    <div key={it.id} className="relative aspect-square overflow-hidden rounded-xl bg-zinc-50">
                      <img src={it.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ברכות */}
          {computed.showBlessingsBlock && (
            <Card>
              <div className="flex items-center justify-between">
                <div className="text-right">
                  <p className="font-semibold">ברכות</p>
                  <p className="text-sm text-zinc-600">כתבו ברכה מרגשת.</p>
                </div>
                <Link href="/blessings"><Button variant="ghost">לברכות</Button></Link>
              </div>
            </Card>
          )}

          {/* מתנה */}
          {computed.showGiftBlock && (
            <Card>
              <div className="flex items-center justify-between">
                <div className="text-right">
                  <p className="font-semibold">תשלום / מתנה</p>
                  <p className="text-sm text-zinc-600">בקליק עוברים לעמוד המתנה.</p>
                </div>
                <Link href="/gift"><Button>למתנה</Button></Link>
              </div>
            </Card>
          )}

          {settings.footer_enabled && (
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
