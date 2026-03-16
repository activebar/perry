'use client'

import { useMemo } from 'react'

type CropPoint = { x: number; y: number }

type CropEditorProps = {
  src: string
  x?: number
  y?: number
  onChange?: (point: CropPoint) => void
}

function clamp01(v: number | undefined) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0.5
  return Math.max(0, Math.min(1, v))
}

export default function CropEditor({
  src,
  x = 0.5,
  y = 0.5,
  onChange,
}: CropEditorProps) {
  const px = useMemo(() => clamp01(x), [x])
  const py = useMemo(() => clamp01(y), [y])

  function setPoint(nx: number, ny: number) {
    onChange?.({ x: clamp01(nx), y: clamp01(ny) })
  }

  function handlePointer(clientX: number, clientY: number, el: HTMLDivElement | null) {
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = (clientX - rect.left) / rect.width
    const ny = (clientY - rect.top) / rect.height
    setPoint(nx, ny)
  }

  return (
    <div className="grid gap-3">
      <div
        className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl bg-zinc-100"
        onClick={(e) => handlePointer(e.clientX, e.clientY, e.currentTarget)}
        onTouchStart={(e) => {
          const t = e.touches?.[0]
          if (t) handlePointer(t.clientX, t.clientY, e.currentTarget)
        }}
      >
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `${Math.round(px * 100)}% ${Math.round(py * 100)}%` }}
        />
        <div
          className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80"
          style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
        />
        <div
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-pink-500/30 shadow"
          style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => setPoint(0.5, 0.14)}
          className="rounded-full border border-zinc-200 px-4 py-2 text-sm"
        >
          למעלה
        </button>
        <button
          type="button"
          onClick={() => setPoint(0.5, 0.5)}
          className="rounded-full border border-zinc-200 px-4 py-2 text-sm"
        >
          מרכז
        </button>
        <button
          type="button"
          onClick={() => setPoint(0.5, 0.78)}
          className="rounded-full border border-zinc-200 px-4 py-2 text-sm"
        >
          למטה
        </button>
      </div>
    </div>
  )
}
