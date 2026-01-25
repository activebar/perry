'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Container, Input, Textarea } from '@/components/ui'

type Post = {
  id: string
  created_at: string
  author_name: string | null
  text: string | null
  media_url: string | null
  video_url?: string | null
  link_url: string | null
  status: string
  reaction_counts: Record<string, number>
  my_reactions: string[]
  can_edit?: boolean
  can_delete?: boolean
  editable_until?: string | null
}

const EMOJIS = [
  '\u{1F44D}', // 👍
  '\u{1F60D}', // 😍
  '\u{1F525}', // 🔥
  '\u{1F64F}', // 🙏
] as const

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
  const m = msg.toLowerCase()
  if (m.includes('edit window expired')) return 'חלון העריכה נסגר — לא ניתן לערוך אחרי הזמן המותר.'
  if (m.includes('delete window expired')) return 'חלון המחיקה נסגר — לא ניתן למחוק אחרי הזמן המותר.'
  if (m.includes('forbidden')) return 'אין הרשאה (ייתכן שנעול/דורש אישור מנהל).'
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
  u = u.replace(/[\]\)\}\>,\.\!\?\:;]+$/g, '')
  return u
}

export default function BlessingsClient({ initialFeed }: { initialFeed: Post[] }) {
  const [items, setItems] = useState<Post[]>(initialFeed || [])
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTouched, setLinkTouched] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  // גודל אחיד למדיה בברכות (נשלט מה־Admin: settings.blessings_media_size)
  const [mediaSize, setMediaSize] = useState<number>(96)
	const [showLinkDetails, setShowLinkDetails] = useState(false)
  const mediaBoxStyle = { width: mediaSize, height: mediaSize }

  // נביא settings פעם אחת כדי לקבל blessings_media_size (באמצעות home שכבר קיים אצלך)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/public/home?ts=${Date.now()}`, { cache: 'no-store' })
        const j = await res.json().catch(() => ({}))
        const v = Number(j?.settings?.blessings_media_size ?? 96)
        if (!cancelled && Number.isFinite(v) && v >= 56 && v <= 220) setMediaSize(v)
		if (!cancelled) setShowLinkDetails(j?.settings?.link_preview_show_details === true)
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // media pickers (mobile-friendly)
  const pickRef = useRef<HTMLInputElement | null>(null)
  const cameraPhotoRef = useRef<HTMLInputElement | null>(null)
  const cameraVideoRef = useRef<HTMLInputElement | null>(null)

  // auto-detect link from text (WhatsApp-style)
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
  const [editBusy, setEditBusy] = useState(false)

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

  // tick for countdown UI
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  void nowTick // ensures re-render every second

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // refresh list occasionally
  useEffect(() => {
    let cancelled = false

    async function pull() {
      try {
        const res = await fetch(`/api/blessings/feed?ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json().catch(() => ({}))
        if (!cancelled && Array.isArray(j.items)) setItems(j.items)
      } catch {}
    }

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

      setItems(prev => [res.post as Post, ...prev])
      setAuthor('')
      setText('')
      setLinkUrl('')
      setLinkTouched(false)
      setFile(null)

      setMsg(res.status === 'pending' ? '? נשלח לאישור מנהל' : '? נשלח!')
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleReaction(post_id: string, emoji: string) {
    setErr(null)
    try {
      const res = await jfetch('/api/reactions/toggle', {
        method: 'POST',
        body: JSON.stringify({ post_id, emoji })
      })
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
      const res = await jfetch(`/api/blessings/item?id=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: {} as any
      })
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
    } catch {
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

      if (editRemoveMedia) {
        media_path = null
        media_url = null
      }

      if (editFile) {
        const fd = new FormData()
        fd.set('file', editFile)
        fd.set('kind', 'blessing')

        const up = await fetch('/api/upload', { method: 'POST', body: fd })
        const upJson = await up.json().catch(() => ({}))
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
      setMsg('? נמחק')
      setTimeout(() => setMsg(null), 1200)
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    }
  }

  return (
    <main>
      <Container>
        <Card>
          <div className="flex items-center justify-between gap-2" dir="rtl">
            <div className="text-right">
              <h2 className="text-xl font-bold">ברכות</h2>
              <p className="text-sm text-zinc-600">כתבו ברכה, צרפו תמונה/וידאו, ותנו ריאקשן ??</p>
            </div>
            <Link href="/">
              <Button variant="ghost">? חזרה</Button>
            </Link>
          </div>
        </Card>

        <Card dir="rtl">
          <div className="space-y-2 text-right">
            <Input placeholder="שם (אופציונלי)" value={author} onChange={e => setAuthor(e.target.value)} />
            <Textarea placeholder="הברכה שלך..." value={text} onChange={e => setText(e.target.value)} />
            <Input
              placeholder="קישור (אופציונלי)"
              value={linkUrl}
              onChange={e => {
                setLinkTouched(true)
                setLinkUrl(e.target.value)
              }}
              dir="ltr"
            />
            <LinkPreview url={linkUrl} sizePx={mediaSize} showDetails={showLinkDetails} />

            <div className="flex items-center justify-between gap-3">
              <div className="grid gap-2">
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

                {file && (
                  <div className="flex items-center gap-3">
                    <div className="overflow-hidden rounded-2xl bg-zinc-50 ring-1 ring-zinc-200" style={mediaBoxStyle}>
                      {(file.type || '').startsWith('video/') ? (
                        <video className="h-full w-full object-cover" src={URL.createObjectURL(file)} muted playsInline />
                      ) : (
                        <img className="h-full w-full object-cover" src={URL.createObjectURL(file)} alt="" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-600">נבחר: {file.name}</p>
                  </div>
                )}
              </div>

              <Button disabled={busy || (!text && !file && !linkUrl)} onClick={submitBlessing}>
                {busy ? 'שולח...' : 'שלח ברכה'}
              </Button>
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            {msg && <p className="text-sm text-emerald-600">{msg}</p>}
          </div>
        </Card>

        <div className="space-y-3" dir="rtl">
          {items.map(p => {
            const media = (p.video_url || p.media_url) as string | null
            const isVid = !!p.video_url || (media ? isVideo(media) : false)

            return (
              <Card key={p.id}>
                <div className="text-right">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{p.author_name || 'אורח/ת'}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(p.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>

                    {media && (
                      <button
                        type="button"
                        className="relative flex-none overflow-hidden rounded-2xl bg-zinc-50 ring-1 ring-zinc-200"
                        style={mediaBoxStyle}
                        onClick={() => window.open(media, '_blank')}
                        title="פתח מדיה"
                      >
                        {isVid ? (
                          <>
                            <video src={media} className="h-full w-full object-cover" muted playsInline />
                            <div className="absolute inset-0 grid place-items-center bg-black/10">
                              <div className="rounded-full bg-black/55 px-3 py-1 text-xs text-white">?</div>
                            </div>
                          </>
                        ) : (
                          <img src={media} alt="" className="h-full w-full object-cover" />
                        )}
                      </button>
                    )}
                  </div>

                  {p.text && <p className="mt-2 whitespace-pre-wrap text-sm">{p.text}</p>}
                  {p.link_url && <LinkPreview url={p.link_url} sizePx={mediaSize} showDetails={showLinkDetails} />}

                  <div className="mt-3 flex flex-wrap gap-2 justify-end">
                    {EMOJIS.map(emo => {
                      const active = (p.my_reactions || []).includes(emo)
                      const c = (p.reaction_counts || {})[emo] || 0
                      return (
                        <Button key={emo} variant={active ? 'default' : 'ghost'} onClick={() => toggleReaction(p.id, emo)}>
                          {emo} {c ? c : ''}
                        </Button>
                      )
                    })}
                  </div>

                  {canEditMine(p) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 justify-end">
                      <Button variant="ghost" onClick={() => editMine(p.id)} disabled={editLoading}>
                        ערוך (זמני)
                      </Button>
                      {canDeleteMine(p) && (
                        <Button variant="ghost" onClick={() => deleteMine(p.id)}>
                          מחק (זמני)
                        </Button>
                      )}
                      <span className="text-xs text-zinc-500">? {fmtMMSS(secondsLeft(p))}</span>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>

        {/* EDIT MODAL */}
        {editOpen && editDraft && (
          <div className="fixed inset-0 z-50 bg-black/60 p-4" onClick={() => setEditOpen(false)}>
            <div className="mx-auto max-w-xl" onClick={e => e.stopPropagation()}>
              <Card dir="rtl">
                <h3 className="font-semibold text-right">עריכת ברכה</h3>

                <div className="mt-3 grid gap-2 text-right">
                  <Input
                    placeholder="שם"
                    value={editDraft.author_name ?? ''}
                    onChange={e => setEditDraft((d: any) => ({ ...d, author_name: e.target.value }))}
                  />
                  <Textarea
                    placeholder="הברכה"
                    value={editDraft.text ?? ''}
                    onChange={e => setEditDraft((d: any) => ({ ...d, text: e.target.value }))}
                    rows={5}
                  />
                  <Input
                    placeholder="קישור (אופציונלי)"
                    value={editDraft.link_url ?? ''}
                    onChange={e => setEditDraft((d: any) => ({ ...d, link_url: e.target.value }))}
                  />

                  <div className="rounded-xl border border-zinc-200 p-3">
                    <p className="text-sm text-zinc-700">מדיה</p>

                    {editDraft.media_url && !editRemoveMedia && !editFile && (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200" style={{ width: 72, height: 72 }}>
                          <img src={editDraft.media_url} alt="" className="h-full w-full object-cover" />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={editRemoveMedia} onChange={e => setEditRemoveMedia(e.target.checked)} />
                          הסר מדיה
                        </label>
                      </div>
                    )}

                    <div className="mt-2">
                      <input type="file" accept="image/*,video/*" onChange={e => setEditFile(e.target.files?.[0] || null)} />
                      <p className="mt-1 text-xs text-zinc-500">בחירה חדשה תחליף את המדיה הקיימת.</p>
                    </div>
                  </div>

                  {editErr && <p className="text-sm text-red-600">{editErr}</p>}

                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditOpen(false)}>
                      סגור
                    </Button>
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

/* ===================== Link Preview (Unfurl) ===================== */

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
    if (host === 'youtu.be') id = url.pathname.replace(/^\//, '')
    else if (host.endsWith('youtube.com')) {
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

function LinkPreview({
  url,
  sizePx,
  showDetails
}: {
  url?: string | null
  sizePx: number
  showDetails?: boolean
}) {
  const d = useUnfurl(url || '')
  if (!url) return null
  if (!d) return null

  const img = d.image || youtubeThumb(d.url)
  if (!img) {
    return (
      <a className="mt-2 block text-sm underline" href={d.url} target="_blank" rel="noreferrer" dir="ltr">
        {showDetails ? d.url : 'פתח קישור'}
      </a>
    )
  }

  // קומפקטי כברירת מחדל: תמונה בלבד. אם showDetails=true – מציג גם פרטים.
  return (
    <a
      href={d.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex items-center gap-3 overflow-hidden rounded-xl border border-zinc-200 bg-white p-2 hover:bg-zinc-50"
    >
      <div className="relative flex-none overflow-hidden rounded-lg bg-zinc-100" style={{ width: sizePx, height: sizePx }}>
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>

      {showDetails ? (
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-600">{d.site_name || hostOf(d.url)}</p>
          {d.title ? <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{d.title}</p> : null}
          <p className="mt-1 truncate text-xs text-zinc-500" dir="ltr">
            {d.url}
          </p>
        </div>
      ) : null}
    </a>
  )
}

