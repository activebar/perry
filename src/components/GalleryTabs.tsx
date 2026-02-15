import Link from 'next/link'

type GalleryTab = {
  id: string
  label: string
}

export function GalleryTabs({
  tabs,
  activeId,
  className,
}: {
  tabs: GalleryTab[]
  activeId?: string
  className?: string
}) {
  if (!tabs?.length) return null

  return (
    <div
      className={
        className ??
        'flex flex-wrap items-center justify-center gap-2 rounded-full bg-zinc-50 p-2'
      }
      dir="rtl"
    >
      {tabs.map((t) => {
        const isActive = activeId && String(activeId) === String(t.id)
        return (
          <Link
            key={t.id}
            href={`/gallery/${t.id}`}
            className={
              'rounded-full px-4 py-2 text-sm font-medium transition ' +
              (isActive
                ? 'bg-black text-white'
                : 'bg-white text-zinc-900 ring-1 ring-zinc-200')
            }
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
