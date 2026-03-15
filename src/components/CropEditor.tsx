'use client'

import { useRef } from 'react'

function clamp01(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0.5
  return Math.max(0, Math.min(1, n))
}

function objectPositionFromCrop(item: {
  crop_position?: string | null
  crop_focus_x?: number | null
  crop_focus_y?: number | null
}) {
  const x = clamp01(item.crop_focus_x)
  const y = clamp01(item.crop_focus_y)
  return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`
}

export type CropAsset = {
  previewUrl: string
  isVideo: boolean
  crop_position: 'top' | 'center' | 'bottom'
  crop_focus_x: number | null
  crop_focus_y: number | null
}

export default function CropEditor({
  asset,
  onChange,
  onClose,
  onConfirm,
  busy,
}: {
  asset: CropAsset
  onChange: (patch: Partial<CropAsset>) => void
  onClose: () => void
  onConfirm: () => void
  busy?: boolean
}) {
  const areaRef = useRef<HTMLDivElement | null>(null)

  function applyPoint(clientX: number, clientY: number) {
    if (!areaRef.current) return
    const rect = areaRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))

    onChange({
      crop_focus_x: x,
      crop_focus_y: y,
      crop_position: y < 0.34 ? 'top' : y > 0.66 ? 'bottom' : 'center',
    })
  }

  const markerLeft = `${Math.round(clamp01(asset.crop_focus_x) * 100)}%`
  const markerTop = `${Math.round(clamp01(asset.crop_focus_y) * 100)}%`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">מיקום בתוך הריבוע</h3>
          <button type="button" onClick={onClose} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm">סגור</button>
        </div>

        <p className="mb-3 text-sm text-zinc-600">הזז את הסמן למרכז הרצוי.</p>

        <div
          ref={areaRef}
          className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100"
          onClick={(e) => applyPoint(e.clientX, e.clientY)}
          onTouchStart={(e) => {
            const t = e.touches?.[0]
            if (t) applyPoint(t.clientX, t.clientY)
          }}
        >
          {asset.isVideo ? (
            <video src={asset.previewUrl} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: objectPositionFromCrop(asset) }} muted playsInline />
          ) : (
            <img src={asset.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: objectPositionFromCrop(asset) }} />
          )}

          <div className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/30 shadow" style={{ left: markerLeft, top: markerTop }} />
          <div className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70" style={{ left: markerLeft, top: markerTop }} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange({ crop_position: 'top', crop_focus_x: 0.5, crop_focus_y: 0.14 })} className="rounded-full border border-zinc-200 px-4 py-2 text-sm">למעלה</button>
          <button type="button" onClick={() => onChange({ crop_position: 'center', crop_focus_x: 0.5, crop_focus_y: 0.5 })} className="rounded-full border border-zinc-200 px-4 py-2 text-sm">מרכז</button>
          <button type="button" onClick={() => onChange({ crop_position: 'bottom', crop_focus_x: 0.5, crop_focus_y: 0.78 })} className="rounded-full border border-zinc-200 px-4 py-2 text-sm">למטה</button>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-xl bg-zinc-900 px-5 py-2 text-sm text-white disabled:opacity-50">{busy ? 'שומר...' : 'שמור'}</button>
        </div>
      </div>
    </div>
  )
}
