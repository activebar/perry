'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Button, Card } from '@/components/ui'

type Item = {
  id: string
  url: string
  thumb_url?: string | null
  created_at?: string
  editable_until?: string | null
  uploader_device_id?: string | null
  is_approved?: boolean
  crop_position?: string | null
}

const DEVICE_COOKIE = 'device_id'

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return
  const exp = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${exp}; Path=/; SameSite=Lax`
}

function getOrCreateDeviceId() {
  let id = getCookie(DEVICE_COOKIE)
  if (id) return id
  id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  setCookie(DEVICE_COOKIE, id, 365)
  return id
}

async function downloadUrl(url: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const fileName = (url.split('/').pop() || 'image').split('?')[0] || 'image'
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function shareUrl(url: string) {
  const clean = String(url || '').trim()
  if (!clean) return
  try {
    if ((navigator as any).share) {
      await (navigator as any).share({ url: clean })
      return
    }
  } catch {}
  try {
    await navigator.clipboard.writeText(clean)
    alert('הקישור הועתק ✅')
  } catch {
    window.open(clean, '_blank', 'noopener,noreferrer')
  }
}

async function ensureShortLinkForMedia(mediaItemId: string) {
  const id = String(mediaItemId || '').trim()
  if (!id) return null
  const code = id.slice(0, 8)
  try {
    await fetch('/api/short-links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'gl',
        mediaItemId: id,
        code,
        targetPath: `/media/${id}`
      })
    })
  } catch {
    // ignore
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return origin ? `${origin}/gl/${code}` : `/gl/${code}`
}

async function fileToImageBitmap(file: File) {
  return await createImageBitmap(file)
}

async function compressToJpeg2MP(file: File, maxPixels = 2_000_000, maxBytes = 2_500_000): Promise<Blob> {
  const bmp = await fileToImageBitmap(file)
  const srcW = bmp.width
  const srcH = bmp.height
  const srcPixels = srcW * srcH

  // Scale down to meet maxPixels (2MP) while preserving aspect ratio
  let scale = 1
  if (srcPixels > maxPixels) scale = Math.sqrt(maxPixels / srcPixels)

  // Also cap the longest side
  const maxLongSide = 2200
  const longSide = Math.max(srcW, srcH)
  if (longSide * scale > maxLongSide) scale = maxLongSide / longSide

  const dstW = Math.max(1, Math.round(srcW * scale))
  const dstH = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = dstW
  canvas.height = dstH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas not supported')
  ctx.drawImage(bmp, 0, 0, dstW, dstH)

  // Try a few quality levels to stay under maxBytes
  const qualities = [0.86, 0.82, 0.78, 0.72, 0.66, 0.6]
  for (const q of qualities) {
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', q)
    )
    if (blob.size <= maxBytes) return blob
  }

  const finalBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.55)
  )
  return finalBlob
}

function parseTime(t?: string | null) {
  if (!t) return 0
  const ms = new Date(t).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function formatCountdown(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  if (mm >= 60) {
    const hh = Math.floor(mm / 60)
    const m2 = mm % 60
    return `${hh}:${String(m2).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export default function GalleryClient({
  initialItems,
  galleryId,
  uploadEnabled,
  eventId
}: {
  initialItems: any[]
  galleryId: string
  uploadEnabled: boolean
  eventId: string
}) {
  const deviceId = useMemo(() => getOrCreateDeviceId(), [])

  const [items, setItems] = useState<Item[]>(
    (initialItems || []).map((x: any) => ({
      id: x.id,
      url: x.url || x.media_url || x.public_url || '',
      thumb_url: x.thumb_url || null,
      created_at: x.created_at,
      editable_until: x.editable_until ?? null,
      uploader_device_id: x.uploader_device_id ?? null,
      is_approved: x.is_approved ?? true,
      crop_position: x.crop_position ?? null
    }))
  )

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [showAll, setShowAll] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [lightbox, setLightbox] = useState<string | null>(null)

  const [nowTick, setNowTick] = useState(Date.now())

  const replaceForIdRef = useRef<string | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Update countdown every second while component is mounted
    const t = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const feed = useMemo(() => {
    const src = showAll ? items : items.filter(x => x.is_approved !== false)
    return src
  }, [items, showAll])

  function canEdit(it: Item) {
    if (!it) return false
    if (!it.uploader_device_id || it.uploader_device_id !== deviceId) return false

    const until =
      parseTime(it.editable_until) ||
      (parseTime(it.created_at) ? parseTime(it.created_at) + 60 * 60 * 1000 : 0)

    return until > Date.now()
  }

  function msLeft(it: Item) {
    const until =
      parseTime(it.editable_until) ||
      (parseTime(it.created_at) ? parseTime(it.created_at) + 60 * 60 * 1000 : 0)
    return until - nowTick
  }

  async function refreshApproved() {
    try {
      const res = await fetch(`/api/public/gallery-items?event=${encodeURIComponent(eventId)}&gallery_id=${encodeURIComponent(galleryId)}`, {
        cache: 'no-store'
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) return
      const incoming: Item[] = (j.items || []).map((x: any) => ({
        id: x.id,
        url: x.url || x.public_url || '',
        thumb_url: x.thumb_url || null,
        created_at: x.created_at,
        editable_until: x.editable_until ?? null,
        uploader_device_id: x.uploader_device_id ?? null,
        is_approved: x.is_approved ?? true,
        crop_position: x.crop_position ?? null
      }))
      setItems(prev => {
        // merge by id (keep local items that may be pending)
        const map = new Map<string, Item>()
        for (const p of prev) map.set(p.id, p)
        for (const n of incoming) map.set(n.id, n)
        return Array.from(map.values()).sort((a, b) => (parseTime(b.created_at) || 0) - (parseTime(a.created_at) || 0))
      })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    // self-heal refresh on mount + when galleryId changes
    refreshApproved()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, eventId])

  function onFilesChange(list: FileList | null) {
    const arr = Array.from(list || [])
    setFiles(arr)
  }

  async function doUpload(fileList: File[]) {
    setErr(null)
    setMsg(null)
    if (!uploadEnabled) return
    if (!fileList.length) return
    setBusy(true)
    try {
      for (const file of fileList) {
        const out = eventId
        const fd = new FormData()

        // Reduce file size client-side (helps mobile)
        const blob = await compressToJpeg2MP(file)
        const uploadFile = new File([blob], file.name.replace(/\.[^./]+$/, '') + '.jpg', { type: 'image/jpeg' })

        fd.append('file', uploadFile)
        fd.append('event', out)
        fd.append('kind', 'gallery')
        fd.append('gallery_id', galleryId)
        fd.append('device_id', deviceId)

        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error || 'upload failed')

        const created: Item = {
          id: j?.item?.id || crypto.randomUUID(),
          url: j?.item?.url || '',
          thumb_url: j?.item?.thumb_url || null,
          created_at: j?.item?.created_at || new Date().toISOString(),
          editable_until: j?.item?.editable_until ?? null,
          uploader_device_id: j?.item?.uploader_device_id ?? deviceId,
          is_approved: true,
          crop_position: j?.item?.crop_position ?? null
        }

        setItems(prev => [created, ...prev])
      }

      setFiles([])
      setMsg('✅ הועלה בהצלחה')
      // Pull approved list from server (source of truth)
      refreshApproved()
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בהעלאה')
    } finally {
      setBusy(false)
    }
  }

  async function onUpload() {
    await doUpload(files)
  }

  async function onDelete(it: Item) {
    if (!canEdit(it)) return
    const ok = confirm('למחוק את התמונה?')
    if (!ok) return

    try {
      setBusy(true)
      const res = await fetch('/api/public/media-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: it.id, event: eventId, device_id: deviceId })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'delete failed')
      setItems(prev => prev.filter(x => x.id !== it.id))
      setMsg('✅ נמחק')
    } catch (e: any) {
      setErr(e?.message || 'שגיאה במחיקה')
    } finally {
      setBusy(false)
    }
  }

  function pickReplace(it: Item) {
    if (!canEdit(it)) return
    replaceForIdRef.current = it.id
    replaceInputRef.current?.click()
  }

  async function onReplaceSelected(list: FileList | null) {
    const f = list?.[0]
    const oldId = replaceForIdRef.current
    replaceForIdRef.current = null
    if (!f || !oldId) return
    // Upload new, then delete old (keeps UX simple)
    await doUpload([f])
    const old = items.find(x => x.id === oldId)
    if (old) await onDelete(old)
    // reset input
    if (replaceInputRef.current) replaceInputRef.current.value = ''
  }

  async function shareItem(it: Item) {
    const short = await ensureShortLinkForMedia(it.id)
    if (short) await shareUrl(short)
    else await shareUrl(it.url)
  }

  function onThumbClick(it: Item) {
    if (selectMode) {
      setSelected(prev => ({ ...prev, [it.id]: !prev[it.id] }))
      return
    }
    setLightbox(it.url)
  }

  async function downloadSelectedAsZip() {
    const ids = Object.keys(selected).filter(k => selected[k])
    const sel = feed.filter(x => ids.includes(x.id))
    if (!sel.length) return

    setBusy(true)
    setErr(null)
    try {
      const zip = new JSZip()
      for (const it of sel) {
        const res = await fetch(it.url)
        const blob = await res.blob()
        const fileName = (it.url.split('/').pop() || it.id).split('?')[0] || it.id
        zip.file(fileName, blob)
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const blobUrl = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `gallery_${galleryId}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500)
      setSelected({})
      setSelectMode(false)
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בהורדה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div dir="rtl" className="grid gap-4">
      <Card>
        <div dir="rtl" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-right">
            <h3 className="text-lg font-semibold">תמונות בגלריה</h3>
            <p className="text-sm text-zinc-600">בחרו/צלמו והעלו תמונה לגלריה</p>
          </div>

          <div className="flex items-center gap-2 justify-start">
            <Button
              // Our UI Button supports only: 'primary' | 'ghost'
              // 'primary' = black filled, 'ghost' = subtle/transparent
              variant={selectMode ? 'primary' : 'ghost'}
              onClick={() => {
                setSelectMode(v => !v)
                setSelected({})
              }}
              type="button"
            >
              {selectMode ? 'סיום בחירה' : 'בחר תמונות'}
            </Button>

            {selectMode ? (
              <Button onClick={downloadSelectedAsZip} type="button" disabled={busy}>
                הורד נבחרות
              </Button>
            ) : null}
          </div>
        </div>

        {uploadEnabled ? (
          <div className="mt-4 grid gap-3">
            <div dir="rtl" className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 justify-start">
                <input
                  className="hidden"
                  ref={replaceInputRef}
                  type="file"
                  accept="image/*"
                  onChange={e => onReplaceSelected(e.target.files)}
                />

                <input
                  className="hidden"
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => {
                    const f = e.target.files ? Array.from(e.target.files) : []
                    if (cameraInputRef.current) cameraInputRef.current.value = ''
                    if (f.length) doUpload(f)
                  }}
                />

                <Button type="button" variant="ghost" onClick={() => cameraInputRef.current?.click()} disabled={busy}>
                  צלם תמונה
                </Button>

                <label className="cursor-pointer">
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={e => onFilesChange(e.target.files)}
                  />
                  <span className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm hover:bg-white">
                    יש לבחור קבצים
                  </span>
                </label>
              </div>

              <Button onClick={onUpload} type="button" disabled={busy || !files.length}>
                {busy ? 'מעלה…' : 'העלה'}
              </Button>

              <div className="text-sm text-zinc-600">{files.length ? `${files.length} קבצים נבחרו` : 'לא נבחר קובץ'}</div>
            </div>

            {err ? <div className="text-sm text-red-600">{err}</div> : null}
            {msg ? <div className="text-sm text-green-700">{msg}</div> : null}
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-600">העלאה פתוחה רק אם מנהל פתח אותה.</div>
        )}
      </Card>

      {lightbox ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div />
              <Button className="bg-white text-black shadow hover:bg-white" type="button" onClick={() => setLightbox(null)}>
                סגור
              </Button>
            </div>

            <img src={lightbox} alt="" className="w-full rounded-2xl bg-white" />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {feed.map(it => {
          const edit = canEdit(it)
          const left = msLeft(it)
          return (
            <div key={it.id} className="rounded-2xl border border-zinc-200 overflow-hidden">
              <button
                className="relative block aspect-square w-full bg-zinc-50"
                onClick={() => onThumbClick(it)}
                type="button"
              >
                <img
                  src={it.thumb_url || it.url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: it.crop_position || 'center' }}
                />

                {selectMode ? (
                  <div className="absolute left-2 top-2">
                    <div
                      className={`h-7 w-7 rounded-full border bg-white/90 flex items-center justify-center text-sm ${selected[it.id] ? 'font-bold' : ''}`}
                      aria-hidden
                    >
                      {selected[it.id] ? '✓' : ''}
                    </div>
                  </div>
                ) : null}
              </button>

              <div className="p-3 grid gap-2">
                {!selectMode ? (
                  <>
                    <div dir="rtl" className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => shareItem(it)} type="button">
                          שתף
                        </Button>
                        <Button variant="ghost" onClick={() => downloadUrl(it.url)} type="button">
                          הורד
                        </Button>
                      </div>

                      {edit ? (
                        <div className="text-xs text-zinc-600 flex items-center gap-1">
                          <span>⏳</span>
                          <span>{formatCountdown(left)}</span>
                        </div>
                      ) : null}
                    </div>

                    {edit ? (
                      <div className="flex items-right gap-2">
                        <Button variant="ghost" onClick={() => pickReplace(it)} type="button" disabled={busy}>
                          עריכה
                        </Button>
                        <Button variant="ghost" onClick={() => onDelete(it)} type="button" disabled={busy}>
                          מחיקה
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-zinc-500">מצב בחירה פעיל</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {feed.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-600">אין עדיין תמונות מאושרות.</p>
        </Card>
      ) : null}
    </div>
  )
}
