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

export default function SiteChrome({
  children,
  basePath,
  eventName,
  footerEnabled,
  footerLabel,
  footerUrl,
  footerLine2Enabled,
  footerLine2Label,
  footerLine2Url,
  showGiftNavButton,
  giftNavLabel,
  galleryNavLabel,
  blessingsNavLabel,
}: {
  children: React.ReactNode
  /**
   * Prefix for all public routes (e.g. "/wedding").
   * If omitted/empty – behaves like the legacy single-site routes ("/blessings").
   */
  basePath?: string
  eventName?: string
  footerEnabled?: boolean
  footerLabel?: string | null
  footerUrl?: string | null
  footerLine2Enabled?: boolean | null
  footerLine2Label?: string | null
  footerLine2Url?: string | null
  showGiftNavButton?: boolean
  giftNavLabel?: string
  galleryNavLabel?: string
  blessingsNavLabel?: string
}) {
  const pathname = usePathname() || '/'

  const safeBase = (basePath || '').trim()
  const base = safeBase === '/' ? '' : safeBase.replace(/\/$/, '')
  const relPath = base && pathname.startsWith(base) ? (pathname.slice(base.length) || '/') : pathname

  const withBase = (p: string) => {
    if (!base) return p
    if (p === '/') return base
    return `${base}${p}`
  }

  // No public chrome in admin area
  if (pathname.startsWith('/admin')) return <>{children}</>

  const isHome = relPath === '/'
  const isGalleries = relPath === '/gallery' || relPath.startsWith('/gallery/')
  const isBlessings = relPath === '/blessings' || relPath.startsWith('/blessings/')
  const isGift = relPath === '/gift' || relPath.startsWith('/gift/')

  const safeGalleryNavLabel = (galleryNavLabel || '').trim() || 'גלריות'
  const safeBlessingsNavLabel = (blessingsNavLabel || '').trim() || 'ברכות'
  const eventAdminHref = base ? `/admin/login?event=${encodeURIComponent(base.replace(/^\//, ''))}` : '/admin/login'
  const siteAdminHref = '/admin'

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none md:max-w-3xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <div className="hidden truncate text-right text-base font-semibold text-zinc-900 md:block">
              {eventName || 'אתר אירוע'}
            </div>
          </div>

          <nav className="flex shrink-0 items-center gap-2">
            <div className="flex flex-row-reverse items-center gap-2">
              <NavButton href={withBase('/')} label="בית" active={isHome} />
              <NavButton href={withBase('/gallery')} label={safeGalleryNavLabel} active={isGalleries} />
              <NavButton href={withBase('/blessings')} label={safeBlessingsNavLabel} active={isBlessings} />
              {showGiftNavButton ? (
                <Link
                  href={withBase('/gift')}
                  className={[
                    'rounded-full px-4 py-2 text-sm transition',
                    isGift ? 'bg-black text-white' : 'bg-white text-zinc-900 hover:bg-zinc-100',
                  ].join(' ')}
                >
                  {giftNavLabel || 'מתנה'}
                </Link>
              ) : null}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-3 py-6 sm:px-4 md:max-w-3xl">{children}</main>


      <div className="fixed bottom-3 left-3 right-3 z-40 pointer-events-none">
        <div className="mx-auto flex w-full max-w-none items-end justify-between md:max-w-3xl">
          <a
            href={siteAdminHref}
            aria-label="ניהול אתר"
            title="ניהול אתר"
            className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300/60 bg-white/55 text-sm text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white/80 active:scale-95"
            style={{ opacity: 0.42 }}
          >
            🔧
          </a>

          <a
            href={eventAdminHref}
            aria-label="ניהול אירוע"
            title="ניהול אירוע"
            className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300/60 bg-white/55 text-sm text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white/80 active:scale-95"
            style={{ opacity: 0.42 }}
          >
            ⚙️
          </a>
        </div>
      </div>

      <footer className="mt-10 border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-none px-3 py-6 text-center text-sm text-zinc-500 sm:px-4 md:max-w-3xl">
          <div className="space-y-2">
            <div>
              {footerEnabled ? (
                footerUrl ? (
                  <a href={footerUrl} className="underline decoration-zinc-300 underline-offset-4">
                    {footerLabel || 'צור קשר'}
                  </a>
                ) : (
                  <span>{footerLabel || 'צור קשר'}</span>
                )
              ) : null}
            </div>

            <div>
              {footerLine2Enabled ? (
                footerLine2Url ? (
                  <a href={String(footerLine2Url)} className="underline decoration-zinc-300 underline-offset-4">
                    {footerLine2Label || ''}
                  </a>
                ) : (
                  <span>{footerLine2Label || ''}</span>
                )
              ) : null}
            </div>

            {!footerEnabled && !footerLine2Enabled ? (
              <div className="opacity-70">{eventName ? `${eventName} • ` : ''}מופעל ע״י ActiveBar</div>
            ) : null}

            <div className="mt-2 text-[10px] opacity-40" dir="ltr">
              build v13.21
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
