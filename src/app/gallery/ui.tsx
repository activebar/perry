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
  is_approved?: boolean
  crop_position?: string | null
  uploader_device_id?: string | null
  reaction_counts?: Record<string, number>
  my_reactions?: string[]
}

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

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


function readCookie(name: string) {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[$()*+.?[\\]^{|}]/g, '\\$&') + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

function getClientDeviceId() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('device_id') || readCookie('device_id')
}

function secondsLeftFor(item?: Item | null) {
  if (!item?.editable_until) return 0
  const ms = new Date(item.editable_until).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / 1000))
}

function fmtMMSS(sec: number) {
  const s = Math.max(0, sec | 0)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function getTopReaction(counts?: Record<string, number> | null) {
  const bag = counts || {}
  let bestEmoji = ''
  let bestCount = 0
  for (const emoji of EMOJIS) {
    const count = Number(bag[emoji] || 0)
    if (count > bestCount) {
      bestEmoji = emoji
      bestCount = count
    }
  }
  return bestCount > 0 ? { emoji: bestEmoji, count: bestCount } : null
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
  const [items, setItems] = useState<Item[]>(
    (initialItems || []).map((x: any) => ({
      id: x.id,
      url: x.url || x.media_url || x.public_url || '',
      thumb_url: x.thumb_url || x.url || x.media_url || x.public_url || '',
      created_at: x.created_at,
      editable_until: x.editable_until ?? null,
      is_approved: x.is_approved ?? true,
      crop_position: x.crop_position ?? null,
      uploader_device_id: x.uploader_device_id ?? null,
      reaction_counts: x.reaction_counts || {},
      my_reactions: x.my_reactions || []
    }))
  )
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<Item | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)

  // Keep state in sync when navigating between galleries.
  useEffect(() => {
    setItems(
      (initialItems || []).map((x: any) => ({
        id: x.id,
        url: x.url || x.media_url || x.public_url || '',
        thumb_url: x.thumb_url || x.url || x.media_url || x.public_url || '',
        created_at: x.created_at,
        editable_until: x.editable_until ?? null,
        is_approved: x.is_approved ?? true,
        crop_position: x.crop_position ?? null,
        uploader_device_id: x.uploader_device_id ?? null,
        reaction_counts: x.reaction_counts || {},
        my_reactions: x.my_reactions || []
      }))
    )
  }, [galleryId, initialItems])


  useEffect(() => {
    let id = getClientDeviceId()
    if (!id && typeof window !== 'undefined' && typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      id = crypto.randomUUID()
      try { window.localStorage.setItem('device_id', id) } catch {}
      try { document.cookie = `device_id=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax` } catch {}
    }
    setDeviceId(id)
  }, [])

  const canManageItem = (it?: Item | null) => {
    if (!it || !it.editable_until || !it.uploader_device_id || !deviceId) return false
    return deviceId === it.uploader_device_id && secondsLeftFor(it) > 0
  }

  useEffect(() => {
    const ids = (items || []).map(it => String(it.id || '')).filter(Boolean)
    if (ids.length === 0) return
    let cancelled = false

    ;(async () => {
      try {
        const qs = new URLSearchParams({ ids: ids.join(',') })
        const res = await fetch(`/api/public/media-reactions?${qs.toString()}`, { cache: 'no-store' })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || cancelled) return
        const byId = (j?.by_id || {}) as Record<string, { counts?: Record<string, number>; my?: string[] }>
        setItems(prev =>
          (prev || []).map(it => ({
            ...it,
            reaction_counts: byId[it.id]?.counts || it.reaction_counts || {},
            my_reactions: byId[it.id]?.my || it.my_reactions || [],
          }))
        )
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [items.length, galleryId])

  // Self-heal (once): client navigation can occasionally hydrate with stale/empty server props.
  const healedRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${eventId}__${galleryId}`
    if (!eventId || !galleryId) return
    if (healedRef.current === key) return
    if ((items || []).length > 0) return

    healedRef.current = key

    ;(async () => {
      try {
        const qs = new URLSearchParams({
          event: String(eventId),
          gallery_id: String(galleryId)
        })
        const res = await fetch(`/api/public/gallery-items?${qs.toString()}`, {
          cache: 'no-store'
        })
        if (!res.ok) return
        const j = await res.json()
        const next = Array.isArray(j?.items) ? j.items : []
        setItems(
          next.map((x: any) => ({
            id: x.id,
            url: x.url || x.media_url || x.public_url || '',
            thumb_url: x.thumb_url || x.url || x.media_url || x.public_url || '',
            created_at: x.created_at,
            editable_until: x.editable_until ?? null,
            is_approved: x.is_approved ?? true,
            crop_position: x.crop_position ?? null,
            uploader_device_id: x.uploader_device_id ?? null,
            reaction_counts: x.reaction_counts || {},
            my_reactions: x.my_reactions || []
          }))
        )
      } catch {
        // ignore
      }
    })()
  }, [eventId, galleryId, initialItems, items])

  // Select + ZIP (client-side)
    const DIRECT_MAX = 8
    const ZIP_MAX = 20
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [zipBusy, setZipBusy] = useState(false)

  const selectedCount = useMemo(() => Object.keys(selected).length, [selected])

    const isIOSSafari = useMemo(() => {
      if (typeof navigator === 'undefined') return false
      const ua = navigator.userAgent || ''
      const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
      const safari = /^((?!chrome|android).)*safari/i.test(ua)
      return iOS && safari
    }, [])

    const useDirect = selectedCount > 0 && selectedCount <= DIRECT_MAX && !isIOSSafari


  const clearSelected = () => {
    setSelected({})
  }

  const toggleSelected = (id: string) => {
    setErr(null)
    setMsg(null)
    setSelected(prev => {
      const next = { ...prev }
      if (next[id]) {
        delete next[id]
        return next
      }
      if (Object.keys(next).length >= ZIP_MAX) {
        setErr(`אפשר לבחור עד ${ZIP_MAX} תמונות`)
        return next
      }
      next[id] = true
      return next
    })
  }

  const onThumbClick = (it: Item) => {
    if (selectMode) {
      toggleSelected(it.id)
      return
    }
    setLightbox(it)
  }

    const downloadSelectedDirect = async () => {
      try {
        setErr(null)
        setMsg(null)
        const ids = Object.keys(selected)
        if (ids.length === 0) return

        setZipBusy(true)

        // Direct download (1-8): fetch each file and force a short filename: activebar_01.jpg ...
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i]
          const it = items.find(x => x.id === id)
          if (!it?.url) continue

          const res = await fetch(it.url)
          if (!res.ok) throw new Error('download failed')
          const blob = await res.blob()
          const ext = blob.type === 'image/png' ? 'png' : 'jpg'
          const name = `activebar_${String(i + 1).padStart(2, '0')}.${ext}`

          const href = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = href
          a.download = name
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(href)

          // small delay so browsers don't block multiple downloads aggressively
          await new Promise(r => setTimeout(r, 250))
        }

        setMsg('✅ ההורדות התחילו')
        clearSelected()
        setSelectMode(false)
      } catch (e: any) {
        setErr(e?.message || 'שגיאה בהורדה')
      } finally {
        setZipBusy(false)
      }
    }

    const downloadSelectedZip = async () => {
    try {
      setErr(null)
      setMsg(null)
      const ids = Object.keys(selected)
      if (ids.length === 0) return

      setZipBusy(true)
      const zip = new JSZip()

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const it = items.find(x => x.id === id)
        if (!it?.url) continue
        const res = await fetch(it.url)
        const blob = await res.blob()
        const ext = blob.type === 'image/png' ? 'png' : 'jpg'
        zip.file(`activebar_${String(i + 1).padStart(2, '0')}.${ext}`, blob)
      }

      const out = await zip.generateAsync({ type: 'blob' })
      const href = URL.createObjectURL(out)
      const a = document.createElement('a')
      a.href = href
      a.download = `activebar_${(galleryId || '').slice(0, 6)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)

      setMsg('הורדת ZIP התחילה')
      clearSelected()
      setSelectMode(false)
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בהורדת ZIP')
    } finally {
      setZipBusy(false)
    }
  }


  const pickerRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)

  const feed = useMemo(() => (items || []).filter(i => i.url), [items])

  async function shareItem(it: Item) {
    const short = await ensureShortLinkForMedia(it.id)
    await shareUrl(short || it.url)
  }

  async function toggleReaction(it: Item, emoji: string) {
    try {
      const res = await fetch('/api/public/media-reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ media_item_id: it.id, emoji }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'reaction failed')
      setItems(prev =>
        (prev || []).map(x =>
          x.id === it.id
            ? { ...x, reaction_counts: j.counts || {}, my_reactions: j.my || [] }
            : x
        )
      )
      setLightbox(prev => (prev && prev.id === it.id ? { ...prev, reaction_counts: j.counts || {}, my_reactions: j.my || [] } : prev))
      setEmojiPickerFor(null)
    } catch {
      // ignore
    }
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
        if (deviceId) fd.append('device_id', deviceId)

        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error || 'upload failed')

        if (j?.publicUrl) {
          const created: Item = { id: j.id || j.path || crypto.randomUUID(), url: j.publicUrl, thumb_url: j.thumbUrl || j.publicUrl, created_at: new Date().toISOString(), editable_until: j.editable_until || new Date(Date.now()+60*60*1000).toISOString(), is_approved: !!j.is_approved, uploader_device_id: deviceId, reaction_counts: {}, my_reactions: [] }
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


  async function deleteItem(it: Item) {
    if (!canManageItem(it)) return
    if (!confirm('למחוק את התמונה?')) return
    setErr(null)
    setMsg(null)
    const res = await fetch('/api/public/media-delete', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: it.id, device_id: deviceId })
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(j?.error || 'שגיאה במחיקה')
      return
    }
    setItems(prev => prev.filter(x => x.id !== it.id))
    setLightbox(null)
    setMsg('✅ נמחק')
  }

  async function replaceItem(it: Item, file: File | null) {
    if (!it || !file || !canManageItem(it)) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const blob = await compressToJpeg2MP(file)
      const out = new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('file', out)
      fd.append('kind', 'gallery')
      fd.append('gallery_id', galleryId)
      if (deviceId) fd.append('device_id', deviceId)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'upload failed')
      const created: Item = { id: j.id || j.path || crypto.randomUUID(), url: j.publicUrl, thumb_url: j.thumbUrl || j.publicUrl, created_at: new Date().toISOString(), editable_until: j.editable_until || new Date(Date.now()+60*60*1000).toISOString(), is_approved: !!j.is_approved, uploader_device_id: deviceId, reaction_counts: {}, my_reactions: [] }
      await fetch('/api/public/media-delete', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: it.id, device_id: deviceId }) })
      setItems(prev => [created, ...prev.filter(x => x.id !== it.id)])
      setLightbox(created)
      setMsg('✅ עודכן')
    } catch (e:any) {
      setErr(e?.message || 'שגיאה בעריכה')
    } finally {
      setBusy(false)
      if (replaceInputRef.current) replaceInputRef.current.value = ''
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
            <Button type="button" variant="ghost" onClick={() => cameraRef.current?.click()} disabled={!uploadEnabled} className="sm:w-44">
              צלם תמונה
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
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => addFiles(e.target.files)}
              className="hidden"
              disabled={!uploadEnabled}
            />
          </div>
        </div>

        {/* Select + ZIP */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
          {!selectMode ? (
            <Button
              variant="ghost"
              onClick={() => {
                setErr(null)
                setMsg(null)
                clearSelected()
                setSelectMode(true)
              }}
              disabled={zipBusy}
            >
              בחר תמונות
            </Button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
              <Button onClick={useDirect ? downloadSelectedDirect : downloadSelectedZip} disabled={zipBusy || selectedCount === 0}>
                {zipBusy ? (useDirect ? 'מוריד…' : 'מכין ZIP…') : (selectedCount <= DIRECT_MAX ? `הורד ישיר (${selectedCount}/${DIRECT_MAX})` : `הורד ZIP (${selectedCount}/${ZIP_MAX})`)}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectMode(false)
                  clearSelected()
                  setErr(null)
                  setMsg(null)
                }}
                disabled={zipBusy}
              >
                ביטול
              </Button>
            </div>
          )}

          {selectMode ? (
            <p className="text-xs text-zinc-500 text-right">סמן עד {ZIP_MAX} תמונות. 1–{DIRECT_MAX} יורד ישיר, {DIRECT_MAX + 1}–{ZIP_MAX} יורד ZIP. אחרי הורדה אפשר לבחור שוב.</p>
          ) : (
            <span />
          )}
        </div>

        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {msg && <p className="mt-2 text-sm text-zinc-700">{msg}</p>}
        {!uploadEnabled && <p className="mt-2 text-xs text-zinc-500">העלאה סגורה כעת.</p>}
      </Card>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <div className="relative mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
            <Button
              variant="ghost"
              onClick={() => setLightbox(null)}
              className="absolute left-2 top-2 z-10 bg-white/90 text-black shadow hover:bg-white"
              type="button"
            >
              סגור
            </Button>

            <img src={lightbox.url} alt="" className="w-full rounded-2xl bg-white" />

            <div className="mt-3 rounded-2xl bg-white/95 p-3 shadow-lg" dir="rtl">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {EMOJIS.map(emoji => {
                  const active = (lightbox.my_reactions || []).includes(emoji)
                  const count = Number((lightbox.reaction_counts || {})[emoji] || 0)
                  return (
                    <Button key={emoji} variant={active ? 'primary' : 'ghost'} onClick={() => toggleReaction(lightbox, emoji)} type="button">
                      {count ? `${count} ` : ''}{emoji}
                    </Button>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {canManageItem(lightbox) ? <span className="text-xs text-zinc-500">⏳ {fmtMMSS(secondsLeftFor(lightbox))}</span> : null}
                {canManageItem(lightbox) ? (
                  <>
                    <Button variant="ghost" type="button" onClick={() => replaceInputRef.current?.click()}>עריכה</Button>
                    <Button variant="ghost" type="button" onClick={() => deleteItem(lightbox)}>מחק</Button>
                  </>
                ) : null}
                <Button variant="ghost" onClick={() => downloadUrl(lightbox.url)} type="button">הורד</Button>
                <Button variant="ghost" onClick={() => shareItem(lightbox)} type="button">שתף</Button>
              </div>
              <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={e => replaceItem(lightbox, e.target.files?.[0] || null)} />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {feed.map(it => (
          <div key={it.id} className="rounded-2xl border border-zinc-200 overflow-hidden">
            <button
              className="relative block aspect-square w-full bg-zinc-50"
              onClick={() => onThumbClick(it)}
              type="button"
            >
              <img src={it.thumb_url || it.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: (it.crop_position || 'center') }} />

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

              {!selectMode && getTopReaction(it.reaction_counts) ? (
                <div className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-medium shadow">
                  {getTopReaction(it.reaction_counts)?.emoji} {getTopReaction(it.reaction_counts)?.count}
                </div>
              ) : null}
            </button>

            <div className="p-3 space-y-2">
              {!selectMode ? (
                <>
                  <div className="flex items-center justify-between gap-2" dir="rtl">
                    <Button variant="ghost" onClick={() => downloadUrl(it.url)} type="button">הורד</Button>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" onClick={() => shareItem(it)} type="button">שתף</Button>
                      <Button variant={(it.my_reactions || []).length ? 'primary' : 'ghost'} onClick={() => setEmojiPickerFor(prev => prev === it.id ? null : it.id)} type="button">🙂</Button>
                    </div>
                  </div>

                  {emojiPickerFor === it.id ? (
                    <div className="flex flex-wrap items-center justify-end gap-2" dir="rtl">
                      {EMOJIS.map(emoji => {
                        const active = (it.my_reactions || []).includes(emoji)
                        const count = Number((it.reaction_counts || {})[emoji] || 0)
                        return (
                          <Button key={emoji} variant={active ? 'primary' : 'ghost'} onClick={() => toggleReaction(it, emoji)} type="button">
                            {count ? `${count} ` : ''}{emoji}
                          </Button>
                        )
                      })}
                    </div>
                  ) : null}

                  {canManageItem(it) ? (
                    <div className="flex flex-wrap items-center justify-end gap-2" dir="rtl">
                      <span className="text-xs text-zinc-500">⏳ {fmtMMSS(secondsLeftFor(it))}</span>
                      <Button variant="ghost" onClick={() => { setLightbox(it); setTimeout(() => replaceInputRef.current?.click(), 0) }} type="button">עריכה</Button>
                      <Button variant="ghost" onClick={() => deleteItem(it)} type="button">מחק</Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-zinc-500">מצב בחירה פעיל</span>
              )}
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