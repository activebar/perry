'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Simple, smooth cross-fade between hero images.
 * - No "jump" between images (two layers with opacity transition)
 * - Keeps aspect ratio and rounded corners via parent
 */
export default function HeroRotator({ images, seconds = 4 }: { images: string[]; seconds?: number }) {
  const list = useMemo(() => (Array.isArray(images) ? images.filter(Boolean) : []), [images])
  const intervalMs = Math.max(2, Number(seconds || 4)) * 1000

  // We render two layers: "base" and "top".
  const [baseIdx, setBaseIdx] = useState(0)
  const [topIdx, setTopIdx] = useState(0)
  const [topVisible, setTopVisible] = useState(false)
  const timer = useRef<any>(null)

  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (!list.length) return

    // reset
    setBaseIdx(0)
    setTopIdx(0)
    setTopVisible(false)

    timer.current = setInterval(() => {
      // prepare next image in top layer
      const next = (baseIdxRef.current + 1) % list.length
      setTopIdx(next)
      setTopVisible(true)

      // after fade-in, commit it as base and hide top again
      window.setTimeout(() => {
        setBaseIdx(next)
        setTopVisible(false)
      }, 550)
    }, intervalMs)

    return () => {
      if (timer.current) clearInterval(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.join('|'), intervalMs])

  // Keep a ref so interval callback always has current base index
  const baseIdxRef = useRef(0)
  useEffect(() => {
    baseIdxRef.current = baseIdx
  }, [baseIdx])

  if (!list.length) return null

  const baseSrc = list[Math.min(baseIdx, list.length - 1)]
  const topSrc = list[Math.min(topIdx, list.length - 1)]

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100">
      {/* Base */}
      <img
        src={baseSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
      />

      {/* Top (fades in) */}
      <img
        src={topSrc}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-in-out ${
          topVisible ? 'opacity-100' : 'opacity-0'
        }`}
        loading="eager"
      />

      {/* Dots */}
      {list.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
          {list.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === baseIdx ? 'bg-white' : 'bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
