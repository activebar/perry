'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, Textarea } from '@/components/ui'

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

/** Preview נקי כמו בדף הבית/ברכות: תמונה + דומיין, בלי כותרות/תיאורים אלא אם showDetails=true */
function LinkPreview({
  url,
  size,
  showDetails
}: {
  url?: string | null
  size: number
  showDetails?: boolean
}) {
  const d = useUnfurl(url || '')
  if (!url) return null
  if (!d) return null

  const img = d.image || youtubeThumb(d.url)
  const domain = d.site_name || hostOf(d.url)

  if (!img) {
    return (
      <a className="mt-2 block text-sm underline" href={d.url} target="_blank" rel="noreferrer">
        {d.url}
      </a>
    )
  }

  return (
    <div className="mt-2">
      <div className="flex justify-center">
        <a
          href={d.url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50"
          style={{ width: size, height: size }}
          aria-label="פתח קישור"
        >
          <img src={img} alt="" className="h-full w-full object-cover" />
        </a>
      </div>

      <div className="mt-2 mx-auto" style={{ width: size }}>
        <p className="text-[11px] text-zinc-600 truncate" dir="ltr" title={domain}>
          {domain}
        </p>

        {showDetails ? (
          <>
            {d.title ? <p className="mt-0.5 truncate text-sm font-semibold" title={d.title}>{d.title}</p> : null}
            {d.description ? <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{d.description}</p> : null}
            <p className="mt-1 truncate text-xs text-zinc-500" dir="ltr" title={d.url}>
              {d.url}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}

/* ===================== Media Box (Image/Video) ===================== */

function isVideoUrl(url?: string | null) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url || '')
}

function MediaBox({
  media_url,
  video_url,
  size
}: {
  media_url?: string | null
  video_url?: string | null
  size: number
}) {
  const url = (video_url || media_url || '') as string
  if (!url) return null

  const isVid = !!video_url || isVideoUrl(url)

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="relative flex-none overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200"
      style={{ width: size, height: size }}
      title="פתח מדיה"
    >
      {isVid ? (
        <video src={url} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
      ) : (
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </a>
  )
}

/* ===================== Admin App ===================== */

type Admin = { role: 'master' | 'client'; username: string; email: string }
type Tab = 'login' | 'settings' | 'blocks' | 'moderation' | 'ads' | 'admin_gallery' | 'diag'

const TAB_LABEL: Record<string, string> = {
  settings: 'הגדרות',
  blocks: 'בלוקים',
  moderation: 'אישור תכנים',
  ads: 'פרסומות',
  admin_gallery: 'גלריית מנהל',
  diag: 'דיאגנוסטיקה',
  login: 'התחברות'
}

async function jfetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts?.headers || {}) }
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'Request failed')
  return json
}

function friendlyError(msg: string) {
  const m = (msg || '').toLowerCase()
  if (m.includes('missing credentials')) return 'נא למלא שם משתמש וסיסמה.'
  if (m.includes('invalid credentials')) return 'שם משתמש לא קיים או סיסמה לא נכונה.'
  if (m.includes('inactive')) return 'החשבון לא פעיל.'
  if (m.includes('service role')) return 'חסר מפתח Service Role בקובץ ENV (SUPABASE_SERVICE_ROLE_KEY).'
  if (m.includes('unauthorized')) return 'אין הרשאה (401). נסה להתנתק/למחוק עוגיות ולהתחבר שוב.'
  return msg || 'שגיאה'
}

function fmt(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' })
}

function isoToLocalInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}
function localInputToIso(v?: string) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

function parseLinesToArray(s: string) {
  return (s || '')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)
}

