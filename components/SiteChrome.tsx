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

  const isHome = pathname === '/'
  const isGalleries = pathname === '/gallery' || pathname.startsWith('/gallery/')
  const isBlessings = pathname === '/blessings' || pathname.startsWith('/blessings/')
 const isGift = pathname === '/gift' || pathname.startsWith('/gift/')


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
            <NavButton href="/gift" label="מתנה" active={isGift} />
            <NavButton href="/gallery" label="גלריות" active={isGalleries} />
            <NavButton href="/blessings" label="ברכות" active={isBlessings} />
            <NavButton href="/" label="בית" active={isHome} />
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
