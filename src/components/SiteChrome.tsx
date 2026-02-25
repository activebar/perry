'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function NavButton({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={[
        'rounded-full px-4 py-2 text-sm transition',
        active ? 'bg-black text-white' : 'bg-white text-zinc-900 hover:bg-zinc-100',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

/**
 * SiteChrome wraps public pages with a sticky header + optional footer.
 *
 * IMPORTANT:
 * This project supports both:
 *  - root pages (/) e.g. "demo" landing (no event prefix)
 *  - event-scoped pages (/<event>/...) where <event> is the first path segment
 *
 * Therefore, all nav links must be built relative to the current event base path.
 */
export default function SiteChrome({
  children,
  eventName,
  footerEnabled,
  footerLabel,
  footerUrl,
  footerLine2Enabled,
  footerLine2Label,
  footerLine2Url,
  showGiftNavButton,
  giftNavLabel,
}: {
  children: React.ReactNode
  eventName?: string
  footerEnabled?: boolean
  footerLabel?: string | null
  footerUrl?: string | null
  footerLine2Enabled?: boolean
  footerLine2Label?: string | null
  footerLine2Url?: string | null
  showGiftNavButton?: boolean
  giftNavLabel?: string
}) {
  const pathname = usePathname() || '/'

  // No public chrome in admin area
  if (pathname.startsWith('/admin')) return <>{children}</>

  // Detect event base path:
  // If the first segment is NOT a known "system" route, treat it as an event slug.
  const segs = pathname.split('/').filter(Boolean)
  const first = segs[0] || ''
  const reserved = new Set([
    'blessings',
    'gallery',
    'gift',
    'admin',
    'login',
    'bl', // blessing share short route
    'gl', // gallery share short route
    'api',
  ])
  const basePath = first && !reserved.has(first) ? `/${first}` : ''

  const hrefHome = basePath || '/'
  const hrefGalleries = `${basePath}/gallery`
  const hrefBlessings = `${basePath}/blessings`
  const hrefGift = `${basePath}/gift`

  const isHome = pathname === hrefHome
  const isGalleries = pathname === hrefGalleries || pathname.startsWith(`${hrefGalleries}/`)
  const isBlessings = pathname === hrefBlessings || pathname.startsWith(`${hrefBlessings}/`)
  const isGift = pathname === hrefGift || pathname.startsWith(`${hrefGift}/`)

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="hidden truncate text-right text-base font-semibold text-zinc-900 md:block">
              {eventName || 'אתר אירוע'}
            </div>
          </div>

          <nav className="flex shrink-0 items-center gap-2">
            {/* RTL: keep visually on the right */}
            <div className="flex flex-row-reverse items-center gap-2">
              <NavButton href={hrefHome} label="בית" active={isHome} />
              <NavButton href={hrefGalleries} label="גלריות" active={isGalleries} />
              <NavButton href={hrefBlessings} label="ברכות" active={isBlessings} />
              {showGiftNavButton ? (
                <NavButton href={hrefGift} label={giftNavLabel || 'מתנה'} active={isGift} />
              ) : null}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>

      <footer className="mt-10 border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 text-center text-sm text-zinc-500">
          {footerEnabled ? (
            <div className="space-y-2">
              {footerUrl ? (
                <a href={footerUrl} className="underline decoration-zinc-300 underline-offset-4">
                  {footerLabel || 'צור קשר'}
                </a>
              ) : (
                <span>{footerLabel || 'צור קשר'}</span>
              )}

              {footerLine2Enabled ? (
                footerLine2Url ? (
                  <a href={footerLine2Url} className="underline decoration-zinc-300 underline-offset-4">
                    {footerLine2Label || ''}
                  </a>
                ) : (
                  <span>{footerLine2Label || ''}</span>
                )
              ) : null}
            </div>
          ) : (
            <span className="opacity-70"> </span>
          )}
        </div>
      </footer>
    </div>
  )
}
