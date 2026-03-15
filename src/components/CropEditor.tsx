'use client'

import React, { useRef, useState } from 'react'

type CropPoint = {
  x: number
  y: number
}

type CropEditorProps = {
  src: string
  x?: number
  y?: number
  onChange?: (point: CropPoint) => void
}

export default function CropEditor({
  src,
  x = 0.5,
  y = 0.5,
  onChange,
}: CropEditorProps) {
  const ref = useRef<HTMLImageElement | null>(null)
  const [pos, setPos] = useState<CropPoint>({ x, y })

  function handleClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const p: CropPoint = {
      x: Math.max(0, Math.min(1, nx)),
      y: Math.max(0, Math.min(1, ny)),
    }
    setPos(p)
    onChange?.(p)
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
      <img
        ref={ref}
        src={src}
        onClick={handleClick}
        alt=""
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          objectFit: 'cover',
          cursor: 'crosshair',
          display: 'block',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${pos.x * 100}%`,
          top: `${pos.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: '3px solid #ff2d55',
          background: 'rgba(255,45,85,0.25)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
