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
 * Detect current event base prefix from the current pathname.
 *
 * We support two modes:
 * 1) Root site: /, /gallery, /blessings, /gift
 * 2) Event site: /<event>, /<event>/gallery, /<event>/blessings, /<event>/gift
 *
 * This keeps the header links inside the same event automatically.
 */
function getEventBase(pathname: string) {
  const p = (pathname || '/').split('?')[0].split('#')[0]
  const parts = p.split('/').filter(Boolean)

  // Admin / API areas should not use public chrome
  if (p.startsWith('/admin') || p.startsWith('/api')) return null

  // Root routes (no event prefix)
  const rootFirst = new Set(['gallery', 'blessings', 'gift'])
  if (parts.length === 0) return '' // "/"
  if (rootFirst.has(parts[0])) return '' // "/gallery" etc.

  // Event routes: first segment is the event slug
  return '/' + parts[0]
}

export default function SiteChrome({
  children,
  eventName,
  footerEnabled,
  footerLabel,
  footerUrl,
}: {
  children: React.ReactNode
  eventName?: string
  footerEnabled?: boolean
  footerLabel?: string | null
  footerUrl?: string | null
}) {
  const pathname = usePathname() || '/'

  // No public chrome in admin area
  if (pathname.startsWith('/admin')) return <>{children}</>

  const base = getEventBase(pathname)
  const prefix = base ?? '' // null means "no chrome"; but we already handled /admin

  const homeHref = prefix || '/'
  const galleryHref = (prefix || '') + '/gallery'
  const blessingsHref = (prefix || '') + '/blessings'
  const giftHref = (prefix || '') + '/gift'

  const isHome =
    prefix === ''
      ? pathname === '/'
      : pathname === prefix || pathname === prefix + '/'

  const isGalleries =
    prefix === ''
      ? pathname === '/gallery' || pathname.startsWith('/gallery/')
      : pathname === prefix + '/gallery' || pathname.startsWith(prefix + '/gallery/')

  const isBlessings =
    prefix === ''
      ? pathname === '/blessings' || pathname.startsWith('/blessings/')
      : pathname === prefix + '/blessings' || pathname.startsWith(prefix + '/blessings/')

  const isGift =
    prefix === ''
      ? pathname === '/gift' || pathname.startsWith('/gift/')
      : pathname === prefix + '/gift' || pathname.startsWith(prefix + '/gift/')

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
            {/* RTL: keep "בית" visually on the right */}
            <div className="flex flex-row-reverse items-center gap-2">
              <NavButton href={homeHref} label="בית" active={isHome} />
              <NavButton href={galleryHref} label="גלריות" active={isGalleries} />
              <NavButton href={blessingsHref} label="ברכות" active={isBlessings} />
              <NavButton href={giftHref} label="מתנה" active={isGift} />
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>

      <footer className="mt-10 border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 text-center text-sm text-zinc-500">
          {footerEnabled ? (
            footerUrl ? (
              <a href={footerUrl} className="underline decoration-zinc-300 underline-offset-4">
                {footerLabel || 'צור קשר'}
              </a>
            ) : (
              <span>{footerLabel || 'צור קשר'}</span>
            )
          ) : (
            <span className="opacity-70"> </span>
          )}
        </div>
      </footer>
    </div>
  )
}
