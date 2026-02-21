'use client'

import React, { useMemo, useRef, useState } from 'react'
import { Button, Card } from '@/components/ui'

type Item = {
  id: string
  url: string
  created_at?: string
  editable_until?: string | null
  is_approved?: boolean
  crop_position?: string | null
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
        targetPath: `/media/${id}`,
      }),
    })
  } catch {
    // ignore
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return origin ? `${origin}/gl/${code}` : `/gl/${code}`
}

async function fileToImageBitmap(file: File) {
  // createImageBitmap is fast and widely supported
  return await createImageBitmap(file)
}

async function compressToJpeg2MP(file: File, maxPixels = 2_000_000, maxBytes = 2_500_000): Promise<Blob> {
  const bmp = await fileToImageBitmap(file)
  const srcW = bmp.width
  const srcH = bmp.height
  const srcPixels = srcW * srcH

  // Scale down to meet maxPixels (2MP) while preserving aspect ratio
  let scale = 1
  if (srcPixels > maxPixels) {
    scale = Math.sqrt(maxPixels / srcPixels)
  }

  // Also cap the longest side (helps very tall/wide images)
  const maxLongSide = 2200
  const longSide = Math.max(srcW, srcH)
  if (longSide * scale > maxLongSide) {
    scale = maxLongSide / longSide
  }

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

  // Last resort: return lowest quality blob
  const finalBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.55)
  )
  return finalBlob
}

export function GalleryClient({
  initialItems,
  galleryId,
  uploadEnabled
}: {
  initialItems: any[]
  galleryId: string
  uploadEnabled: boolean
}) {
  const [items, setItems] = useState<Item[]>(
    (initialItems || []).map((x: any) => ({
      id: x.id,
      url: x.url || x.media_url || x.public_url || '',
      created_at: x.created_at,
      editable_until: x.editable_until ?? null,
      is_approved: x.is_approved ?? true,
      crop_position: x.crop_position ?? null
    }))
  )
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const pickerRef = useRef<HTMLInputElement | null>(null)

  const feed = useMemo(() => (items || []).filter(i => i.url), [items])

  async function shareItem(it: Item) {
    const short = await ensureShortLinkForMedia(it.id)
    await shareUrl(short || it.url)
  }

  function addFiles(list: FileList | null) {
    const arr = Array.from(list || []).filter(f => (f.type || '').startsWith('image/'))
    if (arr.length === 0) return
    setFiles(prev => [...prev, ...arr].slice(0, 50))
  }

  async function upload() {
    if (!uploadEnabled) {
      setErr('העלאה סגורה כרגע ע״י מנהל')
      return
    }
    if (files.length === 0) return
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
            for (const f of files) {
        const blob = await compressToJpeg2MP(f)
        const out = new File([blob], (f.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })

        const fd = new FormData()
        fd.append('file', out)
        fd.append('kind', 'gallery')
        fd.append('gallery_id', galleryId)

        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error || 'upload failed')

        if (j?.publicUrl) {
          const created: Item = { id: j.path || crypto.randomUUID(), url: j.publicUrl, created_at: new Date().toISOString(), is_approved: !!j.is_approved }
          if (j.is_approved) {
            setItems(prev => [created, ...prev])
          } else {
            setMsg('✅ הועלה וממתין לאישור מנהל')
          }
        }
      }
      setFiles([])
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בהעלאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div dir="rtl" className="grid gap-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
          <div className="text-right">
            <h3 className="text-lg font-semibold">תמונות בגלריה</h3>
            <p className="text-sm text-zinc-600">העלאה פתוחה רק אם מנהל פתח אותה.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
            <Button onClick={upload} disabled={busy || files.length === 0 || !uploadEnabled} className="sm:w-44">
              {busy ? 'מעלה...' : `העלה ${files.length || ''}`}
            </Button>
            <input
              ref={pickerRef}
              type="file"
              accept="image/*"
              multiple
              onChange={e => addFiles(e.target.files)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              disabled={!uploadEnabled}
            />
          </div>
        </div>

        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {msg && <p className="mt-2 text-sm text-zinc-700">{msg}</p>}
        {!uploadEnabled && <p className="mt-2 text-xs text-zinc-500">העלאה סגורה כעת.</p>}
      </Card>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <div className="relative mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => downloadUrl(lightbox)}
                className="bg-white/90 text-black shadow hover:bg-white"
                type="button"
              >
                הורד
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  const current = feed.find(x => x.url === lightbox)
                  if (current) return shareItem(current)
                  return shareUrl(lightbox)
                }}
                className="bg-white/90 text-black shadow hover:bg-white"
                type="button"
              >
                שתף
              </Button>
              <Button
                variant="ghost"
                onClick={() => setLightbox(null)}
                className="bg-white/90 text-black shadow hover:bg-white"
                type="button"
              >
                סגור
              </Button>
            </div>

            <img src={lightbox} alt="" className="w-full rounded-2xl bg-white" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {feed.map(it => (
          <div key={it.id} className="rounded-2xl border border-zinc-200 overflow-hidden">
            <button
              className="relative block w-full pt-[100%] bg-zinc-50"
              onClick={() => setLightbox(it.url)}
              type="button"
            >
              <img src={it.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: (it.crop_position || 'center') }} />
            </button>

            <div className="p-3 flex gap-2">
              <Button variant="ghost" onClick={() => shareItem(it)} type="button">
                שתף
              </Button>
              <Button variant="ghost" onClick={() => downloadUrl(it.url)} type="button">
                הורד
              </Button>
            </div>
          </div>
        ))}
      </div>

      {feed.length === 0 && (
        <Card>
          <p className="text-sm text-zinc-600">אין עדיין תמונות מאושרות.</p>
        </Card>
      )}
    </div>
  )
}

export default GalleryClient