export default function AdminApp() {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [tab, setTab] = useState<Tab>('login')
  const [err, setErr] = useState<string | null>(null)

  // login
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const [busy, setBusy] = useState(false)

  // settings
  const [settings, setSettings] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [startAtLocal, setStartAtLocal] = useState('')

  // HERO upload
  const [heroFiles, setHeroFiles] = useState<File[]>([])
  const [heroBusy, setHeroBusy] = useState(false)
  const [heroMsg, setHeroMsg] = useState<string | null>(null)

  // blocks
  const [blocks, setBlocks] = useState<any[]>([])

  // moderation
  const [pendingKind, setPendingKind] = useState<'blessing' | 'gallery'>('blessing')
  const [pending, setPending] = useState<any[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingBlessingsCount, setPendingBlessingsCount] = useState(0)
  const [pendingPhotosCount, setPendingPhotosCount] = useState(0)

  // blessings manage (approved)
  const [approvedBlessings, setApprovedBlessings] = useState<any[]>([])
  const [editBlessing, setEditBlessing] = useState<any | null>(null)
  const [editBusy, setEditBusy] = useState(false)

  // ads
  const [ads, setAds] = useState<any[]>([])
  const [newAd, setNewAd] = useState<any>({ title: '', body: '', image_url: '', link_url: '', is_active: true })

  // admin gallery
  const [adminGallery, setAdminGallery] = useState<any[]>([])
  const [adminFiles, setAdminFiles] = useState<File[]>([])
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminMsg, setAdminMsg] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  async function triggerDownload(url: string) {
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

  // diag
  const [diag, setDiag] = useState<any | null>(null)

  const bSize = Number(settings?.blessings_media_size ?? 96)
  const safeBSize = Number.isFinite(bSize) ? Math.max(56, Math.min(220, bSize)) : 96
  const linkPreviewEnabled = settings?.link_preview_enabled === true
  const showLinkDetails = settings?.link_preview_show_details === true

  async function refreshMe() {
    try {
      const me = await jfetch('/api/admin/me', { method: 'GET', headers: {} as any })
      setAdmin(me.admin)
      setTab('settings')
      fetchTopCounts()
    } catch {
      setAdmin(null)
      setTab('login')
    }
  }

  useEffect(() => {
    refreshMe()
  }, [])

  useEffect(() => {
    if (!admin) return
    fetchTopCounts()
    const t = setInterval(() => fetchTopCounts(), 15000)
    return () => clearInterval(t)
  }, [admin])

  const tabs = useMemo(() => {
    if (!admin) return []
    return ['settings', 'blocks', 'moderation', 'ads', 'admin_gallery', 'diag'] as Tab[]
  }, [admin])

  async function login() {
    setErr(null)
    setBusy(true)
    try {
      await jfetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) })
      setPassword('')
      setShowPassword(false)
      setCapsOn(false)
      await refreshMe()
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    try {
      await jfetch('/api/admin/logout', { method: 'POST', body: '{}' })
    } catch {}
    setAdmin(null)
    setTab('login')
  }

  async function loadSettings() {
    const s = await jfetch('/api/admin/settings', { method: 'GET', headers: {} as any })
    setSettings(s.settings)
    setStartAtLocal(isoToLocalInput(s.settings?.start_at))
  }

  async function saveSettings(patch?: any) {
    if (!settings) return
    setErr(null)
    setSavedMsg(null)
    setSaving(true)
    try {
      const payload = { ...(patch || settings) }
      if (startAtLocal) payload.start_at = localInputToIso(startAtLocal)
      const res = await jfetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) })
      setSettings(res.settings)
      setStartAtLocal(isoToLocalInput(res.settings?.start_at))
      setSavedMsg(`✅ נשמר בהצלחה • עודכן ב: ${fmt(res.settings?.updated_at)}`)
      setTimeout(() => setSavedMsg(null), 2500)
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה בשמירה'))
    } finally {
      setSaving(false)
    }
  }

  async function uploadHeroImages() {
    setHeroMsg(null)
    if (!settings) return
    if (!heroFiles.length) {
      setHeroMsg('בחר תמונות להעלאה')
      return
    }
    setHeroBusy(true)
    try {
      const uploaded: string[] = []
      for (const f of heroFiles) {
        const fd = new FormData()
        fd.set('file', f)
        fd.set('kind', 'hero')
        const up = await fetch('/api/upload', { method: 'POST', body: fd })
        const upJson = await up.json()
        if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')
        uploaded.push(upJson.publicUrl)
      }

      const prev = Array.isArray(settings.hero_images) ? settings.hero_images : []
      const next = [...prev, ...uploaded]
      const patch = { ...settings, hero_images: next }
      setSettings(patch)
      setHeroFiles([])
      await saveSettings(patch)

      setHeroMsg('✅ התמונות הועלו ונשמרו בהגדרות HERO')
    } catch (e: any) {
      setHeroMsg(friendlyError(e?.message || 'שגיאה'))
    } finally {
      setHeroBusy(false)
    }
  }

  async function removeHeroImage(url: string) {
    if (!settings) return
    if (!confirm('להסיר את התמונה מהרוטציה?')) return
    const prev = Array.isArray(settings.hero_images) ? settings.hero_images : []
    const next = prev.filter((u: string) => u !== url)
    const patch = { ...settings, hero_images: next }
    setSettings(patch)
    await saveSettings(patch)
  }

  
