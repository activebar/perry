'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Container, Input, Textarea } from '@/components/ui'
import ShareModal from '@/components/share/ShareModal'
import { buildShareMessage } from '@/lib/share/buildShareMessage'

type Post = {
  id: string
  created_at: string
  author_name: string | null
  text: string | null
  media_url: string | null
  video_url: string | null
  link_url: string | null
  media_path?: string | null
  status: string
  reaction_counts: Record<string, number>
  my_reactions: string[]
}
const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

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
  return (f.type || '').startsWith('video/')
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


  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // refresh list occasionally (helps when require_approval is on)
  useEffect(() => {
    let cancelled = false

    async function pull() {
      try {
        const res = await fetch(`/api/blessings/feed?ts=${Date.now()}`, { cache: 'no-store' })
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

  async function submitBlessing() {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
const maxLines = Number((settings as any)?.max_blessing_lines ?? 50)
const currentLines = countLines(text || '')
if (Number.isFinite(maxLines) && maxLines > 0 && currentLines > maxLines) {
  const ok = window.confirm(
    `הברכה כוללת ${currentLines} שורות, והמקסימום הוא ${maxLines}.\nאישור ישלח את הברכה לאישור מנהל.\nביטול יאפשר לערוך ולקצר לפני השליחה.`
  )
  if (!ok) {
    setBusy(false)
    return
  }
}


      let media_path: string | null = null
      let media_url: string | null = null
      let video_url: string | null = null

      if (file) {
        const fd = new FormData()
        fd.set('file', file)
        fd.set('kind', 'blessing')
        const up = await fetch('/api/upload', { method: 'POST', body: fd })
        const upJson = await up.json().catch(() => ({}))
        if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')
        media_path = upJson.path
        if (isVideoFile(file)) {
          video_url = upJson.publicUrl
          media_url = null
        } else {
          media_url = upJson.publicUrl
          video_url = null
        }
      }

      const res = await jfetch('/api/posts', {
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
// If the blessing goes to approval, keep the form fields so the user can edit and resubmit.
if (res.status !== 'pending') {
  setItems(prev => [res.post as Post, ...prev])
  setAuthor('')
  setText('')
  setLinkUrl('')
  setLinkTouched(false)
  setFile(null)
}


      if (res.status === 'pending') {
        const reason = String(res.pending_reason || '')
        if (reason === 'moderation') {
          setMsg('הברכה נשמרה וממתינה לאישור מנהל. ניתן לערוך ולנסות שוב')
        } else if (reason === 'lines') {
          setMsg('הברכה ארוכה מהאורך המותר ונשלחה לאישור מנהל. ניתן לערוך ולקצר')
        } else {
          setMsg('✅ נשלח לאישור מנהל')
        }
      } else {
        setMsg('✅ נשמר!')
      }
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleReaction(post_id: string, emoji: string) {
    setErr(null)
    try {
      const res = await jfetch('/api/reactions/toggle', { method: 'POST', body: JSON.stringify({ post_id, emoji }) })
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

async function saveEdit() {
  if (!editDraft?.id) return
  setEditErr(null)
  setEditBusy(true)
  try {
    let media_path = editDraft.media_path || null
    let media_url = editDraft.media_url || null

    // remove media (explicit)
    if (editRemoveMedia) {
      media_path = null
      media_url = null
    }

    // replace media (upload new)
    if (editFile) {
      const fd = new FormData()
      fd.set('file', editFile)
      fd.set('kind', 'blessing')

      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const upJson = await up.json()
      if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')

      media_path = upJson.path
      media_url = upJson.publicUrl
    }

    const patch = {
      id: editDraft.id,
      author_name: editDraft.author_name || null,
      text: editDraft.text || null,
      link_url: editDraft.link_url || null,
      media_path,
      media_url
    }

    const res = await jfetch('/api/posts', { method: 'PUT', body: JSON.stringify(patch) })
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
      await jfetch('/api/posts', { method: 'DELETE', body: JSON.stringify({ id }) })
      setItems(prev => prev.filter(p => p.id !== id))
      setMsg('✅ נמחק')
      setTimeout(() => setMsg(null), 1200)
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    }
  }
  const blessingTitle = (settings?.blessings_title || settings?.blessings_label || 'ברכות') as string
  const blessingSubtitle = (settings?.blessings_subtitle || 'כתבו ברכה, צרפו תמונה, ותנו ריאקשן.') as string
  const mediaSize = Math.max(120, Math.min(520, Number(settings?.blessings_media_size || 320)))

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
      return `${base}/bl/${code}`
    }
    return blessings
  }

  async function sharePost(p: Post) {
    if (!shareEnabled) return
    const code = (p.id || '').slice(0, 8)
    // Ensure the short link exists in DB so /b/{code} can always be resolved
    try {
      await fetch('/api/short-links', {
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
        {showHeader && (
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="text-right">
                <h2 className="text-xl font-bold">{blessingTitle}</h2>
                <p className="text-sm text-zinc-600">{blessingSubtitle}</p>
              </div>
              <Link href="/"><Button variant="ghost">← בית</Button></Link>
            </div>
          </Card>
        )}

        <Card>
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
                <div className="grid grid-cols-2 items-center gap-2">
                  <p className="font-semibold text-right">{p.author_name || 'אורח/ת'}</p>

                  <div className="flex flex-col items-start">
                    <p className="text-xs text-zinc-500 text-left" dir="ltr">
                      {new Date(p.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>

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
                          <video src={mediaUrl} className="h-full w-full object-cover" muted playsInline />
                        ) : (
                          <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
                        )}
                      </button>
                    </div>
                  )
                })()}

                {/* link preview thumb (centered) */}
                {linkPreviewEnabled && p.link_url && (
                  <div className="mt-3 flex justify-center">
                    <LinkPreviewThumb url={p.link_url} size={mediaSize} />
                  </div>
                )}

                {p.text && <p className="mt-3 whitespace-pre-wrap text-sm text-right">{p.text}</p>}

                {/* link meta/details (single line, below text) */}
                {/* When "show details" is ON we show the meta line (title/domain). */}
                {p.link_url && linkPreviewEnabled && showLinkDetails && (
                  <div className="mt-2">
                    <LinkPreviewMeta url={p.link_url} force={false} />
                  </div>
                )}
                {/* reactions */}
                <div className="mt-3 flex items-center gap-2 justify-end flex-nowrap overflow-x-auto">
                  {EMOJIS.map(emo => {
                    const active = (p.my_reactions || []).includes(emo)
                    const c = (p.reaction_counts || {})[emo] || 0
                    return (
                      <Button
                        key={emo}
                        variant={active ? 'primary' : 'ghost'}
                        className="shrink-0"
                        onClick={() => toggleReaction(p.id, emo)}
                      >
                        {emo} {c ? c : ''}
                      </Button>
                    )
                  })}
                  {shareEnabled ? (
                    <Button
                      variant="ghost"
                      onClick={() => sharePost(p)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700"
                      title={String(settings?.share_button_label || 'שתף')}
                    >
                      🔗
                    </Button>
                  ) : null}
                </div>

                {/* edit/delete (mine, within 1h) */}
                {canEditMine(p) && (
                  <div className="mt-3 flex items-center gap-2 justify-end flex-nowrap overflow-x-auto">
                    <Button variant="ghost" onClick={() => editMine(p.id)}>
                      ערוך (שעה)
                    </Button>
                    {canDeleteMine(p) && (
                      <Button variant="ghost" onClick={() => deleteMine(p.id)}>
                        מחק (שעה)
                      </Button>
                    )}
                    <span className="text-xs text-zinc-500">⏳ {fmtMMSS(secondsLeft(p))}</span>
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
                  <img src={editDraft.media_url} alt="" className="h-full w-full object-cover" />
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
      <img src={img} alt="" className="h-full w-full object-cover" />
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