'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button, Card, Container, Input, Textarea } from '@/components/ui'
import ShareModal from '@/components/share/ShareModal'
import CropEditor from '@/components/CropEditor'
import { buildShareMessage } from '@/lib/share/buildShareMessage'
import { supabaseAnon } from '@/lib/supabase'

type Post = {
  id: string
  created_at: string
  author_name: string | null
  text: string | null
  media_url: string | null
  video_url: string | null
  link_url: string | null
  media_path?: string | null
  crop_position?: string | null
  crop_focus_x?: number | null
  crop_focus_y?: number | null
  status: string
  reaction_counts: Record<string, number>
  my_reactions: string[]
}
const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const
const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'error')
  return json
}

function friendlyError(msg: string) {
  if (!msg) return 'שגיאה'
  if (msg.includes('edit window expired')) return 'חלפה שעה — אי אפשר לערוך יותר.'
  if (msg.includes('delete window expired')) return 'חלפה שעה — אי אפשר למחוק יותר.'
  if (msg.includes('forbidden')) return 'אין הרשאה (רק מהמכשיר ששלח, לשעה).'
  return msg
}

function isVideo(url: string) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url || '')
}

function isVideoFile(f: File) {
  const type = String(f.type || '').toLowerCase()
  const name = String(f.name || '').toLowerCase()
  return type.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi|mpeg|mpg|3gp)$/i.test(name)
}
function objectPositionFromCrop(item: {
  crop_position?: string | null
  crop_focus_x?: number | null
  crop_focus_y?: number | null
}) {
  const x =
    typeof item.crop_focus_x === 'number'
      ? Math.max(0, Math.min(1, item.crop_focus_x))
      : null

  const y =
    typeof item.crop_focus_y === 'number'
      ? Math.max(0, Math.min(1, item.crop_focus_y))
      : null

  if (x != null && y != null) {
    return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`
  }

  if (item.crop_position === 'top') return '50% 12%'
  if (item.crop_position === 'bottom') return '50% 82%'
  return '50% 50%'
}

function validateSelectedMedia(file: File) {
  if (!file) return ''
  if (isVideoFile(file) && file.size > MAX_VIDEO_UPLOAD_BYTES) {
    return 'סרטון גדול מדי. כרגע ניתן לנסות direct upload לוידאו. אם ההעלאה נכשלה, נסה שוב או הקטן את הקובץ.'
  }
  return ''
}

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  // @ts-ignore
  if (typeof createImageBitmap === 'function') return await createImageBitmap(file)
  // Fallback for very old browsers
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas not supported')
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)
  // @ts-ignore
  return await createImageBitmap(canvas)
}

async function compressToJpeg2MP(file: File, maxPixels = 2_000_000, maxBytes = 2_500_000): Promise<File> {
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
  let blob: Blob | null = null
  for (const q of qualities) {
    blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', q)
    )
    if (blob && blob.size <= maxBytes) break
  }
  if (!blob) throw new Error('encode failed')

  const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}


function firstHttpUrl(input: string) {
  const s = String(input || '')
  const m = s.match(/https?:\/\/[^\s]+/i)
  if (!m) return ''
  let u = m[0].trim()

  // trim common trailing punctuation
  u = u.replace(/[\]\)\}\>,\.\!\?\:;]+$/g, '')
  return u
}

export default function BlessingsClient({
  initialFeed,
  settings,
  blocks,
  showHeader = true,
}: {
  initialFeed: Post[]
  settings?: any
  blocks?: any[]
  showHeader?: boolean
}) {
  const [items, setItems] = useState<Post[]>(initialFeed || [])
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTouched, setLinkTouched] = useState(false)
  const [file, setFile] = useState<File | null>(null)


  const pathname = usePathname()

  // URL pattern: /ido/blessings -> ["", "ido", "blessings"]
  const effectiveEventId = pathname?.split('/')[1] || null

  const eventQuery = effectiveEventId ? `?event=${encodeURIComponent(effectiveEventId)}` : ''

  // media pickers (mobile-friendly)
  const pickRef = useRef<HTMLInputElement | null>(null)
  const cameraPhotoRef = useRef<HTMLInputElement | null>(null)
  const cameraVideoRef = useRef<HTMLInputElement | null>(null)

  // auto-detect link from the text (WhatsApp-style)
  useEffect(() => {
    if (linkTouched) return
    const u = firstHttpUrl(text)
    if (u && u !== linkUrl) setLinkUrl(u)
    if (!u && linkUrl) setLinkUrl('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])


// edit (mine, within 1h)
  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<any | null>(null)
  const [editFile, setEditFile] = useState<File | null>(null)
  const [editRemoveMedia, setEditRemoveMedia] = useState(false)

  // full view for media
  const [lightbox, setLightbox] = useState<{ url: string; isVideo: boolean; post?: Post } | null>(null)

  // share modal (desktop fallback)
  const [shareOpen, setShareOpen] = useState(false)
  const [sharePayload, setSharePayload] = useState<{ message: string; link: string } | null>(null)

  async function triggerDownload(url: string) {
    // Mobile browsers and cross-origin assets often ignore <a download>. We try a blob download first.
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
      // Fallback: open in a new tab (user can long-press save on mobile)
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function canEditMine(p: any) {
    return !!p?.can_edit
  }
  function canDeleteMine(p: any) {
    return !!p?.can_delete
  }
  function canRepositionMine(p: any) {
    return !!p?.can_reposition
  }
  function secondsLeft(p: any) {
    const until = p?.editable_until
    if (!until) return 0
    const ms = new Date(until).getTime() - Date.now()
    if (!Number.isFinite(ms)) return 0
    return Math.max(0, Math.floor(ms / 1000))
  }
  function fmtMMSS(sec: number) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const editPickRef = useRef<HTMLInputElement | null>(null)
  const editCameraPhotoRef = useRef<HTMLInputElement | null>(null)
  const editCameraVideoRef = useRef<HTMLInputElement | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [focusDraft, setFocusDraft] = useState<any | null>(null)
  const [focusBusy, setFocusBusy] = useState(false)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // refresh list occasionally (helps when require_approval is on)
  useEffect(() => {
    let cancelled = false

    async function pull() {
      try {
        const res = await fetch(`/api/blessings/feed?ts=${Date.now()}${effectiveEventId ? `&event=${encodeURIComponent(effectiveEventId)}` : ''}`, { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json().catch(() => ({}))
        if (!cancelled && Array.isArray(j.items)) setItems(j.items)
      } catch {
        // ignore
      }
    }

    // immediate pull (important when SSR returns empty for any reason)
    pull()

    const t = setInterval(pull, 15000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])


async function directUploadVideo(file: File, kind: 'blessing' | 'gallery', galleryId?: string | null) {
  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'video/mp4',
      kind,
      event_id: effectiveEventId,
      gallery_id: galleryId || null,
    }),
  })
  const signJson = await signRes.json().catch(() => ({}))
  if (!signRes.ok) throw new Error(signJson?.error || 'שגיאה בהעלאת וידאו')
  const sb = supabaseAnon()
  const uploaded = await (sb.storage.from('uploads') as any).uploadToSignedUrl(
    String(signJson.path || ''),
    String(signJson.token || ''),
    file
  )
  if (uploaded?.error) throw uploaded.error
  return signJson
}

  async function submitBlessing() {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      let media_path: string | null = null
      let media_url: string | null = null
      let video_url: string | null = null

      if (file) {
        const mediaError = validateSelectedMedia(file)
        if (mediaError) throw new Error(mediaError)
        if (isVideoFile(file)) {
          const upJson = await directUploadVideo(file, 'blessing')
          media_path = upJson.path
          video_url = upJson.publicUrl
          media_url = null
        } else {
          const fd = new FormData()

          // Compress images client-side (2MP) to keep uploads fast & cheap (Supabase free tier)
          const outFile = await compressToJpeg2MP(file)

          fd.set('file', outFile)

          fd.set('kind', 'blessing')
          if (effectiveEventId) fd.append('event_id', effectiveEventId)
          const up = await fetch('/api/upload', { method: 'POST', body: fd })
          const upJson = await up.json().catch(() => ({}))
          if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')
          media_path = upJson.path
          media_url = upJson.publicUrl
          video_url = null
        }
      }

      const res = await jfetch(`/api/posts${eventQuery}`, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'blessing',
          author_name: author || null,
          text: text || null,
          link_url: linkUrl || null,
          media_path,
          media_url,
          video_url
        })
      })

      setItems(prev => [res.post as Post, ...prev])
      setAuthor('')
      setText('')
      setLinkUrl('')
      setLinkTouched(false)
      setFile(null)

      setMsg(res.status === 'pending' ? '✅ נשלח לאישור מנהל' : '✅ נשמר!')
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleReaction(post_id: string, emoji: string) {
    setErr(null)
    try {
      const res = await jfetch(`/api/reactions/toggle${eventQuery}`, { method: 'POST', body: JSON.stringify({ post_id, emoji }) })
      setItems(prev =>
        prev.map(p =>
          p.id === post_id
            ? { ...p, reaction_counts: res.counts || p.reaction_counts, my_reactions: res.my || p.my_reactions }
            : p
        )
      )
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    }
  }

  async function editMine(id: string) {
  const p = (items || []).find((x: any) => x.id === id)
  if (!p) return
  if (!canEditMine(p)) return
  setEditErr(null)
  setEditFile(null)
  setEditRemoveMedia(false)
  setEditLoading(true)
  try {
    const res = await jfetch(`/api/blessings/item?id=${encodeURIComponent(id)}`, { method: 'GET', headers: {} as any })
    const item = res?.item || p
    setEditDraft({
      id: item.id,
      author_name: item.author_name || '',
      text: item.text || '',
      link_url: item.link_url || '',
      media_url: item.media_url || '',
      media_path: item.media_path || ''
    })
    setEditOpen(true)
  } catch (e: any) {
    // fallback to local item
    setEditDraft({
      id: p.id,
      author_name: p.author_name || '',
      text: p.text || '',
      link_url: p.link_url || '',
      media_url: p.media_url || '',
      media_path: p.media_path || ''
    })
    setEditOpen(true)
  } finally {
    setEditLoading(false)
  }
}


async function saveFocusOnly() {
  if (!focusDraft?.id) return
  setFocusBusy(true)
  setErr(null)
  setMsg(null)
  try {
    const res = await jfetch(`/api/posts${eventQuery}`, {
      method: 'PUT',
      body: JSON.stringify({
        id: focusDraft.id,
        crop_position: focusDraft.crop_position || null,
        crop_focus_x: focusDraft.crop_focus_x ?? null,
        crop_focus_y: focusDraft.crop_focus_y ?? null,
      }),
    })

    setItems((prev: any[]) =>
      prev.map((p) =>
        p.id === focusDraft.id
          ? {
              ...p,
              ...(res?.post || {}),
              crop_position: focusDraft.crop_position || null,
              crop_focus_x: focusDraft.crop_focus_x ?? null,
              crop_focus_y: focusDraft.crop_focus_y ?? null,
            }
          : p
      )
    )

    setMsg('✅ המיקוד נשמר')
    setFocusDraft(null)
  } catch (e: any) {
    setErr(friendlyError(e?.message || 'שגיאה בשמירת מיקוד'))
  } finally {
    setFocusBusy(false)
  }
}

async function saveEdit() {
  if (!editDraft?.id) return
  setEditErr(null)
  setEditBusy(true)
  try {
    let media_path = editDraft.media_path || null
    let media_url = editDraft.media_url || null
    let video_url = editDraft.video_url || null

    // remove media (explicit)
    if (editRemoveMedia) {
      media_path = null
      media_url = null
    }

    // replace media (upload new)
    if (editFile) {
      const mediaError = validateSelectedMedia(editFile)
      if (mediaError) throw new Error(mediaError)
      if (isVideoFile(editFile)) {
        const upJson = await directUploadVideo(editFile, 'blessing')
        media_path = upJson.path
        video_url = upJson.publicUrl
        media_url = null
      } else {
        const fd = new FormData()
        fd.set('file', editFile)
        fd.set('kind', 'blessing')
        if (effectiveEventId) fd.append('event_id', effectiveEventId)

        const up = await fetch('/api/upload', { method: 'POST', body: fd })
        const upJson = await up.json()
        if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')

        media_path = upJson.path
        media_url = upJson.publicUrl
        video_url = null
      }
    }

    const patch = {
      id: editDraft.id,
      author_name: editDraft.author_name || null,
      text: editDraft.text || null,
      link_url: editDraft.link_url || null,
      media_path,
      media_url,
      video_url,
      crop_position: editDraft.crop_position || null,
      crop_focus_x: editDraft.crop_focus_x ?? null,
      crop_focus_y: editDraft.crop_focus_y ?? null,
    }

    const res = await jfetch(`/api/posts${eventQuery}`, { method: 'PUT', body: JSON.stringify(patch) })
    setItems((prev: any[]) => prev.map(x => (x.id === res.post.id ? { ...x, ...res.post } : x)))
    setEditOpen(false)
    setEditDraft(null)
    setEditFile(null)
    setEditRemoveMedia(false)
  } catch (e: any) {
    setEditErr(String(e?.message || 'שגיאה'))
  } finally {
    setEditBusy(false)
  }
}

  async function deleteMine(id: string) {
    if (!confirm('למחוק את הברכה?')) return
    setErr(null)
    try {
      await jfetch(`/api/posts${eventQuery}`, { method: 'DELETE', body: JSON.stringify({ id }) })
      setItems(prev => prev.filter(p => p.id !== id))
      setMsg('✅ נמחק')
      setTimeout(() => setMsg(null), 1200)
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    }
  }
  const blessingTitle = (settings?.blessings_title || settings?.blessings_label || 'ברכות') as string
  const blessingSubtitle = (settings?.blessings_subtitle || 'כתבו, צרפו תמונה, ותנו 👍') as string
  const rawMediaSize = Number(settings?.blessings_media_size ?? 140)
  const mediaSize = Math.max(60, Math.min(520, Number.isFinite(rawMediaSize) ? rawMediaSize : 140))

  const shareEnabled = settings?.share_enabled !== false
  const shareUsePermalink = settings?.share_use_permalink !== false
  const shareWhatsappEnabled = settings?.share_whatsapp_enabled !== false
  const shareWebshareEnabled = settings?.share_webshare_enabled !== false

  function buildLinkForPost(postId?: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const base = origin ? `${origin}` : ''
    const blessings = `${base}/blessings`
    if (postId && shareUsePermalink) {
      const code = String(postId).split('-')[0]
      return `/bl/${code}`
    }
    return blessings
  }

  async function sharePost(p: Post) {
    if (!shareEnabled) return
    const code = (p.id || '').slice(0, 8)
    // Ensure the short link exists in DB so /b/{code} can always be resolved
    try {
      await fetch(`/api/short-links${eventQuery}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postId: p.id,
          code,
          targetPath: `/blessings/p/${p.id}`,
        }),
      })
    } catch {
      // ignore; we can still share the URL
    }

    const link = buildLinkForPost(p.id)
    const eventName = String(settings?.event_name || 'Event')
    const template = settings?.share_message_template || null
    const noTextFallback = String(settings?.share_no_text_fallback || 'נשלחה ברכה מהממת 💙')
    const message = buildShareMessage(template, {
      EVENT_NAME: eventName,
      AUTHOR_NAME: p.author_name || '',
      TEXT: p.text || '',
      LINK: link,
      DATE: p.created_at || ''
    }, noTextFallback)

    // Mobile: native share (if enabled)
    const canNative = shareWebshareEnabled && typeof navigator !== 'undefined' && (navigator as any).share
    if (canNative) {
      try {
        const textOnly = message.split(link).join('').trim() || message
        await (navigator as any).share({ title: eventName, text: textOnly, url: link })
        return
      } catch {
        // fall back
      }
    }

    setSharePayload({ message, link })
    setShareOpen(true)
  }
  // Link Preview is controlled globally via event_settings (not per-block config)
  const linkPreviewEnabled = settings?.link_preview_enabled === true
  const showLinkDetails = settings?.link_preview_show_details === true

  return (
    <main dir="rtl" className="text-right">
      <Container>
<Card id="blessing-form">
          <div className="space-y-2 text-right">
            <Input placeholder="שם (אופציונלי)" value={author} onChange={e => setAuthor(e.target.value)} />
            <Textarea placeholder="הברכה שלך..." value={text} onChange={e => setText(e.target.value)} />
            <Input placeholder="קישור (אופציונלי)" value={linkUrl} onChange={e => { setLinkTouched(true); setLinkUrl(e.target.value) }} dir="ltr" />
            <LinkPreview url={linkUrl} />
            <div className="flex items-center justify-between gap-3">
              <div className="grid gap-2">
                {/* hidden inputs */}
                <input
                  ref={pickRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={e => setFile((e.target.files && e.target.files[0]) || null)}
                />
                <input
                  ref={cameraPhotoRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => setFile((e.target.files && e.target.files[0]) || null)}
                />
                <input
                  ref={cameraVideoRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => setFile((e.target.files && e.target.files[0]) || null)}
                />

                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" type="button" onClick={() => pickRef.current?.click()}>
                    בחר מדיה
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => cameraPhotoRef.current?.click()}>
                    צלם תמונה
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => cameraVideoRef.current?.click()}>
                    צלם וידאו
                  </Button>
                  {file && (
                    <Button variant="ghost" type="button" onClick={() => setFile(null)}>
                      הסר מדיה
                    </Button>
                  )}
                </div>

                {file && <p className="text-xs text-zinc-600">נבחר: {file.name}</p>}
              </div>
              <Button disabled={busy || (!text && !file && !linkUrl)} onClick={submitBlessing}>
                {busy ? 'שולח...' : 'שלח ברכה'}
              </Button>
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            {msg && <p className="text-sm text-emerald-600">{msg}</p>}
          </div>
        </Card>

        <div className="space-y-3">
          {items.map(p => (
            <Card key={p.id} id={`post-${p.id}`} className="scroll-mt-24">
              <div className="text-right">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-right">{p.author_name || 'אורח/ת'}</p>
                  <p className="text-xs text-zinc-500 text-left shrink-0" dir="ltr">
                    {new Date(p.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>

                {/* link preview thumb (no media -> below name) */}
                {linkPreviewEnabled && p.link_url && !(p.video_url || p.media_url) && (
                  <div className="mt-3 flex justify-center">
                    <LinkPreviewThumb url={p.link_url} size={mediaSize} />
                  </div>
                )}

                {/* media (centered) */}
                {(() => {
                  const mediaUrl = (p.video_url || p.media_url) as string | null
                  if (!mediaUrl) return null
                  const video = !!p.video_url || isVideo(mediaUrl)
                  return (
                    <div className="mt-3 flex justify-center">
                      <button
                        type="button"
                        className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
                        style={{ width: mediaSize, height: mediaSize }}
                        onClick={() => setLightbox({ url: mediaUrl, isVideo: video, post: p })}
                        aria-label="פתח מדיה"
                      >
                        {video ? (
                          <video src={mediaUrl} className="h-full w-full object-cover" style={{ objectPosition: objectPositionFromCrop(p) }} muted playsInline />
                        ) : (
                          <img src={mediaUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: objectPositionFromCrop(p) }} />
                        )}
                      </button>
                    </div>
                  )
                })()}

                {/* link preview thumb (centered) */}
{p.text && <p className="mt-3 whitespace-pre-wrap text-sm text-right">{p.text}</p>}

                {/* link preview thumb (has media -> below text; if no text -> will show below media) */}
                {linkPreviewEnabled && p.link_url && (p.video_url || p.media_url) && (
                  <div className="mt-3 flex justify-center">
                    <LinkPreviewThumb url={p.link_url} size={mediaSize} />
                  </div>
                )}

                {/* link meta/details (single line, below text) */}
                {/* When "show details" is ON we show the meta line (title/domain). */}
                {p.link_url && linkPreviewEnabled && showLinkDetails && (
                  <div className="mt-2">
                    <LinkPreviewMeta url={p.link_url} force={false} />
                  </div>
                )}
                {/* reactions */}
                <div className="mt-3 space-y-2" dir="rtl">
                  <div className="flex items-center justify-center gap-1 whitespace-nowrap" dir="ltr">
                    {EMOJIS.map(emo => {
                      const active = (p.my_reactions || []).includes(emo)
                      const c = (p.reaction_counts || {})[emo] || 0
                      return (
                        <Button
                          key={emo}
                          variant={active ? 'primary' : 'ghost'}
                          className="min-w-0 shrink-0 rounded-full px-2 py-2 text-sm sm:px-3"
                          onClick={() => toggleReaction(p.id, emo)}
                        >
                          {emo}{c ? ` ${c}` : ''}
                        </Button>
                      )
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3" dir="rtl">
                    {shareEnabled ? (
                      <Button
                        variant="ghost"
                        onClick={() => sharePost(p)}
                        className="min-w-[52px] shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                        title={String(settings?.share_button_label || 'שתף')}
                        type="button"
                      >
                        🔗
                      </Button>
                    ) : <span className="min-w-[52px]" />}

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                          const el = document.getElementById('blessing-form') as HTMLElement | null
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          const ta = document.querySelector('#blessing-form textarea') as HTMLTextAreaElement | null
                          setTimeout(() => ta?.focus(), 250)
                        } catch {}
                      }}
                      className="truncate whitespace-nowrap text-sm font-medium text-zinc-700 underline underline-offset-4"
                    >
                      כתוב ברכה
                    </button>
                  </div>
                </div>

                {/* edit/delete (mine, within 1h) */}
                {(canEditMine(p) || canRepositionMine(p)) && (
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2" dir="rtl">
                    {canEditMine(p) ? <span className="text-xs text-zinc-500">⏳ {fmtMMSS(secondsLeft(p))}</span> : null}
                    {canRepositionMine(p) && p.media_url && !p.video_url ? <Button variant="ghost" onClick={() => setFocusDraft({ ...p })}>🎯 מיקוד</Button> : null}
                    {canDeleteMine(p) && (
                      <Button variant="ghost" onClick={() => deleteMine(p.id)}>
                        מחק (שעה)
                      </Button>
                    )}
                    {canEditMine(p) && (
                      <Button variant="ghost" onClick={() => editMine(p.id)}>
                        ערוך (שעה)
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* LIGHTBOX */}
        {lightbox && (
          <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
            <div className="mx-auto flex h-full max-w-3xl items-center justify-center" onClick={e => e.stopPropagation()}>
              <div className="absolute top-2 right-2 z-10 flex items-center gap-2" dir="rtl">{shareEnabled && lightbox?.post ? (
  <Button variant="ghost" className="bg-white/90 text-black shadow hover:bg-white" onClick={() => sharePost(lightbox.post!)} type="button">
    {String(settings?.share_button_label || 'שתף')}
  </Button>
) : null}

{!lightbox.isVideo && (
<Button variant="ghost" className="bg-white/90 text-black shadow hover:bg-white" onClick={() => triggerDownload(lightbox.url)} type="button">הורד תמונה</Button>
)}
<Button variant="ghost" className="bg-white/90 text-black shadow hover:bg-white" onClick={() => setLightbox(null)} type="button">סגור</Button>
</div>
<div className="w-full overflow-hidden rounded-2xl bg-black">
                {lightbox.isVideo ? (
                  <video src={lightbox.url} controls autoPlay playsInline className="max-h-[85vh] w-full object-contain" />
                ) : (
                  <img src={lightbox.url} alt="" className="max-h-[85vh] w-full object-contain" />
                )}
              </div>
            </div>
          </div>
        )}

        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={String(settings?.share_modal_title || 'שיתוף')}
          message={sharePayload?.message || ''}
          link={sharePayload?.link || buildLinkForPost()}
          whatsappEnabled={shareWhatsappEnabled}
          whatsappLabel={String(settings?.share_whatsapp_button_label || 'שתף בוואטסאפ')}
          copyLabel={String(settings?.qr_btn_copy_label || 'העתק קישור')}
        />


{focusDraft && (
  <div className="fixed inset-0 z-50 bg-black/60 p-4" onClick={() => setFocusDraft(null)}>
    <div className="mx-auto max-w-xl" onClick={e => e.stopPropagation()}>
      <Card>
        <h3 className="font-semibold text-right">🎯 מיקוד תמונה</h3>
        <div className="mt-3 grid gap-3 text-right">
          <CropEditor
            src={focusDraft.media_url}
            x={focusDraft.crop_focus_x ?? 0.5}
            y={focusDraft.crop_focus_y ?? 0.5}
            onChange={(point) => setFocusDraft((d: any) => ({ ...d, crop_focus_x: point.x, crop_focus_y: point.y, crop_position: point.y < 0.34 ? 'top' : point.y > 0.66 ? 'bottom' : 'center' }))}
          />
          <div className="rounded-xl border border-zinc-200 p-3">
            <p className="mb-2 text-sm text-zinc-600">תצוגה מקדימה כמו באתר</p>
            <div className="mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl bg-zinc-100">
              <img
                src={focusDraft.media_url}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: objectPositionFromCrop(focusDraft) }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFocusDraft(null)}>ביטול</Button>
            <Button onClick={saveFocusOnly} disabled={focusBusy}>{focusBusy ? 'שומר...' : 'שמור מיקוד'}</Button>
          </div>
        </div>
      </Card>
    </div>
  </div>
)}

{/* EDIT MODAL */}
{editOpen && editDraft && (
  <div className="fixed inset-0 z-50 bg-black/60 p-4" onClick={() => setEditOpen(false)}>
    <div className="mx-auto max-w-xl" onClick={e => e.stopPropagation()}>
      <Card>
        <h3 className="font-semibold text-right">עריכת ברכה</h3>

        <div className="mt-3 grid gap-2 text-right">
          <Input
            placeholder="שם"
            value={editDraft.author_name ?? ""}
            onChange={e => setEditDraft((d: any) => ({ ...d, author_name: e.target.value }))}
          />
          <Textarea
            placeholder="הברכה"
            value={editDraft.text ?? ""}
            onChange={e => setEditDraft((d: any) => ({ ...d, text: e.target.value }))}
            rows={5}
          />
          <Input
            placeholder="קישור (אופציונלי)"
            value={editDraft.link_url ?? ""}
            onChange={e => setEditDraft((d: any) => ({ ...d, link_url: e.target.value }))}
          />

          <div className="rounded-xl border border-zinc-200 p-3">
            <p className="text-sm text-zinc-700">מדיה</p>

            {editDraft.media_url && !editRemoveMedia && !editFile && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200">
                  <img src={editDraft.media_url} alt="" className="h-full w-full object-cover" style={{ objectPosition: objectPositionFromCrop(editDraft) }} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editRemoveMedia}
                    onChange={e => setEditRemoveMedia(e.target.checked)}
                  />
                  מחק מדיה
                </label>
              </div>
            )}

            <div className="mt-2">
              <input type="file" accept="image/*,video/*" onChange={e => setEditFile(e.target.files?.[0] || null)} />
              <p className="mt-1 text-xs text-zinc-500">בחירת קובץ תחליף את המדיה הקיימת.</p>
            </div>
          </div>

          {editErr && <p className="text-sm text-red-600">{editErr}</p>}

          {editDraft.media_url && !editRemoveMedia && !editFile && !editDraft.video_url && (
            <div className="rounded-xl border border-zinc-200 p-3">
              <p className="mb-2 text-sm font-medium text-right">🎯 מיקוד תמונה</p>
              <CropEditor
                src={editDraft.media_url}
                x={editDraft.crop_focus_x ?? 0.5}
                y={editDraft.crop_focus_y ?? 0.5}
                onChange={(point) => setEditDraft((d: any) => ({ ...d, crop_focus_x: point.x, crop_focus_y: point.y, crop_position: point.y < 0.34 ? 'top' : point.y > 0.66 ? 'bottom' : 'center' }))}
              />
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>בטל</Button>
            <Button onClick={saveEdit} disabled={editBusy}>
              {editBusy ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </div>
)}
</Container>
    </main>
  )
}
type UnfurlData = { url: string; title: string; description: string; image: string; site_name: string }

const unfurlCache = new Map<string, UnfurlData>()

function hostOf(u: string) {
  try {
    return new URL(u).hostname
  } catch {
    return u
  }
}

function youtubeThumb(u: string) {
  try {
    const url = new URL(u)
    const host = url.hostname.replace(/^www\./, '')
    let id = ''
    if (host === 'youtu.be') {
      id = url.pathname.replace(/^\//, '')
    } else if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || ''
      else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || ''
      else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] || ''
    }
    if (!id) return ''
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  } catch {
    return ''
  }
}

function useUnfurl(url?: string) {
  const [data, setData] = useState<UnfurlData | null>(null)

  useEffect(() => {
    const u = (url || '').trim()
    if (!u) return
    if (unfurlCache.has(u)) {
      setData(unfurlCache.get(u)!)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/unfurl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: u })
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return
        const d = json?.data as UnfurlData
        if (!d?.url) return
        unfurlCache.set(u, d)
        if (!cancelled) setData(d)
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [url])

  return data
}

function LinkPreviewThumb({ url, size }: { url?: string; size: number }) {
  const d = useUnfurl(url)
  if (!url) return null
  if (!d) return null

  const img = d.image || youtubeThumb(d.url)
  if (!img) return null

  return (
    <a
      href={d.url}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-2xl bg-zinc-50"
      style={{ width: size, height: size }}
      aria-label="פתח קישור"
    >
      <img src={img} alt="" className="h-full w-full object-cover object-top" style={{ objectPosition: 'top' }} />
    </a>
  )
}

function LinkPreviewMeta({ url, force }: { url?: string; force?: boolean }) {
  const d = useUnfurl(url)
  if (!url) return null
  if (!d) return null

  const domain = d.site_name || hostOf(d.url)
  const title = (d.title || '').trim()
  const line = title ? `${domain} — ${title}` : domain

  return (
    <a
      href={d.url}
      target="_blank"
      rel="noreferrer"
      className="block max-w-full truncate whitespace-nowrap text-[11px] text-zinc-600"
      dir="ltr"
      title={d.url}
    >
      {line}
    </a>
  )
}

function LinkPreview({ url }: { url?: string }) {
  // composer preview: thumb + single-line meta
  if (!url) return null
  return (
    <div className="mt-2">
      <div className="flex justify-center">
        <LinkPreviewThumb url={url} size={220} />
      </div>
      <div className="mt-2">
        <LinkPreviewMeta url={url} force />
      </div>
    </div>
  )
}
