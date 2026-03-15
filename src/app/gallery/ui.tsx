'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type GalleryItem = {
  id: string
  url: string
  thumb_url?: string | null
  kind?: string | null
  crop_position?: 'top' | 'center' | 'bottom' | null
  crop_focus_x?: number | null
  crop_focus_y?: number | null
  created_at?: string | null
  editable_until?: string | null
  uploader_device_id?: string | null
}

type ReactionSummary = Record<string, number>

type PendingAsset = {
  file?: File
  previewUrl: string
  isVideo: boolean
  crop_position: 'top' | 'center' | 'bottom'
  crop_focus_x: number | null
  crop_focus_y: number | null
  existingItemId?: string
  source: 'upload' | 'camera'
}

const EMOJIS = ['❤️', '🔥', '😍', '👏', '😂', '😮']
const DIRECT_DOWNLOAD_LIMIT = 8

function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return ''
  const key = 'device_id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const next =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(key, next)
  document.cookie = `device_id=${next}; path=/; max-age=31536000; samesite=lax`
  return next
}

function clamp01(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(1, n))
}

function isVideoUrl(url?: string | null) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url || '')
}

function isVideoItem(item?: GalleryItem | null) {
  if (!item) return false
  return isVideoUrl(item.url) || String(item.kind || '').toLowerCase().includes('video')
}

function formatRemaining(ms: number) {
  if (ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function objectPositionFromCrop(item: {
  crop_position?: string | null
  crop_focus_x?: number | null
  crop_focus_y?: number | null
}) {
  const x = clamp01(item.crop_focus_x)
  const y = clamp01(item.crop_focus_y)
  if (x != null && y != null) return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`
  if (item.crop_position === 'top') return '50% 12%'
  if (item.crop_position === 'bottom') return '50% 82%'
  return '50% 50%'
}

async function fileToCompressedBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file

  const imgUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('failed to load image'))
      el.src = imgUrl
    })

    const maxW = 1800
    const maxH = 1800

    let w = img.naturalWidth
    let h = img.naturalHeight

    const ratio = Math.min(maxW / w, maxH / h, 1)
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88)
    )

    return blob || file
  } finally {
    URL.revokeObjectURL(imgUrl)
  }
}

async function triggerDownload(url: string, filenameBase?: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const ext =
      blob.type === 'image/png'
        ? 'png'
        : blob.type === 'image/webp'
          ? 'webp'
          : blob.type === 'video/mp4'
            ? 'mp4'
            : blob.type === 'video/webm'
              ? 'webm'
              : blob.type === 'video/quicktime'
                ? 'mov'
                : 'jpg'

    const safeBase = String(filenameBase || 'activebar')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_\-]+/g, '_')
      .slice(0, 60) || 'activebar'

    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `${safeBase}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1500)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function detectAutoFocus(file: File): Promise<{
  crop_position: 'top' | 'center' | 'bottom'
  crop_focus_x: number | null
  crop_focus_y: number | null
}> {
  if (!file.type.startsWith('image/')) {
    return { crop_position: 'center', crop_focus_x: 0.5, crop_focus_y: 0.5 }
  }

  try {
    const AnyWindow = window as any
    if (typeof AnyWindow.FaceDetector === 'function') {
      const detector = new AnyWindow.FaceDetector({
        fastMode: true,
        maxDetectedFaces: 1,
      })
      const bitmap = await createImageBitmap(file)
      const faces = await detector.detect(bitmap)
      if (faces?.length) {
        const face = faces
          .slice()
          .sort(
            (a: any, b: any) =>
              (b.boundingBox?.width || 0) * (b.boundingBox?.height || 0) -
              (a.boundingBox?.width || 0) * (a.boundingBox?.height || 0)
          )[0]

        const box = face.boundingBox
        const cx = (box.x + box.width / 2) / bitmap.width
        const cy = (box.y + box.height / 2) / bitmap.height

        return {
          crop_position: cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : 'center',
          crop_focus_x: Math.max(0, Math.min(1, cx)),
          crop_focus_y: Math.max(0, Math.min(1, cy)),
        }
      }
    }
  } catch {
    // ignore and fallback
  }

  const imgUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('failed to load image'))
      el.src = imgUrl
    })

    if (img.naturalWidth < img.naturalHeight) {
      return { crop_position: 'top', crop_focus_x: 0.5, crop_focus_y: 0.18 }
    }
    return { crop_position: 'center', crop_focus_x: 0.5, crop_focus_y: 0.5 }
  } finally {
    URL.revokeObjectURL(imgUrl)
  }
}