async function loadBlocks() {
    const res = await jfetch('/api/admin/blocks', { method: 'GET', headers: {} as any })
    setBlocks(res.blocks)
  }

  async function updateBlock(patch: any) {
    setErr(null)
    try {
      const res = await jfetch('/api/admin/blocks', { method: 'PUT', body: JSON.stringify(patch) })
      setBlocks(prev => prev.map(b => (b.id === res.block.id ? res.block : b)))
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
    }
  }

  async function loadPending() {
    const res = await jfetch(`/api/admin/posts?status=pending&kind=${pendingKind}`, { method: 'GET', headers: {} as any })
    setPending(res.posts)
    setPendingCount((res.posts || []).length)
  }

  async function fetchTopCounts() {
    try {
      const [b, g, ga] = await Promise.all([
        jfetch(`/api/admin/posts?status=pending&kind=blessing`, { method: 'GET', headers: {} as any }),
        jfetch(`/api/admin/posts?status=pending&kind=gallery`, { method: 'GET', headers: {} as any }),
        jfetch(`/api/admin/posts?status=pending&kind=gallery_admin`, { method: 'GET', headers: {} as any })
      ])

      const bCount = (b.posts || []).length
      const pCount = (g.posts || []).length + (ga.posts || []).length

      setPendingBlessingsCount(bCount)
      setPendingPhotosCount(pCount)
      setPendingCount(bCount + pCount)
    } catch {}
  }

  async function loadApprovedBlessings() {
    const res = await jfetch('/api/admin/posts?status=approved&kind=blessing', { method: 'GET', headers: {} as any })
    setApprovedBlessings(res.posts || [])
  }

  async function saveBlessingEdits() {
    if (!editBlessing?.id) return
    setErr(null)
    setEditBusy(true)
    try {
      const payload = {
        id: editBlessing.id,
        author_name: editBlessing.author_name || null,
        text: editBlessing.text || null,
        link_url: editBlessing.link_url || null,
        media_url: editBlessing.media_url || null,
        media_path: editBlessing.media_path || null,
        video_url: editBlessing.video_url || null
      }
      const res = await jfetch('/api/admin/posts', { method: 'PUT', body: JSON.stringify(payload) })
      setApprovedBlessings(prev => prev.map(p => (p.id === res.post.id ? res.post : p)))
      setPending(prev => prev.map(p => (p.id === res.post.id ? res.post : p)))
      setEditBlessing(null)
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה בשמירה'))
    } finally {
      setEditBusy(false)
    }
  }

  async function replaceBlessingMedia(file: File) {
    if (!editBlessing?.id) return
    setErr(null)
    setEditBusy(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('kind', 'blessing')
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const upJson = await up.json().catch(() => ({}))
      if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')

      const res = await jfetch('/api/admin/posts', {
        method: 'PUT',
        body: JSON.stringify({ id: editBlessing.id, media_path: upJson.path, media_url: upJson.publicUrl, video_url: null })
      })
      setApprovedBlessings(prev => prev.map(p => (p.id === res.post.id ? res.post : p)))
      setPending(prev => prev.map(p => (p.id === res.post.id ? res.post : p)))
      setEditBlessing(res.post)
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה בהחלפת מדיה'))
    } finally {
      setEditBusy(false)
    }
  }

  async function deleteBlessing(id: string) {
    if (!confirm('למחוק את הברכה?')) return
    setErr(null)
    try {
      const res = await jfetch('/api/admin/posts', { method: 'PUT', body: JSON.stringify({ id, status: 'deleted' }) })
      setApprovedBlessings(prev => prev.filter(p => p.id !== res.post.id))
      setPending(prev => prev.filter(p => p.id !== res.post.id))
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה במחיקה'))
    }
  }

  async function setPostStatus(id: string, status: string) {
    const res = await jfetch('/api/admin/posts', { method: 'PUT', body: JSON.stringify({ id, status }) })
    setPending(prev => prev.filter(p => p.id !== res.post.id))
  }

  async function loadAds() {
    const res = await jfetch('/api/admin/ads', { method: 'GET', headers: {} as any })
    setAds(res.ads)
  }

  async function createAd() {
    const res = await jfetch('/api/admin/ads', { method: 'POST', body: JSON.stringify(newAd) })
    setAds(prev => [res.ad, ...prev])
    setNewAd({ title: '', body: '', image_url: '', link_url: '', is_active: true })
  }

  async function toggleAd(id: string, is_active: boolean) {
    const res = await jfetch('/api/admin/ads', { method: 'PUT', body: JSON.stringify({ id, is_active }) })
    setAds(prev => prev.map(a => (a.id === id ? res.ad : a)))
  }

  async function loadAdminGallery() {
    const res = await jfetch('/api/admin/posts?status=approved&kind=gallery_admin', { method: 'GET', headers: {} as any })
    setAdminGallery(res.posts || [])
  }

  async function uploadAdminGalleryFiles() {
    setAdminMsg(null)
    if (!adminFiles.length) {
      setAdminMsg('בחר תמונות להעלאה')
      return
    }

    setAdminBusy(true)
    try {
      for (const f of adminFiles) {
        const fd = new FormData()
        fd.set('file', f)
        fd.set('kind', 'gallery_admin')

        const up = await fetch('/api/upload', { method: 'POST', body: fd })
        const upJson = await up.json().catch(() => ({}))
        if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')

        const created = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'gallery_admin',
            text: null,
            author_name: null,
            media_path: upJson.path,
            media_url: upJson.publicUrl
          })
        })
        const cJson = await created.json().catch(() => ({}))
        if (!created.ok) throw new Error(cJson?.error || 'שגיאה ביצירת פוסט')
      }

      setAdminFiles([])
      setAdminMsg('✅ הועלו התמונות בהצלחה')
      await loadAdminGallery()
    } catch (e: any) {
      setAdminMsg(friendlyError(e?.message || 'שגיאה בהעלאה'))
    } finally {
      setAdminBusy(false)
    }
  }

  async function deleteAdminImage(id: string) {
    if (!confirm('למחוק את התמונה?')) return
    setAdminMsg(null)
    try {
      await jfetch('/api/admin/gallery-admin', { method: 'DELETE', body: JSON.stringify({ id }) })
      setAdminGallery(prev => prev.filter(p => p.id !== id))
      setAdminMsg('✅ נמחק')
    } catch (e: any) {
      setAdminMsg(friendlyError(e?.message || 'שגיאה במחיקה'))
    }
  }

  async function loadDiag() {
    const d = await jfetch('/api/admin/diag', { method: 'GET', headers: {} as any })
    setDiag(d)
  }

  useEffect(() => {
    if (!admin) return
    if (tab === 'settings') loadSettings()
    if (tab === 'blocks') loadBlocks()
    if (tab === 'moderation') {
      loadPending()
      loadApprovedBlessings()
    }
    if (tab === 'ads') loadAds()
    if (tab === 'admin_gallery') loadAdminGallery()
    if (tab === 'diag') loadDiag()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, admin, pendingKind])

  /* ===== LOGIN UI ===== */
  if (!admin) {
    return (
      <Card>
        <h3 className="font-semibold">התחברות</h3>

        <div className="mt-3 grid gap-2">

              <Input
                className="text-right"
                dir="rtl"
                value={String(settings.blessings_title ?? '')}
                onChange={e => setSettings({ ...settings, blessings_title: e.target.value })}
                placeholder="כותרת בלוק/עמוד (למשל: ברכות / המלצות / חוות דעת)"
              />

              <Textarea
                className="text-right"
                dir="rtl"
                value={String(settings.blessings_label ?? '')}
                onChange={e => setSettings({ ...settings, blessings_label: e.target.value })}
                placeholder="תיאור מתחת לכותרת (מופיע בבית ובדף ברכות)"
                rows={2}
              />

              <label className="text-xs text-zinc-500 text-right">כמות ברכות בפריוויו בדף הבית</label>

              <Input
                className="text-right"
                dir="rtl"
                value={String(settings.blessings_preview_limit ?? 3)}
                onChange={e => setSettings({ ...settings, blessings_preview_limit: Number(e.target.value) })}
                placeholder="כמה ברכות להציג בפריוויו בדף הבית (למשל 3)"
              />

              <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                <input
                  type="checkbox"
                  checked={settings.blessings_show_all_button !== false}
                  onChange={e => setSettings({ ...settings, blessings_show_all_button: e.target.checked })}
                />
                להציג כפתור “שלח ברכה” בדף הבית
              </label>

              <label className="text-xs text-zinc-500 text-right">גודל תמונה/וידאו/Preview בברכות (px)</label>
              <Input
                className="text-right"
                dir="rtl"
                value={String(settings.blessings_media_size ?? 96)}
                onChange={e => setSettings({ ...settings, blessings_media_size: Number(e.target.value) })}
                placeholder="למשל 96"
              />

              <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                <input
                  type="checkbox"
                  checked={settings.link_preview_show_details === true}
                  onChange={e => setSettings({ ...settings, link_preview_show_details: e.target.checked })}
                />
                להציג פרטים בקישור (כותרת/תיאור). אם כבוי — תצוגה נקייה.
              </label>
            </div>

            {/* פוטר */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
              <p className="text-sm font-medium">פוטר</p>

              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!settings.footer_enabled}
                  onChange={e => setSettings({ ...settings, footer_enabled: e.target.checked })}
                />
                להציג פוטר
              </label>

              <Input
                value={settings.footer_label || ''}
                onChange={e => setSettings({ ...settings, footer_label: e.target.value })}
                placeholder="טקסט פוטר (למשל Active Bar)"
              />

              <Input
                value={settings.footer_url || ''}
                onChange={e => setSettings({ ...settings, footer_url: e.target.value })}
                placeholder="קישור פוטר"
                dir="ltr"
              />
            </div>

            <Button onClick={() => saveSettings()} disabled={saving}>
              {saving ? 'שומר...' : 'שמור'}
            </Button>

            {savedMsg && <p className="text-sm text-green-700">{savedMsg}</p>}
            {err && <p className="text-sm text-red-600">{err}</p>}
          </div>
        </Card>
      )}

      {/* ===== BLOCKS ===== */}
      {tab === 'blocks' && (
        <Card>
          <h3 className="font-semibold">בלוקים</h3>

          <div className="mt-3 grid gap-3">
            {blocks.map(b => (
              <div key={b.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <p className="font-medium">{b.type}</p>
                    <p className="text-xs text-zinc-500">סדר: {b.order_index}</p>
                  </div>
                  <label className="text-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!b.is_visible}
                      onChange={e => updateBlock({ id: b.id, is_visible: e.target.checked })}
                    />
                    מוצג
                  </label>
                </div>

                {b.type === 'gift' && (
                  <div className="mt-2 grid gap-2">
                    <Input
                      value={String(b.config?.auto_hide_after_hours ?? '')}
                      onChange={e => {
                        const v = e.target.value
                        updateBlock({ id: b.id, config: { ...(b.config || {}), auto_hide_after_hours: v ? Number(v) : null } })
                      }}
                      placeholder="הסתר אחרי X שעות (למשל 24)"
                    />
                    <p className="text-xs text-zinc-500">אחרי X שעות מתחילת האירוע — בלוק מתנה נעלם מהדף הראשי.</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </Card>
      )}

      {/* ===== MODERATION ===== */}
      {tab === 'moderation' && (
        <Card dir="rtl">
          <h3 className="font-semibold">אישור תכנים</h3>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button variant={pendingKind === 'blessing' ? 'primary' : 'ghost'} onClick={() => setPendingKind('blessing')}>
                ברכות
              </Button>
              <Button variant={pendingKind === 'gallery' ? 'primary' : 'ghost'} onClick={() => setPendingKind('gallery')}>
                תמונות אורחים
              </Button>
            </div>

            <Button
              variant="ghost"
              disabled={pending.length === 0}
              onClick={async () => {
                for (const p of pending) await setPostStatus(p.id, 'approved')
                await loadPending()
              }}
            >
              אשר הכל
            </Button>
          </div>

          <p className="mt-2 text-right text-sm text-zinc-600">ממתינות לאישור: {pending.length}</p>

          <div className="mt-3 grid gap-3">
            {pending.map(p => (
              <div key={p.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-right">
                    {p.kind === 'blessing' ? (p.author_name || 'אורח/ת') : (p.kind === 'gallery' ? 'תמונת אורחים' : 'תמונה')}
                  </p>
                  <p className="text-xs text-zinc-500" dir="ltr">{new Date(p.created_at).toLocaleString('he-IL')}</p>
                </div>

                {/* media (always centered) */}
                {(p.media_url || p.video_url) ? (
                  <div className="mt-3 flex justify-center">
                    <MediaBox media_url={p.media_url} video_url={p.video_url} size={safeBSize} />
                  </div>
                ) : null}

                {p.text && <p className="mt-3 whitespace-pre-wrap text-sm text-right">{p.text}</p>}

                {/* pending blessings: always show link preview (thumb + title + url), regardless of global "showDetails" */}
                {linkPreviewEnabled && p.link_url ? (
                  <div className="mt-3">
                    <LinkPreview url={p.link_url} size={safeBSize} showDetails={true} />
                  </div>
                ) : null}

                <div className="mt-2 flex gap-2">
                  {p.kind === 'blessing' && <Button variant="ghost" onClick={() => setEditBlessing(p)}>ערוך</Button>}
                  <Button onClick={() => setPostStatus(p.id, 'approved')}>אשר</Button>
                  <Button variant="ghost" onClick={() => setPostStatus(p.id, 'deleted')}>מחק</Button>
                </div>
              </div>
            ))}
            {pending.length === 0 && <p className="text-sm text-zinc-600">אין ממתינים.</p>}
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">ברכות מאושרות</h4>
              <Button variant="ghost" onClick={loadApprovedBlessings}>רענן</Button>
            </div>

            <div className="mt-3 grid gap-3">
              {approvedBlessings.map(b => (
                <div key={b.id} className="rounded-xl border border-zinc-200 p-3" dir="rtl">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-right">{b.author_name || 'אורח/ת'}</p>
                    <p className="text-xs text-zinc-500" dir="ltr">{new Date(b.created_at).toLocaleString('he-IL')}</p>
                  </div>

                  {/* media centered */}
                  {(b.media_url || b.video_url) ? (
                    <div className="mt-3 flex justify-center">
                      <MediaBox media_url={b.media_url} video_url={b.video_url} size={safeBSize} />
                    </div>
                  ) : null}

                  {b.text && <p className="mt-3 whitespace-pre-wrap text-sm text-right">{b.text}</p>}

                  {/* Approved: show link preview details only when toggle is ON */}
                  {linkPreviewEnabled && b.link_url ? (
                    <div className="mt-3">
                      <LinkPreview url={b.link_url} size={safeBSize} showDetails={showLinkDetails} />
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setEditBlessing(b)}>ערוך</Button>
                    <Button variant="ghost" onClick={() => deleteBlessing(b.id)}>מחק</Button>
                  </div>
                </div>
              ))}
              {approvedBlessings.length === 0 && <p className="text-sm text-zinc-600">אין ברכות מאושרות.</p>}
            </div>
          </div>

          {editBlessing && (
            <div className="fixed inset-0 z-50 bg-black/60 p-4" onClick={() => setEditBlessing(null)}>
              <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-semibold">עריכת ברכה</h3>

                <div className="mt-3 grid gap-2">
                  <Input placeholder="שם" value={editBlessing.author_name || ''} onChange={e => setEditBlessing({ ...editBlessing, author_name: e.target.value })} />
                  <Textarea placeholder="טקסט" rows={4} value={editBlessing.text || ''} onChange={e => setEditBlessing({ ...editBlessing, text: e.target.value })} />
                  <Input placeholder="קישור (לא חובה)" value={editBlessing.link_url || ''} onChange={e => setEditBlessing({ ...editBlessing, link_url: e.target.value })} dir="ltr" />

                  {editBlessing.link_url ? <LinkPreview url={editBlessing.link_url} size={safeBSize} showDetails={showLinkDetails} /> : null}

                  <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
                    <p className="text-sm font-medium">מדיה</p>

                    <div className="flex items-center justify-between gap-3">
                      <MediaBox media_url={editBlessing.media_url} video_url={editBlessing.video_url} size={safeBSize} />
                      {(editBlessing.media_url || editBlessing.video_url) && (
                        <a className="text-sm underline" href={(editBlessing.video_url || editBlessing.media_url) as string} target="_blank" rel="noreferrer">
                          פתח מדיה נוכחית
                        </a>
                      )}
                    </div>

                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) replaceBlessingMedia(f)
                      }}
                    />

                    <Button
                      variant="ghost"
                      onClick={() => setEditBlessing({ ...editBlessing, media_url: null, media_path: null, video_url: null })}
                    >
                      הסר מדיה
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={saveBlessingEdits} disabled={editBusy}>{editBusy ? 'שומר...' : 'שמור'}</Button>
                    <Button variant="ghost" onClick={() => setEditBlessing(null)}>סגור</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </Card>
      )}

      {/* ===== ADS ===== */}
      {tab === 'ads' && (
        <Card>
          <h3 className="font-semibold">פרסומות</h3>

          <div className="mt-3 grid gap-2 rounded-xl border border-zinc-200 p-3">
            <Input placeholder="כותרת" value={newAd.title} onChange={e => setNewAd({ ...newAd, title: e.target.value })} />
            <Textarea placeholder="טקסט (לא חובה)" rows={2} value={newAd.body} onChange={e => setNewAd({ ...newAd, body: e.target.value })} />
            <Input placeholder="image_url (לא חובה)" value={newAd.image_url} onChange={e => setNewAd({ ...newAd, image_url: e.target.value })} dir="ltr" />
            <Input placeholder="link_url (לא חובה)" value={newAd.link_url} onChange={e => setNewAd({ ...newAd, link_url: e.target.value })} dir="ltr" />
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={!!newAd.is_active} onChange={e => setNewAd({ ...newAd, is_active: e.target.checked })} />
              פעיל
            </label>
            <Button onClick={createAd} disabled={!newAd.title}>הוסף פרסומת</Button>
          </div>

          <div className="mt-3 grid gap-3">
            {ads.map(a => (
              <div key={a.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-right">
                    <p className="font-medium">{a.title}</p>
                    {a.link_url && <p className="text-xs text-zinc-500">{a.link_url}</p>}
                  </div>
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={!!a.is_active} onChange={e => toggleAd(a.id, e.target.checked)} />
                    פעיל
                  </label>
                </div>
                {a.body && <p className="mt-2 text-sm">{a.body}</p>}
              </div>
            ))}
            {ads.length === 0 && <p className="text-sm text-zinc-600">אין פרסומות.</p>}
          </div>
        </Card>
      )}

      {/* ===== ADMIN GALLERY ===== */}
      {tab === 'admin_gallery' && (
        <Card>
          <h3 className="font-semibold">גלריית מנהל</h3>

          <div className="mt-3 grid gap-2 rounded-xl border border-zinc-200 p-3">
            <input type="file" accept="image/*" multiple onChange={e => setAdminFiles(Array.from(e.target.files || []))} />
            <Button onClick={uploadAdminGalleryFiles} disabled={adminBusy || adminFiles.length === 0}>
              {adminBusy ? 'מעלה...' : `העלה ${adminFiles.length || ''} תמונות`}
            </Button>
            {adminMsg && <p className="text-sm text-zinc-700">{adminMsg}</p>}
          </div>

          {lightbox && (
  <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
    <div className="relative mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <Button variant="ghost" onClick={() => triggerDownload(lightbox)} className="bg-white/90 text-black shadow hover:bg-white" type="button">הורד תמונה</Button>
        <Button variant="ghost" onClick={() => setLightbox(null)} className="bg-white/90 text-black shadow hover:bg-white" type="button">סגור</Button>
      </div>

      <img src={lightbox} alt="" className="w-full rounded-2xl bg-white" />
    </div>
  </div>
)}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {adminGallery.map((p: any) => (
              <div key={p.id} className="rounded-2xl border border-zinc-200 overflow-hidden">
                <button className="relative block aspect-square w-full bg-zinc-50" onClick={() => p.media_url && setLightbox(p.media_url)} type="button">
                  <img src={p.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                </button>

                <div className="p-3">
                  <p className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleString('he-IL')}</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="ghost" onClick={() => deleteAdminImage(p.id)}>מחק</Button>
                    {p.media_url && <a className="text-sm underline" href={p.media_url} target="_blank" rel="noreferrer">פתח</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {adminGallery.length === 0 && <p className="mt-3 text-sm text-zinc-600">אין עדיין תמונות בגלריית מנהל.</p>}
        </Card>
      )}

      {/* ===== DIAG ===== */}
      {tab === 'diag' && (
        <Card>
          <h3 className="font-semibold">דיאגנוסטיקה</h3>

          <div className="mt-3 grid gap-2">
            <Button variant="ghost" onClick={loadDiag}>רענן דיאגנוסטיקה</Button>
            <div className="rounded-xl border border-zinc-200 p-3 text-xs">
              <pre className="whitespace-pre-wrap">{JSON.stringify(diag, null, 2)}</pre>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
