'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type GalleryItem = {
  id: string
  url: string
  thumb_url?: string | null
  kind?: string | null
  created_at?: string | null
  editable_until?: string | null
  uploader_device_id?: string | null
}

type ReactionSummary = Record<string, number>

const EMOJIS = ['❤️', '🔥', '😍', '👏', '😂', '😮']

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

function isVideoUrl(url?: string | null) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url || '')
}

function formatRemaining(ms: number) {
  if (ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
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

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const attachInputRef = useRef<HTMLInputElement | null>(null)

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
    } catch {}
  }

  function canEdit(item: GalleryItem) {
    if (!item?.editable_until || !item?.uploader_device_id || !deviceId) return false
    const sameUploader = String(item.uploader_device_id) === String(deviceId)
    const until = new Date(String(item.editable_until)).getTime()
    return sameUploader && until > countdownNow
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
    } catch {}
  }

  async function uploadFiles(files: FileList | File[] | null, source: 'upload' | 'camera' | 'attach') {
    const list = Array.from(files || [])
    if (!list.length) return

    setBusy(true)
    setUploadProgress(0)
    setUploadLabel(source === 'camera' ? 'מעלה צילום...' : 'מעלה קבצים...')
    setMsg('')

    try {
      let pendingCount = 0
      let approvedCount = 0

      for (let i = 0; i < list.length; i++) {
        const file = list[i]
        const fd = new FormData()

        const isVideo = file.type.startsWith('video/')
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

        const up = await fetch('/api/upload', {
          method: 'POST',
          body: fd,
        })

        const upJson = await up.json().catch(() => ({}))
        if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')

        if (upJson?.is_approved === false) pendingCount += 1
        else approvedCount += 1

        const pct = Math.round(((i + 1) / list.length) * 100)
        setUploadProgress(pct)
        setUploadLabel(`מעלה קבצים... ${i + 1}/${list.length}`)
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
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (attachInputRef.current) attachInputRef.current.value = ''
    }
  }

  async function replaceFile(item: GalleryItem, file: File) {
    try {
      setEditingItemId(item.id)
      setMsg('מחליף קובץ...')

      const fd = new FormData()
      const isVideo = file.type.startsWith('video/')
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

      setReactionsByItem((prev) => {
        const current = { ...(prev[itemId] || {}) }
        current[emoji] = Number(json?.count || 0)
        if (current[emoji] <= 0) delete current[emoji]
        return { ...prev, [itemId]: current }
      })

      setMyReactionsByItem((prev) => {
        const current = new Set(prev[itemId] || [])
        if (json?.active) current.add(emoji)
        else current.delete(emoji)
        return { ...prev, [itemId]: Array.from(current) }
      })
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה בעדכון תגובה')
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
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-2xl font-bold">תמונות בגלריה</h2>
        <p className="mt-1 text-sm text-zinc-600">בחר תמונות לגלריה</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={!uploadEnabled || busy}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            title="צילום"
          >
            📷 צילום
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!uploadEnabled || busy}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            title="העלאת תמונות או סרטונים"
          >
            ⬆️ העלאה
          </button>

          <button
            type="button"
            onClick={() => attachInputRef.current?.click()}
            disabled={!uploadEnabled || busy}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            title="צירוף תמונה או סרטון"
          >
            📎 צירוף
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!uploadEnabled || busy}
              className="rounded-xl bg-zinc-700 px-8 py-3 text-white disabled:opacity-50"
            >
              {busy ? 'מעלה...' : 'העלה'}
            </button>

            <div className="text-sm text-zinc-700">
              {uploadEnabled ? 'אפשר להעלות תמונות או סרטונים' : 'העלאה סגורה כרגע'}
            </div>
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

          {msg ? <div className={`mt-4 text-sm ${msg.includes('שגיאה') ? 'text-red-600' : 'text-emerald-600'}`}>{msg}</div> : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => uploadFiles(e.target.files, 'upload')}
        />

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => uploadFiles(e.target.files, 'camera')}
        />

        <input
          ref={attachInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => uploadFiles(e.target.files, 'attach')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sortedItems.map((item) => {
          const thumb = item.thumb_url || item.url
          const video =
            isVideoUrl(item.url) || String(item.kind || '').toLowerCase().includes('video')
          const reactions = reactionsByItem[item.id] || {}
          const topReaction = Object.entries(reactions).sort((a, b) => b[1] - a[1])[0]
          const editable = canEdit(item)

          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
            >
              <button
                type="button"
                className="relative block aspect-square w-full bg-zinc-50"
                onClick={() => setPreview(item)}
              >
                {video ? (
                  <video
                    src={item.url}
                    className="absolute inset-0 h-full w-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={thumb}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
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
              </button>

              <div className="flex items-center justify-center gap-6 px-4 py-3 text-lg">
                <button
                  type="button"
                  className="transition hover:scale-110"
                  onClick={() => shareItem(item)}
                  title="שיתוף"
                >
                  🔗
                </button>

                <a
                  href={item.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="transition hover:scale-110"
                  title="הורדה"
                >
                  ⬇️
                </a>

                <button
                  type="button"
                  className="transition hover:scale-110"
                  onClick={() => setPreview(item)}
                  title="תגובות"
                >
                  😊
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
            className="relative w-full max-w-4xl rounded-2xl bg-white p-4"
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
              {isVideoUrl(preview.url) || String(preview.kind || '').toLowerCase().includes('video') ? (
                <video
                  src={preview.url}
                  controls
                  playsInline
                  className="max-h-[70vh] w-full bg-black object-contain"
                />
              ) : (
                <img
                  src={preview.url}
                  alt=""
                  className="max-h-[70vh] w-full object-contain"
                />
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => shareItem(preview)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
              >
                🔗 שיתוף
              </button>

              <a
                href={preview.url}
                download
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
              >
                ⬇️ הורדה
              </a>
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

            {canEdit(preview) ? (
              <div className="mt-5 flex flex-wrap gap-3">
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
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
