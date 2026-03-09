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
  reaction_counts?: Record<string, number>
  my_reactions?: string[]
}

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const escaped = name.replace(/[-.$?*|{}()\[\]\\/+^]/g, '\\$&')
  const m = document.cookie.match(new RegExp('(^|; )' + escaped + '=([^;]*)'))
  return m ? decodeURIComponent(m[2]) : null
}

function getLocalDeviceId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem('device_id')
  } catch {
    return null
  }
}

function ensureDeviceId(): string | null {
  const fromCookie = getCookie('device_id')
  const fromLocal = getLocalDeviceId()
  const existing = fromCookie || fromLocal
  if (existing) {
    try {
      if (!fromLocal) window.localStorage.setItem('device_id', existing)
      if (!fromCookie) document.cookie = `device_id=${encodeURIComponent(existing)}; path=/; max-age=31536000; samesite=lax`
    } catch {}
    return existing
  }
  try {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem('device_id', id)
    document.cookie = `device_id=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
    return id
  } catch {
    return null
  }
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

async function ensureShortLinkForMedia(mediaItemId: string, eventId?: string | null) {
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
        eventId: eventId || undefined,
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
  return await createImageBitmap(file)
}

async function compressToJpeg2MP(file: File, maxPixels = 2_000_000, maxBytes = 2_500_000): Promise<Blob> {
  const bmp = await fileToImageBitmap(file)
  const srcW = bmp.width
  const srcH = bmp.height
  const srcPixels = srcW * srcH

  let scale = 1
  if (srcPixels > maxPixels) scale = Math.sqrt(maxPixels / srcPixels)

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

function mapItem(x: any): Item {
  return {
    id: x.id,
    url: x.url || x.media_url || x.public_url || '',
    thumb_url: x.thumb_url || x.url || x.media_url || x.public_url || '',
    created_at: x.created_at,
    editable_until: x.editable_until ?? null,
    uploader_device_id: x.uploader_device_id ?? null,
    is_approved: x.is_approved ?? true,
    crop_position: x.crop_position ?? null,
    reaction_counts: x.reaction_counts || { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
    my_reactions: x.my_reactions || []
  }
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
  const [items, setItems] = useState<Item[]>((initialItems || []).map(mapItem))
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<Item | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [nowTs, setNowTs] = useState<number>(Date.now())
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [zipBusy, setZipBusy] = useState(false)

  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const pickerRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setItems((initialItems || []).map(mapItem))
  }, [galleryId, initialItems])

  useEffect(() => {
    setDeviceId(ensureDeviceId())
    const t = window.setInterval(() => setNowTs(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function pull() {
      try {
        const qs = new URLSearchParams({ event: String(eventId), gallery_id: String(galleryId) })
        const res = await fetch(`/api/public/gallery-items?${qs.toString()}&ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json().catch(() => ({}))
        const next = Array.isArray(j?.items) ? j.items.map(mapItem) : []
        if (cancelled) return
        setItems(next)
        setLightbox(prev => {
          if (!prev) return prev
          const fresh = next.find((x: Item) => x.id === prev.id)
          return fresh || null
        })
      } catch {
        // ignore
      }
    }
    pull()
    const t = window.setInterval(pull, 15000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [eventId, galleryId])

  function canManageItem(it?: Item | null) {
    const until = it?.editable_until ? new Date(it.editable_until).getTime() : 0
    if (!it || !until || !it.uploader_device_id || !deviceId) return false
    return deviceId === it.uploader_device_id && nowTs < until
  }

  function secondsLeftFor(it?: Item | null) {
    const until = it?.editable_until ? new Date(it.editable_until).getTime() : 0
    return Math.max(0, Math.floor((until - nowTs) / 1000))
  }

  function fmtMMSS(sec: number) {
    const s = Math.max(0, sec | 0)
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  const DIRECT_MAX = 8
  const ZIP_MAX = 20
  const selectedCount = useMemo(() => Object.keys(selected).length, [selected])
  const isIOSSafari = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
    const safari = /^((?!chrome|android).)*safari/i.test(ua)
    return iOS && safari
  }, [])
  const useDirect = selectedCount > 0 && selectedCount <= DIRECT_MAX && !isIOSSafari
  const feed = useMemo(() => (items || []).filter(i => i.url), [items])

  const clearSelected = () => setSelected({})

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

  async function shareItem(it: Item) {
    const short = await ensureShortLinkForMedia(it.id, eventId)
    await shareUrl(short || it.url)
  }

  async function toggleReaction(itemId: string, emoji: string) {
    setErr(null)
    try {
      const res = await fetch('/api/reactions/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post_id: itemId, emoji })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'שגיאה')
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, reaction_counts: j.counts || it.reaction_counts, my_reactions: j.my || it.my_reactions } : it))
      setLightbox(prev => prev?.id === itemId ? { ...prev, reaction_counts: j.counts || prev.reaction_counts, my_reactions: j.my || prev.my_reactions } : prev)
    } catch (e: any) {
      setErr(e?.message || 'שגיאה')
    }
  }

  function addFiles(list: FileList | null) {
    const arr = Array.from(list || []).filter(f => (f.type || '').startsWith('image/'))
    if (arr.length === 0) return
    if (lightbox && arr.length === 1 && canManageItem(lightbox)) {
      replaceItem(lightbox, arr[0])
      return
    }
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
          const created: Item = {
            id: j.id || j.path || crypto.randomUUID(),
            url: j.publicUrl,
            thumb_url: j.thumbUrl || j.publicUrl,
            created_at: new Date().toISOString(),
            editable_until: j.editable_until || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            uploader_device_id: deviceId,
            is_approved: !!j.is_approved,
            reaction_counts: { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
            my_reactions: []
          }
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
      const created: Item = {
        id: j.id || j.path || crypto.randomUUID(),
        url: j.publicUrl,
        thumb_url: j.thumbUrl || j.publicUrl,
        created_at: new Date().toISOString(),
        editable_until: j.editable_until || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        is_approved: !!j.is_approved,
        uploader_device_id: deviceId,
        reaction_counts: { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
        my_reactions: []
      }
      await fetch('/api/public/media-delete', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: it.id, device_id: deviceId }) })
      setItems(prev => [created, ...prev.filter(x => x.id !== it.id)])
      setLightbox(created)
      setMsg('✅ עודכן')
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בעריכה')
    } finally {
      setBusy(false)
      if (replaceInputRef.current) replaceInputRef.current.value = ''
    }
  }

  const downloadSelectedDirect = async () => {
    try {
      setErr(null)
      setMsg(null)
      const ids = Object.keys(selected)
      if (ids.length === 0) return
      setZipBusy(true)
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
              📷 צלם תמונה
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

        <div className="mt-3 flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
          {!selectMode ? (
            <Button variant="ghost" onClick={() => { setErr(null); setMsg(null); clearSelected(); setSelectMode(true) }} disabled={zipBusy}>
              בחר תמונות
            </Button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
              <Button onClick={useDirect ? downloadSelectedDirect : downloadSelectedZip} disabled={zipBusy || selectedCount === 0}>
                {zipBusy ? (useDirect ? 'מוריד…' : 'מכין ZIP…') : (selectedCount <= DIRECT_MAX ? `הורד ישיר (${selectedCount}/${DIRECT_MAX})` : `הורד ZIP (${selectedCount}/${ZIP_MAX})`)}
              </Button>
              <Button variant="ghost" onClick={() => { setSelectMode(false); clearSelected(); setErr(null); setMsg(null) }} disabled={zipBusy}>
                ביטול
              </Button>
            </div>
          )}

          {selectMode ? (
            <p className="text-xs text-zinc-500 text-right">סמן עד {ZIP_MAX} תמונות. 1–{DIRECT_MAX} יורד ישיר, {DIRECT_MAX + 1}–{ZIP_MAX} יורד ZIP. אחרי הורדה אפשר לבחור שוב.</p>
          ) : <span />}
        </div>

        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {msg && <p className="mt-2 text-sm text-zinc-700">{msg}</p>}
        {!uploadEnabled && <p className="mt-2 text-xs text-zinc-500">העלאה סגורה כעת.</p>}
      </Card>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <div className="relative mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" onClick={() => setLightbox(null)} className="absolute left-2 top-2 z-10 bg-white/90 text-black shadow hover:bg-white" type="button">
              סגור
            </Button>

            <img src={lightbox.url} alt="" className="w-full rounded-2xl bg-white" />

            <div className="mt-3 rounded-2xl bg-white/95 p-3 shadow-lg" dir="rtl">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {EMOJIS.map(emo => {
                  const active = (lightbox.my_reactions || []).includes(emo)
                  const c = (lightbox.reaction_counts || {})[emo] || 0
                  return (
                    <Button key={emo} variant={active ? 'primary' : 'ghost'} className="min-w-[54px] rounded-full px-3" onClick={() => toggleReaction(lightbox.id, emo)} type="button">
                      {c ? `${c} ` : ''}{emo}
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
          <div key={it.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <button className="relative block aspect-square w-full bg-zinc-50" onClick={() => onThumbClick(it)} type="button">
              <img src={it.thumb_url || it.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: (it.crop_position || 'center') as any }} />
              {selectMode ? (
                <div className="absolute left-2 top-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border bg-white/90 text-sm ${selected[it.id] ? 'font-bold' : ''}`} aria-hidden>
                    {selected[it.id] ? '✓' : ''}
                  </div>
                </div>
              ) : null}
            </button>
            <div className="p-2">
              {selectMode ? (
                <span className="text-xs text-zinc-500">מצב בחירה פעיל</span>
              ) : (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <button type="button" className="rounded-full border px-2 py-1" onClick={() => shareItem(it)}>שתף</button>
                  <button type="button" className="rounded-full border px-2 py-1" onClick={() => downloadUrl(it.url)}>הורד</button>
                  <button type="button" className="rounded-full border px-2 py-1" onClick={() => setLightbox(it)}>אימוג׳י</button>
                </div>
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
