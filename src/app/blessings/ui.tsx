'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Container, Input, Textarea } from '@/components/ui'

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

export default function BlessingsClient({ initialFeed, mediaSize }: { initialFeed: Post[]; mediaSize: number }) {
  const [items, setItems] = useState<Post[]>(initialFeed || [])
  const safeMediaSize = Math.max(140, Math.min(520, Number(mediaSize || 260)))

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

  return (
    <main>
      <Container>
        <Card>
          <div className="flex items-center justify-between gap-2">
            <div className="text-right">
              <h2 className="text-xl font-bold">ברכות</h2>
              <p className="text-sm text-zinc-600">כתבו ברכה מרגשת לעידו ✨</p>
            </div>
            <Link href="/"><Button variant="ghost">← בית</Button></Link>
          </div>
        </Card>

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
            <Card key={p.id}>
              <div className="text-right">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{p.author_name || 'אורח/ת'}</p>
                  <p className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
                </div>

                {(p.media_url || p.video_url) && (
                  <div className="mt-3 flex justify-center">
                    <div
                      className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
                      style={{ width: safeMediaSize, maxWidth: '100%' }}
                    >
                      {(() => {
                        const url = (p.video_url || p.media_url) as string
                        if (!url) return null
                        const video = !!p.video_url || isVideo(url)
                        return video ? (
                          <video src={url} controls className="w-full h-auto" playsInline />
                        ) : (
                          <img src={url} alt="" className="w-full h-auto object-contain" />
                        )
                      })()}
                    </div>
                  </div>
                )}

                {p.text && <p className="mt-3 whitespace-pre-wrap text-sm">{p.text}</p>}
</div>
                )}

                {p.link_url && <LinkPreview url={p.link_url} />}

                {/* reactions */}
                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  {EMOJIS.map(emo => {
                    const active = (p.my_reactions || []).includes(emo)
                    const c = (p.reaction_counts || {})[emo] || 0
                    return (
                      <Button
                        key={emo}
                        variant={active ? 'primary' : 'ghost'}
                        onClick={() => toggleReaction(p.id, emo)}
                      >
                        {emo} {c ? c : ''}
                      </Button>
                    )
                  })}
                </div>

                {/* edit/delete (mine, within 1h) */}
                {canEditMine(p) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 justify-end">
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

function LinkPreview({ url }: { url?: string }) {
  const d = useUnfurl(url)
  if (!url) return null
  if (!d) return null

  const img = d.image || youtubeThumb(d.url)
  if (!img) {
    // בלי "קוביה ריקה" – אם אין תמונה פשוט מציגים לינק.
    return (
      <a className="mt-2 block text-sm underline" href={d.url} target="_blank" rel="noreferrer">
        {d.url}
      </a>
    )
  }

  return (
    <a
      href={d.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block overflow-hidden rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50"
    >
      <div className="relative aspect-[12/5] w-full bg-zinc-100">
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="px-3 py-2 text-[11px] text-zinc-600" dir="rtl">
        {d.site_name || hostOf(d.url)}
      </div>
    </a>
  )
}