function CropEditor({
  asset,
  onChange,
  onClose,
  onConfirm,
  busy,
}: {
  asset: PendingAsset
  onChange: (patch: Partial<PendingAsset>) => void
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

  const markerLeft = `${Math.round((clamp01(asset.crop_focus_x) ?? 0.5) * 100)}%`
  const markerTop = `${Math.round((clamp01(asset.crop_focus_y) ?? 0.5) * 100)}%`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">מיקום בתוך הריבוע</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            סגור
          </button>
        </div>

        <p className="mb-3 text-sm text-zinc-600">
          הזז את הסמן למרכז הרצוי. אם יש זיהוי פנים, המיקום כבר נבחר אוטומטית.
        </p>

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
            <video
              src={asset.previewUrl}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: objectPositionFromCrop(asset) }}
              muted
              playsInline
            />
          ) : (
            <img
              src={asset.previewUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: objectPositionFromCrop(asset) }}
            />
          )}

          <div
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/30 shadow"
            style={{ left: markerLeft, top: markerTop }}
          />
          <div
            className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70"
            style={{ left: markerLeft, top: markerTop }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onChange({ crop_position: 'top', crop_focus_x: 0.5, crop_focus_y: 0.14 })
            }
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm"
          >
            למעלה
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({ crop_position: 'center', crop_focus_x: 0.5, crop_focus_y: 0.5 })
            }
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm"
          >
            מרכז
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({ crop_position: 'bottom', crop_focus_x: 0.5, crop_focus_y: 0.78 })
            }
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm"
          >
            למטה
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-zinc-900 px-5 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GalleryClient({
  initialItems,
  galleryId,
  uploadEnabled,
}: {
  initialItems: GalleryItem[]
  galleryId: string
  uploadEnabled?: boolean
}) {
  const [items, setItems] = useState<GalleryItem[]>(initialItems || [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const [preview, setPreview] = useState<GalleryItem | null>(null)
  const [countdownNow, setCountdownNow] = useState(Date.now())
  const [reactionsByItem, setReactionsByItem] = useState<Record<string, ReactionSummary>>({})
  const [myReactionsByItem, setMyReactionsByItem] = useState<Record<string, string[]>>({})
  const [deviceId, setDeviceId] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [uploadLabel, setUploadLabel] = useState<string>('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false)
  const [cropAsset, setCropAsset] = useState<PendingAsset | null>(null)

  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const cameraPhotoRef = useRef<HTMLInputElement | null>(null)
  const cameraVideoRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId())
  }, [])

  useEffect(() => {
    const t = setInterval(() => setCountdownNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setItems(initialItems || [])
  }, [initialItems])

  useEffect(() => {
    if (!items.length) return
    loadReactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  async function loadReactions() {
    try {
      const ids = items.map((x) => x.id).filter(Boolean)
      if (!ids.length) return

      const qs = new URLSearchParams()
      ids.forEach((id) => qs.append('media_item_id', id))
      const res = await fetch(`/api/public/gallery-items?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return

      if (json?.reactionsByItem) {
        setReactionsByItem(json.reactionsByItem || {})
      }
      if (json?.myReactionsByItem) {
        setMyReactionsByItem(json.myReactionsByItem || {})
      }
    } catch {
      // ignore
    }
  }

  function canEdit(item: GalleryItem) {
    if (!item?.editable_until || !item?.uploader_device_id || !deviceId) return false
    const sameUploader = String(item.uploader_device_id) === String(deviceId)
    const until = new Date(String(item.editable_until)).getTime()
    return sameUploader && until > countdownNow
  }

  function canReposition(item: GalleryItem) {
    if (!item?.uploader_device_id || !deviceId) return false
    return String(item.uploader_device_id) === String(deviceId)
  }

  function remainingForItem(item: GalleryItem) {
    if (!item?.editable_until) return '00:00'
    const until = new Date(String(item.editable_until)).getTime()
    return formatRemaining(until - countdownNow)
  }

  async function refreshItems() {
    try {
      const res = await fetch(`/api/public/gallery-items?gallery_id=${encodeURIComponent(galleryId)}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return
      setItems(Array.isArray(json?.items) ? json.items : [])
    } catch {
      // ignore
    }
  }

  async function uploadSingleAsset(asset: PendingAsset) {
    if (!asset.file) return

    const fd = new FormData()
    const isVideo = asset.file.type.startsWith('video/')

    if (isVideo) {
      fd.set('file', asset.file)
    } else {
      const compressed = await fileToCompressedBlob(asset.file)
      fd.set(
        'file',
        compressed instanceof File
          ? compressed
          : new File([compressed], asset.file.name.replace(/\.[^.]+$/, '') + '.jpg', {
              type: 'image/jpeg',
            })
      )
    }

    fd.set('kind', 'gallery')
    fd.set('gallery_id', galleryId)
    fd.set('device_id', deviceId)
    fd.set('crop_position', asset.crop_position)
    if (asset.crop_focus_x != null) fd.set('crop_focus_x', String(asset.crop_focus_x))
    if (asset.crop_focus_y != null) fd.set('crop_focus_y', String(asset.crop_focus_y))

    const up = await fetch('/api/upload', {
      method: 'POST',
      body: fd,
    })

    const upJson = await up.json().catch(() => ({}))
    if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')
    return upJson
  }

  async function uploadBatch(list: File[], source: 'upload' | 'camera') {
    setBusy(true)
    setUploadProgress(0)
    setUploadLabel(source === 'camera' ? 'מעלה צילום...' : 'מעלה קבצים...')
    setMsg('')

    try {
      let pendingCount = 0
      let approvedCount = 0

      for (let i = 0; i < list.length; i++) {
        const file = list[i]
        const isVideo = file.type.startsWith('video/')
        const auto = isVideo
          ? { crop_position: 'center' as const, crop_focus_x: 0.5, crop_focus_y: 0.5 }
          : await detectAutoFocus(file)

        const upJson = await uploadSingleAsset({
          file,
          previewUrl: '',
          isVideo,
          source,
          crop_position: auto.crop_position,
          crop_focus_x: auto.crop_focus_x,
          crop_focus_y: auto.crop_focus_y,
        })

        if (upJson?.is_approved === false) pendingCount += 1
        else approvedCount += 1

        const pct = Math.round(((i + 1) / list.length) * 100)
        setUploadProgress(pct)
        setUploadLabel(`${source === 'camera' ? 'מעלה צילום...' : 'מעלה קבצים...'} ${i + 1}/${list.length}`)
      }

      await refreshItems()
      await loadReactions()

      if (pendingCount > 0 && approvedCount > 0) {
        setMsg(`הועלו ${approvedCount} קבצים בהצלחה, ו-${pendingCount} ממתינים לאישור מנהל`)
      } else if (pendingCount > 0) {
        setMsg(
          pendingCount === 1
            ? 'הקובץ הועלה וממתין לאישור מנהל'
            : `${pendingCount} קבצים הועלו וממתינים לאישור מנהל`
        )
      } else {
        setMsg(list.length === 1 ? 'הקובץ הועלה בהצלחה' : `${list.length} קבצים הועלו בהצלחה`)
      }
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה בהעלאה')
    } finally {
      setBusy(false)
      setUploadProgress(0)
      setUploadLabel('')
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      if (cameraPhotoRef.current) cameraPhotoRef.current.value = ''
      if (cameraVideoRef.current) cameraVideoRef.current.value = ''
    }
  }

  async function openCropForFiles(files: FileList | File[] | null, source: 'upload' | 'camera') {
    const list = Array.from(files || [])
    if (!list.length) return

    if (list.length > 1) {
      await uploadBatch(list, source)
      return
    }

    const first = list[0]
    const isVideo = first.type.startsWith('video/')

    if (isVideo) {
      await uploadBatch([first], source)
      return
    }

    const previewUrl = URL.createObjectURL(first)
    const auto = await detectAutoFocus(first)
    setCropAsset({
      file: first,
      previewUrl,
      isVideo: false,
      crop_position: auto.crop_position,
      crop_focus_x: auto.crop_focus_x,
      crop_focus_y: auto.crop_focus_y,
      source,
    })
  }

  async function confirmCropAndUpload() {
    if (!cropAsset) return
    setBusy(true)
    setUploadProgress(35)
    setUploadLabel(cropAsset.source === 'camera' ? 'מעלה צילום...' : 'מעלה קובץ...')
    setMsg('')

    try {
      const upJson = await uploadSingleAsset(cropAsset)
      await refreshItems()
      await loadReactions()
      setMsg(upJson?.is_approved === false ? 'הקובץ הועלה וממתין לאישור מנהל' : 'הקובץ הועלה בהצלחה')
      URL.revokeObjectURL(cropAsset.previewUrl)
      setCropAsset(null)
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה בהעלאה')
    } finally {
      setBusy(false)
      setUploadProgress(0)
      setUploadLabel('')
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      if (cameraPhotoRef.current) cameraPhotoRef.current.value = ''
      if (cameraVideoRef.current) cameraVideoRef.current.value = ''
    }
  }

  async function saveCropForExisting(itemId: string, crop: PendingAsset) {
    try {
      setBusy(true)
      const res = await fetch('/api/public/gallery-items', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          id: itemId,
          crop_position: crop.crop_position,
          crop_focus_x: crop.crop_focus_x,
          crop_focus_y: crop.crop_focus_y,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'שגיאה בשמירת מיקום')

      await refreshItems()
      setPreview((prev) =>
        prev && prev.id === itemId
          ? {
              ...prev,
              crop_position: crop.crop_position,
              crop_focus_x: crop.crop_focus_x,
              crop_focus_y: crop.crop_focus_y,
            }
          : prev
      )
      setMsg('המיקום נשמר')
      setCropAsset(null)
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה בשמירת מיקום')
    } finally {
      setBusy(false)
    }
  }

  function openCropEditorForExisting(item: GalleryItem) {
    setCropAsset({
      existingItemId: item.id,
      previewUrl: item.url,
      isVideo: isVideoItem(item),
      crop_position: (item.crop_position as any) || 'center',
      crop_focus_x: item.crop_focus_x ?? 0.5,
      crop_focus_y: item.crop_focus_y ?? 0.5,
      source: 'upload',
    })
  }

  async function replaceFile(item: GalleryItem, file: File) {
    try {
      setEditingItemId(item.id)
      setMsg('מחליף קובץ...')

      const isVideo = file.type.startsWith('video/')
      let crop_position: 'top' | 'center' | 'bottom' = 'center'
      let crop_focus_x: number | null = 0.5
      let crop_focus_y: number | null = 0.5

      if (!isVideo) {
        const auto = await detectAutoFocus(file)
        crop_position = auto.crop_position
        crop_focus_x = auto.crop_focus_x
        crop_focus_y = auto.crop_focus_y
      }

      const fd = new FormData()
      if (isVideo) {
        fd.set('file', file)
      } else {
        const compressed = await fileToCompressedBlob(file)
        fd.set(
          'file',
          compressed instanceof File
            ? compressed
            : new File([compressed], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
                type: 'image/jpeg',
              })
        )
      }

      fd.set('kind', 'gallery')
      fd.set('gallery_id', galleryId)
      fd.set('device_id', deviceId)
      fd.set('crop_position', crop_position)
      if (crop_focus_x != null) fd.set('crop_focus_x', String(crop_focus_x))
      if (crop_focus_y != null) fd.set('crop_focus_y', String(crop_focus_y))

      const up = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
      })
      const upJson = await up.json().catch(() => ({}))
      if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')

      const res = await fetch('/api/public/gallery-items', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          id: item.id,
          replacement_url: upJson?.publicUrl || null,
          replacement_thumb_url: upJson?.thumbUrl || null,
          replacement_storage_path: upJson?.path || null,
          replacement_kind: upJson?.kind || null,
          crop_position: upJson?.crop_position || crop_position,
          crop_focus_x: upJson?.crop_focus_x ?? crop_focus_x,
          crop_focus_y: upJson?.crop_focus_y ?? crop_focus_y,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'שגיאה בהחלפת קובץ')

      setMsg('הקובץ הוחלף בהצלחה')
      await refreshItems()
      setPreview(null)
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה בהחלפת קובץ')
    } finally {
      setEditingItemId(null)
    }
  }

  async function deleteItem(item: GalleryItem) {
    if (!confirm('למחוק את התמונה או הסרטון?')) return

    try {
      setEditingItemId(item.id)
      setMsg('מוחק קובץ...')

      const res = await fetch('/api/public/gallery-items', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({ id: item.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'שגיאה במחיקה')

      setMsg('הקובץ נמחק')
      await refreshItems()
      setPreview(null)
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה במחיקה')
    } finally {
      setEditingItemId(null)
    }
  }

  async function toggleReaction(itemId: string, emoji: string) {
    const currentSelected = (myReactionsByItem[itemId] || [])[0] || null
    const isSame = currentSelected === emoji

    setMyReactionsByItem((prev) => ({
      ...prev,
      [itemId]: isSame ? [] : [emoji],
    }))

    setReactionsByItem((prev) => {
      const next = { ...(prev[itemId] || {}) }

      if (currentSelected && next[currentSelected]) {
        next[currentSelected] = Math.max(0, next[currentSelected] - 1)
        if (next[currentSelected] <= 0) delete next[currentSelected]
      }

      if (!isSame) {
        next[emoji] = Number(next[emoji] || 0) + 1
      }

      return { ...prev, [itemId]: next }
    })

    try {
      const res = await fetch('/api/reactions/toggle', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          media_item_id: itemId,
          emoji,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'שגיאה בעדכון תגובה')

      setReactionsByItem((prev) => ({
        ...prev,
        [itemId]: json?.counts || {},
      }))

      setMyReactionsByItem((prev) => ({
        ...prev,
        [itemId]: json?.selected_emoji ? [json.selected_emoji] : [],
      }))
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה בעדכון תגובה')
      await loadReactions()
    }
  }

  async function shareItem(item: GalleryItem) {
    try {
      const res = await fetch('/api/short-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'gl',
          media_item_id: item.id,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'שגיאה ביצירת קישור')

      const shareUrl = `${window.location.origin}/gl/${json.code}`

      if (navigator.share) {
        await navigator.share({ url: shareUrl })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        setMsg('קישור השיתוף הועתק')
      } else {
        window.prompt('העתק את הקישור', shareUrl)
      }
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה בשיתוף')
    }
  }

  function clearSelected() {
    setSelectedIds({})
  }

  function toggleSelected(itemId: string) {
    setSelectedIds((prev) => {
      const next = { ...prev }
      if (next[itemId]) delete next[itemId]
      else next[itemId] = true
      return next
    })
  }

  async function downloadSelected() {
    try {
      const ids = Object.keys(selectedIds)
      if (!ids.length) {
        setMsg('לא נבחרו קבצים להורדה')
        return
      }

      const selected = sortedItems.filter((x) => ids.includes(x.id))
      for (let i = 0; i < selected.length; i++) {
        const item = selected[i]
        await triggerDownload(item.url, `gallery_${String(i + 1).padStart(2, '0')}`)
        await new Promise((r) => setTimeout(r, 250))
      }

      setMsg(
        ids.length > DIRECT_DOWNLOAD_LIMIT
          ? `החלה הורדה של ${ids.length} קבצים`
          : 'ההורדות התחילו'
      )
      setSelectMode(false)
      clearSelected()
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה בהורדה')
    }
  }

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const da = new Date(String(a.created_at || 0)).getTime()
        const db = new Date(String(b.created_at || 0)).getTime()
        return db - da
      }),
    [items]
  )

  return (
    <div className="space-y-5" dir="rtl">
      {cropAsset ? (
        <CropEditor
          asset={cropAsset}
          busy={busy}
          onClose={() => {
            if (!cropAsset.existingItemId) {
              URL.revokeObjectURL(cropAsset.previewUrl)
            }
            setCropAsset(null)
          }}
          onChange={(patch) => setCropAsset((prev) => (prev ? { ...prev, ...patch } : prev))}
          onConfirm={() => {
            if (cropAsset.existingItemId) {
              saveCropForExisting(cropAsset.existingItemId, cropAsset)
            } else {
              confirmCropAndUpload()
            }
          }}
        />
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-2xl font-bold">תמונות בגלריה</h2>
        <p className="mt-1 text-sm text-zinc-600">בחר תמונות לגלריה</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setCaptureMenuOpen((p) => !p)}
              disabled={!uploadEnabled || busy || selectMode}
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
              title="צילום"
            >
              📸 צילום
            </button>

            {captureMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setCaptureMenuOpen(false)
                    cameraPhotoRef.current?.click()
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-right text-sm hover:bg-zinc-50"
                >
                  צילום תמונה
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCaptureMenuOpen(false)
                    cameraVideoRef.current?.click()
                  }}
                  className="mt-1 block w-full rounded-xl px-3 py-2 text-right text-sm hover:bg-zinc-50"
                >
                  צילום וידאו
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={!uploadEnabled || busy || selectMode}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            title="העלאת קבצים"
          >
            ⬆️ העלאה
          </button>

          {!selectMode ? (
            <button
              type="button"
              onClick={() => {
                setSelectMode(true)
                clearSelected()
                setMsg('בחר קבצים להורדה')
              }}
              disabled={busy}
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
              title="בחירה מרובה להורדה"
            >
              💾 הורדה
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={downloadSelected}
                disabled={busy || Object.keys(selectedIds).length === 0}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
              >
                הורד נבחרות ({Object.keys(selectedIds).length})
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectMode(false)
                  clearSelected()
                  setMsg('')
                }}
                disabled={busy}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
              >
                ביטול
              </button>
            </>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 p-4">
          <div className="text-sm text-zinc-700">
            {uploadEnabled ? 'אפשר להעלות תמונות או סרטונים' : 'העלאה סגורה כרגע'}
          </div>

          {busy ? (
            <div className="mt-4">
              <div className="mb-2 text-sm text-zinc-600">{uploadLabel || 'מעלה...'}</div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-700 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-zinc-500">{uploadProgress}%</div>
            </div>
          ) : null}

          {msg ? <div className="mt-4 text-sm text-zinc-600">{msg}</div> : null}
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => openCropForFiles(e.target.files, 'upload')}
        />

        <input
          ref={cameraPhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => openCropForFiles(e.target.files, 'camera')}
        />

        <input
          ref={cameraVideoRef}
          type="file"
          accept="video/*"
          capture="environment"
          hidden
          onChange={(e) => openCropForFiles(e.target.files, 'camera')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sortedItems.map((item) => {
          const thumb = item.thumb_url || item.url
          const video = isVideoItem(item)
          const reactions = reactionsByItem[item.id] || {}
          const topReaction = Object.entries(reactions).sort((a, b) => b[1] - a[1])[0]
          const editable = canEdit(item)
          const selected = !!selectedIds[item.id]

          return (
            <div
              key={item.id}
              className={`overflow-hidden rounded-2xl border bg-white ${selected ? 'border-black ring-2 ring-black/10' : 'border-zinc-200'}`}
            >
              <button
                type="button"
                className="relative block aspect-square w-full bg-zinc-50"
                onClick={() => {
                  if (selectMode) {
                    toggleSelected(item.id)
                    return
                  }
                  setPreview(item)
                }}
              >
                {video ? (
                  <video
                    src={item.url}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: objectPositionFromCrop(item) }}
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={thumb}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: objectPositionFromCrop(item) }}
                  />
                )}

                {topReaction ? (
                  <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white shadow">
                    {topReaction[0]} {topReaction[1]}
                  </div>
                ) : null}

                {editable ? (
                  <div className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs text-zinc-800 shadow">
                    {remainingForItem(item)}
                  </div>
                ) : null}

                {video ? (
                  <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
                    🎥
                  </div>
                ) : null}

                {selectMode ? (
                  <div className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-1 text-xs text-zinc-800 shadow">
                    {selected ? '✓ נבחר' : 'בחר'}
                  </div>
                ) : null}
              </button>

              <div className="flex items-center justify-center gap-6 px-4 py-3 text-lg">
                <button
                  type="button"
                  className="transition hover:scale-110"
                  onClick={() => setPreview(item)}
                  title="תגובות"
                >
                  😊
                </button>

                <button
                  type="button"
                  className="transition hover:scale-110"
                  onClick={() => triggerDownload(item.url, item.id)}
                  title="הורדה"
                >
                  💾
                </button>

                <button
                  type="button"
                  className="transition hover:scale-110"
                  onClick={() => shareItem(item)}
                  title="שיתוף"
                >
                  🔗
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm text-zinc-500">
                {canEdit(preview) ? `אפשר לערוך עוד ${remainingForItem(preview)}` : ''}
              </div>

              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                סגור
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl bg-zinc-100">
              <div className="mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl bg-zinc-100">
                {isVideoItem(preview) ? (
                  <video
                    src={preview.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full bg-black object-cover"
                    style={{ objectPosition: objectPositionFromCrop(preview) }}
                  />
                ) : (
                  <img
                    src={preview.url}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{ objectPosition: objectPositionFromCrop(preview) }}
                  />
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => shareItem(preview)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
              >
                🔗 שיתוף
              </button>

              <button
                type="button"
                onClick={() => triggerDownload(preview.url, preview.id)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
              >
                💾 הורדה
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">תגובות</div>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((emoji) => {
                  const count = Number(reactionsByItem[preview.id]?.[emoji] || 0)
                  const active = (myReactionsByItem[preview.id] || []).includes(emoji)

                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => toggleReaction(preview.id, emoji)}
                      className={
                        'rounded-full border px-3 py-2 text-sm ' +
                        (active
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 bg-white text-zinc-800')
                      }
                    >
                      {emoji} {count > 0 ? count : ''}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {canReposition(preview) && !isVideoItem(preview) ? (
                <button
                  type="button"
                  onClick={() => openCropEditorForExisting(preview)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
                >
                  🎯 מיקום
                </button>
              ) : null}

              {canEdit(preview) ? (
                <>
                  <label className="cursor-pointer rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50">
                    ערוך קובץ
                    <input
                      type="file"
                      accept="image/*,video/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) replaceFile(preview, file)
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => deleteItem(preview)}
                    disabled={editingItemId === preview.id}
                    className="rounded-xl border border-red-200 bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {editingItemId === preview.id ? 'מוחק...' : 'מחק'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
