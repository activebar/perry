'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, Textarea } from '@/components/ui'


type UnfurlData = { url: string; title: string; description: string; image: string; site_name: string }
const unfurlCache = new Map<string, UnfurlData>()

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
        const res = await fetch(`/api/unfurl?url=${encodeURIComponent(u)}`)
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

  return (
    <a
      href={d.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex gap-3 rounded-xl border border-zinc-200 bg-white p-2 hover:bg-zinc-50"
    >
      {d.image ? (
        <img src={d.image} alt="" className="h-20 w-24 rounded-lg object-cover" />
      ) : (
        <div className="h-20 w-24 rounded-lg bg-zinc-100" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{d.title || d.site_name || 'קישור'}</p>
        {d.description && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">{d.description}</p>}
        <p className="mt-1 text-[11px] text-zinc-500">{d.site_name || new URL(d.url).hostname}</p>
      </div>
    </a>
  )
}

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
  return msg || 'שגיאה'
}

function fmt(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' })
}

// Convert ISO (timestamptz) -> value for <input type="datetime-local">
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

// Convert datetime-local -> ISO string (keeps local timezone when creating Date)
function localInputToIso(v?: string) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
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
  const [startAtLocal, setStartAtLocal] = useState('') // datetime-local UI

  // hero images
  const [heroFiles, setHeroFiles] = useState<File[]>([])
  const [heroBusy, setHeroBusy] = useState(false)
  const [heroMsg, setHeroMsg] = useState<string | null>(null)

  // blocks
  const [blocks, setBlocks] = useState<any[]>([])

  // moderation
  const [pendingKind, setPendingKind] = useState<'blessing' | 'gallery'>('blessing')
  const [pending, setPending] = useState<any[]>([])
  const [pendingCount, setPendingCount] = useState(0)


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

  // diag
  const [diag, setDiag] = useState<any | null>(null)

  async function refreshMe() {
    try {
      const me = await jfetch('/api/admin/me', { method: 'GET', headers: {} as any })
      setAdmin(me.admin)
      setTab('settings')
    } catch {
      setAdmin(null)
      setTab('login')
    }
  }

  useEffect(() => {
    refreshMe()
  }, [])

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
    await jfetch('/api/admin/logout', { method: 'POST', body: '{}' })
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

      // apply datetime-local into start_at ISO
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
        video_url: editBlessing.video_url || null,
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
      const upJson = await up.json()
      if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')

      const res = await jfetch('/api/admin/posts', {
        method: 'PUT',
        body: JSON.stringify({ id: editBlessing.id, media_path: upJson.path, media_url: upJson.publicUrl })
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
        const upJson = await up.json()
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
        const cJson = await created.json()
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
    if (tab === 'moderation') { loadPending(); loadApprovedBlessings(); }
    if (tab === 'ads') loadAds()
    if (tab === 'admin_gallery') loadAdminGallery()
    if (tab === 'diag') loadDiag()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, admin, pendingKind])

  // ===== LOGIN UI =====
  if (!admin) {
    return (
      <Card>
        <h3 className="font-semibold">התחברות</h3>

        <div className="mt-3 grid gap-2">
          <Input placeholder="שם משתמש" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />

          <div className="relative">
            <Input
              placeholder="סיסמה"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="pr-12"
              onKeyDown={e => {
                // @ts-ignore
                if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
                if (e.key === 'Enter' && username && password && !busy) login()
              }}
              onKeyUp={e => {
                // @ts-ignore
                if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
              }}
              onFocus={e => {
                // @ts-ignore
                if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
              }}
            />

            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
              aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              title={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {capsOn && <p className="text-xs text-amber-700">⚠️ נראה ש־Caps Lock דולק.</p>}

          <Button onClick={login} disabled={busy || !username || !password}>
            {busy ? 'מתחבר...' : 'התחבר'}
          </Button>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </Card>
    )
  }

  // ===== AUTHENTICATED UI =====
  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-right">
            <p className="text-sm text-zinc-600">מחובר: {admin.email}</p>
            <p className="text-xs text-zinc-500">Role: {admin.role}</p>
            {pendingCount > 0 && (
              <p className="text-xs text-amber-700">ממתינות לאישור: {pendingCount}</p>
            )}

            {settings?.updated_at && <p className="text-xs text-zinc-500">עודכן לאחרונה: {fmt(settings.updated_at)}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map(t => (
              <Button key={t} variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>
                {t === "moderation" && pendingCount > 0 ? `${TAB_LABEL[t]} (${pendingCount})` : (TAB_LABEL[t] ?? t)}
              </Button>
            ))}
            <Button variant="ghost" onClick={logout}>יציאה</Button>
          </div>
        </div>
      </Card>

      {tab === 'settings' && settings && (
        <Card>
          <h3 className="font-semibold">הגדרות כלליות</h3>

          <div className="mt-3 grid gap-2">
            <Input value={settings.event_name || ''} onChange={e => setSettings({ ...settings, event_name: e.target.value })} placeholder="שם אירוע" />

            {/* start_at as datetime-local */}
            <div className="grid gap-1">
              <label className="text-xs text-zinc-500">תאריך ושעה (start_at)</label>
              <input
                type="datetime-local"
                value={startAtLocal}
                onChange={e => setStartAtLocal(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
              {settings.updated_at && <p className="text-[11px] text-zinc-500">עודכן לאחרונה: {fmt(settings.updated_at)}</p>}
            </div>

            <Input value={settings.location_text || ''} onChange={e => setSettings({ ...settings, location_text: e.target.value })} placeholder="מיקום" />

            <Input value={settings.waze_url || ''} onChange={e => setSettings({ ...settings, waze_url: e.target.value })} placeholder="קישור Waze" />

            <Textarea value={settings.thank_you_text || ''} onChange={e => setSettings({ ...settings, thank_you_text: e.target.value })} placeholder="טקסט תודה (כללי)" rows={3} />

            {/* HERO */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
              <p className="text-sm font-medium">HERO – טקסטים + תמונות</p>

              <div className="mt-3 rounded-2xl border border-zinc-200 p-3">
                <p className="font-semibold text-right">ברכות בדף הבית</p>
                <div className="mt-2 grid gap-2">
                  <Input
                    value={String(settings.blessings_preview_limit ?? 3)}
                    onChange={e => setSettings({ ...settings, blessings_preview_limit: Number(e.target.value) })}
                    placeholder="כמה ברכות להציג בפריוויו בדף הבית (למשל 3)"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.blessings_show_all_button !== false}
                      onChange={e => setSettings({ ...settings, blessings_show_all_button: e.target.checked })}
                    />
                    להציג כפתור “לכל הברכות” בדף הבית
                  </label>
                </div>
              </div>

              <Textarea
                value={settings.hero_pre_text || ''}
                onChange={e => setSettings({ ...settings, hero_pre_text: e.target.value })}
                placeholder="טקסט לפני האירוע (עד 30 דק׳ אחרי start_at)"
                rows={4}
              />

              <Textarea
                value={settings.hero_live_text || ''}
                onChange={e => setSettings({ ...settings, hero_live_text: e.target.value })}
                placeholder="טקסט בזמן האירוע (אחרי 30 דק׳ ועד יום אחרי)"
                rows={3}
              />

              <Textarea
                value={settings.hero_post_text || ''}
                onChange={e => setSettings({ ...settings, hero_post_text: e.target.value })}
                placeholder="טקסט אחרי האירוע"
                rows={4}
              />

              <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
                <p className="text-sm font-medium">תמונות מתחלפות</p>

                <div className="flex flex-wrap items-center gap-2">
                  <input type="file" accept="image/*" multiple onChange={e => setHeroFiles(Array.from(e.target.files || []))} />
                  <Button onClick={uploadHeroImages} disabled={heroBusy || heroFiles.length === 0}>
                    {heroBusy ? 'מעלה...' : `העלה ${heroFiles.length || ''} תמונות`}
                  </Button>
                </div>

                {heroMsg && <p className="text-sm text-zinc-700">{heroMsg}</p>}

                <div className="grid gap-2">
                  <label className="text-xs text-zinc-500">מהירות החלפה (שניות)</label>
                  <Input
                    value={String(settings.hero_rotate_seconds ?? 5)}
                    onChange={e => setSettings({ ...settings, hero_rotate_seconds: Number(e.target.value) })}
                    placeholder="למשל 5"
                  />
                </div>

                {Array.isArray(settings.hero_images) && settings.hero_images.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {settings.hero_images.map((u: string) => (
                      <div key={u} className="overflow-hidden rounded-2xl border border-zinc-200">
                        <div className="relative aspect-[16/9] bg-zinc-50">
                          <img src={u} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        </div>
                        <div className="p-2 flex items-center justify-between gap-2">
                          <Button variant="ghost" onClick={() => removeHeroImage(u)}>הסר</Button>
                          <a className="text-xs underline" href={u} target="_blank" rel="noreferrer">פתח</a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(!Array.isArray(settings.hero_images) || settings.hero_images.length === 0) && (
                  <p className="text-xs text-zinc-500">אין עדיין תמונות HERO.</p>
                )}
              </div>
            </div>

            {/* מתנות */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
              <p className="text-sm font-medium">מתנות</p>
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={!!settings.gift_enabled} onChange={e => setSettings({ ...settings, gift_enabled: e.target.checked })} />
                הצג בלוק מתנה
              </label>

              <Input value={settings.gift_bit_url || ''} onChange={e => setSettings({ ...settings, gift_bit_url: e.target.value })} placeholder="Bit URL" />
              <Input value={settings.gift_paybox_url || ''} onChange={e => setSettings({ ...settings, gift_paybox_url: e.target.value })} placeholder="PayBox URL" />

              <Input value={settings.gift_bit_image_url || ''} onChange={e => setSettings({ ...settings, gift_bit_image_url: e.target.value })} placeholder="Bit image URL (לא חובה)" />
              <Input value={settings.gift_paybox_image_url || ''} onChange={e => setSettings({ ...settings, gift_paybox_image_url: e.target.value })} placeholder="PayBox image URL (לא חובה)" />

              <Input
                value={String(settings.gift_image_diameter ?? 160)}
                onChange={e => setSettings({ ...settings, gift_image_diameter: Number(e.target.value) })}
                placeholder="קוטר תמונה (px)"
              />
            </div>

            {/* אישורים / מחיקה אוטומטית */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
              <p className="text-sm font-medium">אישורים / מחיקה אוטומטית</p>

              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!settings.require_approval}
                  onChange={e => setSettings({ ...settings, require_approval: e.target.checked })}
                />
                ברכות/תמונות דורשות אישור מנהל
              </label>

              <Input
                value={String(settings.approval_lock_after_days ?? 7)}
                onChange={e => setSettings({ ...settings, approval_lock_after_days: Number(e.target.value) })}
                placeholder="אחרי כמה ימים מהאירוע להפעיל אישור אוטומטי"
              />
              <p className="text-[11px] text-zinc-500">
                אחרי X ימים מתאריך האירוע — המערכת תדליק אוטומטית "דורש אישור מנהל". אפשר לפתוח ידנית, וזה יינעל שוב אחרי אותו X.
              </p>

              <Input
                value={String(settings.archive_after_days ?? 120)}
                onChange={e => setSettings({ ...settings, archive_after_days: Number(e.target.value) })}
                placeholder="כמה ימים עד ארכיון (Drive)"
              />

              <Input
                value={String(settings.delete_after_hours ?? 24)}
                onChange={e => setSettings({ ...settings, delete_after_hours: Number(e.target.value) })}
                placeholder="כמה שעות עד מחיקה לאחר ארכיון"
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

      {tab === 'blocks' && (
        <Card>
          <h3 className="font-semibold">בלוקים</h3>
          <p className="text-xs text-zinc-500">הצגה/הסתרה + auto-hide ל־Gift.</p>

          <div className="mt-3 grid gap-3">
            {blocks.map(b => (
              <div key={b.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <p className="font-medium">{b.type}</p>
                    <p className="text-xs text-zinc-500">סדר: {b.order_index}</p>
                  </div>
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={!!b.is_visible} onChange={e => updateBlock({ id: b.id, is_visible: e.target.checked })} />
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
        </Card>
      )}

      {tab === 'moderation' && (
        <Card>
          <h3 className="font-semibold">אישור תכנים</h3>
          <p className="mt-2 text-right text-sm text-zinc-600">ממתינות לאישור: {pending.length}</p>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              disabled={pending.length === 0}
              onClick={async () => {
                for (const p of pending) {
                  await setPostStatus(p.id, "approved")
                }
                await loadPending()
              }}
            >
              אשר הכל
            </Button>
          </div>


          <div className="mt-3 grid gap-3">
            {pending.map(p => (
                <div key={p.id} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleString('he-IL')}</p>

                  <div className="mt-1 flex items-start justify-between gap-3">
                    <div className="text-right">
                      <p className="font-semibold">
                        {p.kind === 'blessing' ? (p.author_name || 'אורח/ת') : (p.kind === 'gallery' ? 'תמונת אורחים' : 'תמונת מנהל')}
                      </p>
                      {p.text && <p className="mt-1 whitespace-pre-wrap text-sm">{p.text}</p>}
                      {p.link_url && (
                        <a className="mt-2 inline-block text-sm underline" href={p.link_url} target="_blank" rel="noreferrer">
                          פתח קישור
                        </a>
                      )}
                    </div>

                    {p.media_url && (
                      <div className="h-24 w-24 overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200">
                        <img src={p.media_url} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                  </div>
                {p.text && <p className="mt-1 whitespace-pre-wrap text-sm">{p.text}</p>}
                {p.media_url && <a className="mt-2 block text-sm underline" href={p.media_url} target="_blank" rel="noreferrer">פתח מדיה</a>}
                <div className="mt-2 flex gap-2">
                  {p.kind === 'blessing' && (
                    <Button variant="ghost" onClick={() => setEditBlessing(p)}>ערוך</Button>
                  )}
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
                <div key={b.id} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{new Date(b.created_at).toLocaleString('he-IL')}</p>
                  {(b.author_name || b.text) && (
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {b.author_name ? <span className="font-semibold">{b.author_name}: </span> : null}
                      {b.text || ''}
                    </p>
                  )}
                  {b.media_url && <a className="mt-2 block text-sm" href={b.media_url} target="_blank" rel="noreferrer">פתח מדיה</a>}
                  {b.link_url && <a className="mt-1 block text-sm" href={b.link_url} target="_blank" rel="noreferrer">פתח קישור</a>}

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
                  <Input
                    placeholder="שם"
                    value={editBlessing.author_name || ''}
                    onChange={e => setEditBlessing({ ...editBlessing, author_name: e.target.value })}
                  />
                  <Textarea
                    placeholder="טקסט"
                    rows={4}
                    value={editBlessing.text || ''}
                    onChange={e => setEditBlessing({ ...editBlessing, text: e.target.value })}
                  />
                  <Input
                    placeholder="קישור (לא חובה)"
                    value={editBlessing.link_url || ''}
                    onChange={e => setEditBlessing({ ...editBlessing, link_url: e.target.value })}
                  />

                  <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
                    <p className="text-sm font-medium">מדיה</p>
                    {editBlessing.media_url ? (
                      <a className="text-sm underline" href={editBlessing.media_url} target="_blank" rel="noreferrer">פתח מדיה נוכחית</a>
                    ) : (
                      <p className="text-sm text-zinc-500">אין מדיה</p>
                    )}

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
                    <Button onClick={saveBlessingEdits} disabled={editBusy}>
                      {editBusy ? 'שומר...' : 'שמור'}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditBlessing(null)}>סגור</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </Card>
      )}

      {tab === 'ads' && (
        <Card>
          <h3 className="font-semibold">פרסומות</h3>

          <div className="mt-3 grid gap-2 rounded-xl border border-zinc-200 p-3">
            <Input placeholder="כותרת" value={newAd.title} onChange={e => setNewAd({ ...newAd, title: e.target.value })} />
            <Textarea placeholder="טקסט (לא חובה)" rows={2} value={newAd.body} onChange={e => setNewAd({ ...newAd, body: e.target.value })} />
            <Input placeholder="image_url (לא חובה)" value={newAd.image_url} onChange={e => setNewAd({ ...newAd, image_url: e.target.value })} />
            <Input placeholder="link_url (לא חובה)" value={newAd.link_url} onChange={e => setNewAd({ ...newAd, link_url: e.target.value })} />
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

      {tab === 'admin_gallery' && (
        <Card>
          <h3 className="font-semibold">גלריית מנהל</h3>
          <p className="text-xs text-zinc-500">העלאה מרובת תמונות + תצוגה + מחיקה.</p>

          <div className="mt-3 grid gap-2 rounded-xl border border-zinc-200 p-3">
            <input type="file" accept="image/*" multiple onChange={e => setAdminFiles(Array.from(e.target.files || []))} />
            <Button onClick={uploadAdminGalleryFiles} disabled={adminBusy || adminFiles.length === 0}>
              {adminBusy ? 'מעלה...' : `העלה ${adminFiles.length || ''} תמונות`}
            </Button>
            {adminMsg && <p className="text-sm text-zinc-700">{adminMsg}</p>}
          </div>

          {lightbox && (
            <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
              <div className="mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
                <img src={lightbox} alt="" className="w-full rounded-2xl bg-white" />
                <div className="mt-3 text-center">
                  <Button variant="ghost" onClick={() => setLightbox(null)} className="text-white hover:bg-white/10">סגור</Button>
                </div>
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
                    {p.media_url && (
                      <a className="text-sm underline" href={p.media_url} target="_blank" rel="noreferrer">פתח</a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {adminGallery.length === 0 && <p className="mt-3 text-sm text-zinc-600">אין עדיין תמונות בגלריית מנהל.</p>}
        </Card>
      )}

      {tab === 'diag' && (
        <Card>
          <h3 className="font-semibold">דיאגנוסטיקה</h3>
          <p className="text-xs text-zinc-500">בדיקות מהירות כדי להבין למה משהו לא מסתנכרן.</p>

          <div className="mt-3 grid gap-2">
            <Button variant="ghost" onClick={loadDiag}>רענן דיאגנוסטיקה</Button>

            <div className="rounded-xl border border-zinc-200 p-3 text-xs">
              <pre className="whitespace-pre-wrap">{JSON.stringify(diag, null, 2)}</pre>
            </div>

            <p className="text-xs text-zinc-500">אפשר לפתוח ישירות: /api/admin/diag</p>
          </div>
        </Card>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  )
}
