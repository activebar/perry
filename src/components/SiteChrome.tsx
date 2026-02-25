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
  eventName,
  footerEnabled,
  footerLabel,
  footerUrl,

  // extra footer line (optional)
  footerLine2Enabled,
  footerLine2Label,
  footerLine2Url,

  // gift nav control (optional)
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

  // supports both: /, /gallery... AND /ido, /ido/gallery...
  const parts = pathname.split('/').filter(Boolean)
  const first = parts[0] || ''
  const isReserved = first === 'gallery' || first === 'blessings' || first === 'gift' || first === 'admin'
  const base = isReserved ? '' : `/${first}`

  const isHome = pathname === '/' || pathname === base
  const isGalleries = pathname === `${base}/gallery` || pathname.startsWith(`${base}/gallery/`)
  const isBlessings = pathname === `${base}/blessings` || pathname.startsWith(`${base}/blessings/`)
  const isGift = pathname === `${base}/gift` || pathname.startsWith(`${base}/gift/`)

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="hidden truncate text-right text-base font-semibold text-zinc-900 md:block">
              {eventName || 'אתר אירוע'}
            </div>
          </div>

          {/* RTL: keep "בית" visually on the right */}
          <nav className="flex shrink-0 items-center gap-2">
            <div className="flex flex-row-reverse items-center gap-2">
              <NavButton href={`${base}/`} label="בית" active={isHome} />
              <NavButton href={`${base}/gallery`} label="גלריות" active={isGalleries} />
              <NavButton href={`${base}/blessings`} label="ברכות" active={isBlessings} />
              {showGiftNavButton ? (
                <NavButton href={`${base}/gift`} label={giftNavLabel || 'מתנה'} active={isGift} />
              ) : null}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>

      <footer className="mt-10 border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 text-center text-sm text-zinc-500 space-y-2">
          {/* line 1 */}
          <div>
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

          {/* line 2 */}
          {footerLine2Enabled ? (
            <div>
              {footerLine2Url ? (
                <a href={footerLine2Url} className="underline decoration-zinc-300 underline-offset-4">
                  {footerLine2Label || ''}
                </a>
              ) : (
                <span>{footerLine2Label || ''}</span>
              )}
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
