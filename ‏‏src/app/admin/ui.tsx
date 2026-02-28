'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, Textarea } from '@/components/ui'
import QrPanel from '@/components/qr/QrPanel'
import PermissionsPanel from './PermissionsPanel'

const DEFAULT_EVENT_ID = (process.env.NEXT_PUBLIC_EVENT_ID || '').trim() || 'IDO'

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('failed to load image'))
    })
    return img
  } finally {
    // keep objectURL alive until image loads; safe to revoke here after load
    URL.revokeObjectURL(url)
  }
}

/**
 * Create a 1200x630 JPEG for OpenGraph.
 * focusX/focusY are 0..1 representing the desired center point.
 */
async function makeOgJpeg(file: File, focusX: number, focusY: number): Promise<Blob> {
  const img = await fileToImage(file)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height

  const targetW = 800
  const targetH = 800
  const targetAspect = targetW / targetH
  const srcAspect = srcW / srcH

  let cropW = srcW
  let cropH = srcH
  if (srcAspect > targetAspect) {
    // too wide
    cropH = srcH
    cropW = Math.round(srcH * targetAspect)
  } else {
    // too tall
    cropW = srcW
    cropH = Math.round(srcW / targetAspect)
  }

  const cx = focusX * srcW
  const cy = focusY * srcH
  let sx = Math.round(cx - cropW / 2)
  let sy = Math.round(cy - cropH / 2)
  sx = Math.max(0, Math.min(sx, srcW - cropW))
  sy = Math.max(0, Math.min(sy, srcH - cropH))

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas not supported')

  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, targetW, targetH)

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('failed to encode image'))),
      'image/jpeg',
      0.92
    )
  })
  return blob
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
    if (host === 'youtu.be') id = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
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
        <video src={url} className="absolute inset-0 h-full w-full object-cover object-top" muted playsInline />
      ) : (
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
    </a>
  )
}

/* ===================== Admin App ===================== */

type Admin = { role: 'master' | 'client'; username: string; email: string; event_id?: string; access_id?: string }
type Tab = 'login' | 'settings' | 'blocks' | 'moderation' | 'ads' | 'admin_gallery' | 'diag' | 'permissions' | 'ai' | 'clone'

const TAB_LABEL: Record<string, string> = {
  settings: 'הגדרות',
  blocks: 'בלוקים',
  moderation: 'אישור תכנים',
  ads: 'פרסומות',
  admin_gallery: 'גלריית מנהל',
  diag: 'דיאגנוסטיקה',
  permissions: 'הרשאות',
  ai: 'AI',
  clone: 'שכפול',
  login: 'התחברות'
}

function addEventParam(url: string) {
  // Admin runs in the browser; we use the current URL query (?event=ido) to scope admin API calls.
  try {
    const ev = new URLSearchParams(window.location.search).get('event')
    if (!ev) return url

    const u = new URL(url, window.location.origin)
    if (!u.searchParams.get('event')) u.searchParams.set('event', ev)
    return u.pathname + (u.search || '')
  } catch {
    return url
  }
}

async function jfetch(url: string, opts?: RequestInit) {
  const res = await fetch(addEventParam(url), {
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
  if (m.includes('forbidden')) return 'אין לך הרשאה לבצע פעולה זו.'
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

export default function AdminApp({
  initialTab,
  initialPendingKind,
  embeddedMode,
  eventIdOverride,
}: {
  initialTab?: Tab
  initialPendingKind?: 'blessing' | 'gallery'
  embeddedMode?: boolean
  eventIdOverride?: string
} = {}) {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab || 'login')
  const [err, setErr] = useState<string | null>(null)

  // active event id: prefer event-access session, fallback to env
  const activeEventId = (eventIdOverride || admin?.event_id || String(process.env.NEXT_PUBLIC_EVENT_ID || process.env.EVENT_ID || '').trim() || DEFAULT_EVENT_ID).trim()

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

  // OG default image uploader (1200x630)
  const [ogFile, setOgFile] = useState<File | null>(null)
  const [ogPreview, setOgPreview] = useState<string>('')
  const [ogFocus, setOgFocus] = useState({ x: 0.5, y: 0.5 })
  const [ogUploading, setOgUploading] = useState(false)
  const [ogMsg, setOgMsg] = useState<string | null>(null)
  // Cache-buster for admin preview. Supabase public URLs may be cached in the browser.
  const [ogPreviewKey, setOgPreviewKey] = useState<number>(() => Date.now())

  const qrUrl = useMemo(() => {
    if (!settings) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const path = String(settings?.qr_target_path || '/blessings')
    return origin ? `${origin}${path}` : path
  }, [settings?.qr_target_path, settings])

  useEffect(() => {
    if (!ogFile) {
      setOgPreview('')
      setOgFocus({ x: 0.5, y: 0.5 })
      return
    }
    const u = URL.createObjectURL(ogFile)
    setOgPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [ogFile])

  // HERO upload
  const [heroFiles, setHeroFiles] = useState<File[]>([])
  const [heroBusy, setHeroBusy] = useState(false)
  const [heroMsg, setHeroMsg] = useState<string | null>(null)

  // blocks
  const [blocks, setBlocks] = useState<any[]>([])

  // content rules (allow/block)
  type ContentRule = {
    id: number | string
    rule_type: 'block' | 'allow'
    scope: 'event' | 'global'
    match_type: 'contains' | 'exact' | 'word'
    expression: string
    note: string | null
    is_active: boolean
    created_at?: string
    updated_at?: string
  }

  const [contentRules, setContentRules] = useState<ContentRule[]>([])
  const [rulesMsg, setRulesMsg] = useState<string | null>(null)

  // rule editor
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [ruleType, setRuleType] = useState<'block' | 'allow'>('block')
  const [ruleScope, setRuleScope] = useState<'event' | 'global'>('event')
  const [ruleMatchType, setRuleMatchType] = useState<'contains' | 'exact' | 'word'>('contains')
  const [ruleExpression, setRuleExpression] = useState('')
  const [ruleNote, setRuleNote] = useState('')
  const [ruleIsActive, setRuleIsActive] = useState(true)

  // moderation
  const [pendingKind, setPendingKind] = useState<'blessing' | 'gallery'>(initialPendingKind || 'blessing')
  const [pending, setPending] = useState<any[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingBlessingsCount, setPendingBlessingsCount] = useState(0)
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
  // galleries management (new)
  const [galleries, setGalleries] = useState<any[]>([])
  const galleriesTotalPending = useMemo(() => galleries.reduce((sum: number, g: any) => sum + (g?.pending_count || 0), 0), [galleries])
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>('')
  const [galleryBusy, setGalleryBusy] = useState(false)
  const [galleryMsg, setGalleryMsg] = useState<string | null>(null)
  const [pendingMedia, setPendingMedia] = useState<any[]>([])
  const [approvedMedia, setApprovedMedia] = useState<any[]>([])
  // Selection + download (admin gallery only)
  const DIRECT_MAX = 8
  const ZIP_MAX = 2000

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedCount = useMemo(() => Object.keys(selected).length, [selected])

  const clearSelected = () => setSelected({})

  const toggleSelected = (id: string) => {
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

  const selectAllApproved = () => {
    setErr('')
    const all = approvedMedia.slice(0, ZIP_MAX)
    const next: Record<string, boolean> = {}
    for (const it of all) next[it.id] = true
    setSelected(next)
    if (approvedMedia.length > ZIP_MAX) setErr(`בוצעה בחירה של ${ZIP_MAX} תמונות (מגבלת בטיחות)`)
  }


  const downloadSelectedDirect = async () => {
    try {
      setErr('')
      setGalleryMsg('')
      const ids = Object.keys(selected)
      if (ids.length === 0) return
      if (ids.length > DIRECT_MAX) return downloadSelectedZip()

      // Download sequentially (some browsers block too many parallel downloads)
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const it = approvedMedia.find(x => x.id === id)
        if (!it?.public_url) continue
        const base = `activebar_${String(i + 1).padStart(2, '0')}`
        await triggerDownload(it.public_url, base)
        await new Promise(r => setTimeout(r, 250))
      }

      setGalleryMsg('✅ ההורדות התחילו')
      clearSelected()
      setSelectMode(false)
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בהורדה')
    }
  }

  const downloadSelectedZip = async () => {
    try {
      setErr('')
      setGalleryMsg('')
      const ids = Object.keys(selected)
      if (ids.length === 0) return

      const JSZipMod: any = await import('jszip')
      const zip = new (JSZipMod.default || JSZipMod)()

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const it = approvedMedia.find(x => x.id === id)
        if (!it?.public_url) continue
        const res = await fetch(it.public_url)
        const blob = await res.blob()
        const ext =
          blob.type === 'image/png' ? 'png' :
          blob.type === 'image/webp' ? 'webp' :
          blob.type === 'image/jpeg' ? 'jpg' : 'jpg'
        const name = `activebar_${String(i + 1).padStart(2, '0')}.${ext}`
        zip.file(name, blob)
      }

      const out = await zip.generateAsync({ type: 'blob' })
      const href = URL.createObjectURL(out)
      const a = document.createElement('a')
      a.href = href
      a.download = `activebar_gallery_${selectedGalleryId || 'selected'}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)

      setGalleryMsg('✅ הורדת ZIP התחילה')
      clearSelected()
      setSelectMode(false)
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בהורדת ZIP')
    }
  }
  const [hoursToOpen, setHoursToOpen] = useState<number>(8)


  async function triggerDownload(url: string, filenameBase?: string) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)

      const ext =
        blob.type === 'image/png' ? 'png' :
        blob.type === 'image/webp' ? 'webp' :
        blob.type === 'image/jpeg' ? 'jpg' : 'jpg'

      const safeBase = (filenameBase || (url.split('/').pop() || 'activebar').split('?')[0] || 'activebar')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_\-]+/g, '_')
        .slice(0, 60) || 'activebar'

      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${safeBase}.${ext}`
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
      setTab((initialTab && initialTab !== 'login' ? initialTab : 'settings') as Tab)
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
    const baseTabs: Tab[] = ['settings', 'blocks', 'moderation', 'ads', 'admin_gallery', 'ai', 'clone', 'diag']
    return admin.role === 'master' ? (['permissions', ...baseTabs] as Tab[]) : baseTabs
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

  async function loadContentRules() {
    const r = await jfetch('/api/admin/content-rules', { method: 'GET', headers: {} as any })
    setContentRules(Array.isArray(r.rules) ? r.rules : [])
  }

  function resetRuleForm() {
    setEditingRuleId(null)
    setRuleType('block')
    setRuleScope('event')
    setRuleMatchType('contains')
    setRuleExpression('')
    setRuleNote('')
    setRuleIsActive(true)
  }

  function beginEditRule(r: ContentRule) {
    const idNum = Number(r.id)
    setEditingRuleId(Number.isFinite(idNum) ? idNum : null)
    setRuleType(r.rule_type)
    setRuleScope(r.scope)
    setRuleMatchType(r.match_type)
    setRuleExpression(String(r.expression || ''))
    setRuleNote(String(r.note || ''))
    setRuleIsActive(r.is_active !== false)
  }

  async function saveContentRule() {
    setRulesMsg(null)
    const expression = String(ruleExpression || '').trim()
    if (!expression) {
      setRulesMsg('חובה להזין מילה/ביטוי')
      return
    }

    try {
      if (editingRuleId) {
        const res = await jfetch('/api/admin/content-rules', {
          method: 'PUT',
          body: JSON.stringify({
            id: editingRuleId,
            rule_type: ruleType,
            scope: ruleScope,
            match_type: ruleMatchType,
            expression,
            note: ruleNote ? String(ruleNote) : null,
            is_active: ruleIsActive,
          }),
        })
        setContentRules(prev => prev.map(r => (Number(r.id) === editingRuleId ? res.rule : r)))
        setRulesMsg('✅ עודכן')
      } else {
        const res = await jfetch('/api/admin/content-rules', {
          method: 'POST',
          body: JSON.stringify({
            rule_type: ruleType,
            scope: ruleScope,
            match_type: ruleMatchType,
            expression,
            note: ruleNote ? String(ruleNote) : null,
            is_active: ruleIsActive,
          }),
        })
        setContentRules(prev => [res.rule, ...prev])
        setRulesMsg('✅ נוסף')
      }

      resetRuleForm()
      setTimeout(() => setRulesMsg(null), 1500)
    } catch (e: any) {
      setRulesMsg(friendlyError(e?.message || 'שגיאה'))
    }
  }

  async function toggleContentRule(id: number, is_active: boolean) {
    const r = contentRules.find(x => Number(x.id) === id)
    if (!r) return
    setRulesMsg(null)
    try {
      const res = await jfetch('/api/admin/content-rules', {
        method: 'PUT',
        body: JSON.stringify({
          id,
          rule_type: r.rule_type,
          scope: r.scope,
          match_type: r.match_type,
          expression: r.expression,
          note: r.note,
          is_active,
        }),
      })
      setContentRules(prev => prev.map(x => (Number(x.id) === id ? res.rule : x)))
    } catch (e: any) {
      setRulesMsg(friendlyError(e?.message || 'שגיאה'))
    }
  }

  async function deleteContentRule(id: number) {
    if (!confirm('למחוק את החוק?')) return
    setRulesMsg(null)
    try {
      // API expects query param ?id=
      await jfetch(`/api/admin/content-rules?id=${id}`, { method: 'DELETE', headers: {} as any })
      setContentRules(prev => prev.filter(r => Number(r.id) !== id))
      if (editingRuleId === id) resetRuleForm()
      setRulesMsg('✅ נמחק')
      setTimeout(() => setRulesMsg(null), 1500)
    } catch (e: any) {
      setRulesMsg(friendlyError(e?.message || 'שגיאה'))
    }
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

    // Best-effort: delete from Storage + media_items too
    try {
      await fetch(addEventParam('/api/admin/storage-delete'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] })
      })
    } catch {
      // ignore
    }
  }

  async function uploadOgDefaultImage() {
    setOgMsg(null)
    if (!ogFile) {
      setOgMsg('בחר תמונה')
      return
    }
    try {
      setOgUploading(true)
      const blob = await makeOgJpeg(ogFile, ogFocus.x, ogFocus.y)
      const fd = new FormData()
      fd.append('file', new File([blob], 'og-default.jpg', { type: 'image/jpeg' }))
      const res = await fetch(addEventParam('/api/admin/og-default'), { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'upload failed')
      const publicUrl = String(j.publicUrl || '')
      setSettings((prev: any) => (prev ? { ...prev, og_default_image_url: publicUrl } : prev))
      // bump preview cache-buster so the admin immediately sees the new image
      setOgPreviewKey(Date.now())
      setOgMsg('✅ נשמרה תמונת תצוגה (1200x630)')
      setOgFile(null)
    } catch (e: any) {
      setOgMsg(friendlyError(e?.message || 'שגיאה'))
    } finally {
      setOgUploading(false)
    }
  }

  
async function loadBlocks() {
    const res = await jfetch('/api/admin/blocks', { method: 'GET', headers: {} as any })
    setBlocks(res.blocks)
  }

  async function reorderBlocks(nextIds: string[]) {
    setErr(null)
    try {
      await jfetch('/api/admin/blocks', { method: 'POST', body: JSON.stringify({ ids: nextIds }) })
      // optimistic update
      setBlocks(prev => {
        const byId = new Map(prev.map((b: any) => [String(b.id), b]))
        return nextIds
          .map((id, idx) => {
            const b = byId.get(String(id))
            return b ? { ...b, order_index: idx + 1 } : null
          })
          .filter(Boolean) as any
      })
    } catch (e: any) {
      setErr(friendlyError(e?.message || 'שגיאה'))
      // fallback to reload
      try {
        await loadBlocks()
      } catch {}
    }
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
  async function loadGalleries() {
    try {
      const res = await jfetch('/api/admin/galleries', { method: 'GET' })
      const rows = res.galleries || []
      setGalleries(rows)
      if (!selectedGalleryId && rows[0]?.id) setSelectedGalleryId(rows[0].id)
    } catch (e: any) {
      setGalleryMsg(friendlyError(e?.message || 'שגיאה בטעינת גלריות'))
    }
  }

  async function loadPendingMedia(gid?: string) {
    const id = gid || selectedGalleryId
    if (!id) return
    try {
      const res = await jfetch(`/api/admin/media-items?status=pending&gallery_id=${encodeURIComponent(id)}`, { method: 'GET' })
      setPendingMedia(res.items || [])
    } catch (e: any) {
      setGalleryMsg(friendlyError(e?.message || 'שגיאה בטעינת תמונות ממתינות'))
    }
  }

  async function loadApprovedMedia(gid?: string) {
    const id = gid || selectedGalleryId
    if (!id) return
    try {
      const res = await jfetch(`/api/admin/media-items?status=approved&gallery_id=${encodeURIComponent(id)}`, { method: 'GET' })
      setApprovedMedia(res.items || [])
    } catch (e: any) {
      setGalleryMsg(friendlyError(e?.message || 'שגיאה בטעינת תמונות מאושרות'))
    }
  }


  async function updateGallery(id: string, patch: any) {
    setGalleryMsg(null)
    setGalleryBusy(true)
    try {
      const res = await jfetch('/api/admin/galleries', { method: 'PUT', body: JSON.stringify({ id, ...patch }) })
      const g = res.gallery
      setGalleries(prev => prev.map(x => (x.id === id ? g : x)))
    } catch (e: any) {
      setGalleryMsg(friendlyError(e?.message || 'שגיאה בעדכון'))
    } finally {
      setGalleryBusy(false)
    }
  }

  async function openGalleryWindow(id: string) {
    setGalleryMsg(null)
    setGalleryBusy(true)
    try {
      const res = await jfetch('/api/admin/galleries', { method: 'POST', body: JSON.stringify({ id, hours: hoursToOpen }) })
      const g = res.gallery
      setGalleries(prev => prev.map(x => (x.id === id ? g : x)))
      setGalleryMsg(`✅ פתוח לאוטומט-אישור עד ${new Date(g.auto_approve_until).toLocaleString('he-IL')}`)
    } catch (e: any) {
      setGalleryMsg(friendlyError(e?.message || 'שגיאה בפתיחה לזמן מוגבל'))
    } finally {
      setGalleryBusy(false)
    }
  }

  async function approveMediaItem(id: string) {
    setGalleryMsg(null)
    try {
      await jfetch('/api/admin/media-items', { method: 'PUT', body: JSON.stringify({ id, is_approved: true }) })
      setPendingMedia(prev => prev.filter(x => x.id !== id))
    } catch (e: any) {
      setGalleryMsg(friendlyError(e?.message || 'שגיאה באישור'))
    }
  }

  async function deleteMediaItem(id: string) {
    if (!confirm('למחוק את התמונה?')) return
    setGalleryMsg(null)
    try {
      await jfetch('/api/admin/media-items', { method: 'DELETE', body: JSON.stringify({ id }) })
      setPendingMedia(prev => prev.filter(x => x.id !== id))
    } catch (e: any) {
      setGalleryMsg(friendlyError(e?.message || 'שגיאה במחיקה'))
    }
  }


  async function loadDiag() {
    const d = await jfetch('/api/admin/diag', { method: 'GET', headers: {} as any })
    setDiag(d)
  }

  useEffect(() => {
    if (!admin) return
    if (tab === 'settings') {
      loadSettings()
      loadContentRules()
    }
    if (tab === 'blocks') loadBlocks()
    if (tab === 'moderation') {
      loadPending()
      loadApprovedBlessings()
    }
    if (tab === 'ads') loadAds()
    if (tab === 'admin_gallery') {
      loadSettings()
      loadGalleries()
      loadPendingMedia()
      loadApprovedMedia()
    }
    if (tab === 'diag') loadDiag()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, admin, pendingKind])

  /* ===== LOGIN UI ===== */
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

  /* ===== AUTHENTICATED UI ===== */
  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-right">
            <p className="text-sm text-zinc-600">מחובר: {admin.email}</p>
            <p className="text-xs text-zinc-500">Role: {admin.role}</p>

            
            <p className="text-xs text-zinc-500">Event ID פעיל: <span className="font-semibold text-zinc-900">{activeEventId || 'IDO'}</span></p>
<div className="mt-1 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${pendingBlessingsCount > 0 ? 'bg-amber-50 text-amber-800' : 'bg-zinc-100 text-zinc-600'}`}>ברכות ממתינות: {pendingBlessingsCount}</span>
              <span className={`rounded-full px-2 py-0.5 ${galleriesTotalPending > 0 ? 'bg-amber-50 text-amber-800' : 'bg-zinc-100 text-zinc-600'}`}>ממתינות לאישור: {galleriesTotalPending}</span>
            </div>

            {settings?.updated_at && <p className="text-xs text-zinc-500">עודכן לאחרונה: {fmt(settings.updated_at)}</p>}
          </div>

          {embeddedMode ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={logout}>יציאה</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setTab('moderation' as any)
                  loadPending()
                }}
              >
                הצג רק ממתינות {pendingCount > 0 ? `(${pendingCount})` : '' }
              </Button>
              {tabs.map(t => (
                <Button key={t} variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>
                  {t === 'moderation' && pendingCount > 0 ? `${TAB_LABEL[t]} (${pendingCount})` : (TAB_LABEL[t] ?? t)}
                </Button>
              ))}
              <Button variant="ghost" onClick={logout}>יציאה</Button>
            </div>
          )}
        </div>
      </Card>


{/* ===== PERMISSIONS ===== */}
{tab === 'permissions' && admin?.role === 'master' && (
  <PermissionsPanel eventId={activeEventId} />
)}

      {/* ===== SETTINGS ===== */}
      {tab === 'settings' && settings && (
        <Card>
          <h3 className="font-semibold">הגדרות</h3>

          <div className="mt-2 grid gap-2" dir="rtl">
            <div className="flex items-center justify-between gap-2">
              <div className="text-right text-xs text-zinc-600">
                {savedMsg ? <span className="text-green-700">{savedMsg}</span> : null}
                {!savedMsg && err ? <span className="text-red-600">{err}</span> : null}
              </div>
              <Button onClick={() => saveSettings()} disabled={saving}>
                {saving ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            {/* כללי */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
              <p className="text-sm font-medium">הגדרות כלליות</p>

              <Input
                value={settings.event_name || ''}
                onChange={e => setSettings({ ...settings, event_name: e.target.value })}
                placeholder="שם אירוע"
              />

              <div className="grid gap-1">
                <label className="text-xs text-zinc-500">תאריך ושעה (start_at)</label>
                <input
                  type="datetime-local"
                  value={startAtLocal}
                  onChange={e => setStartAtLocal(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </div>

              <Input
                value={settings.location_text || ''}
                onChange={e => setSettings({ ...settings, location_text: e.target.value })}
                placeholder="אולם / כתובת"
              />


<div className="grid gap-1">
  <label className="text-xs text-zinc-500">תיאור לשיתוף (meta_description)</label>
  <textarea
    rows={3}
    value={(settings as any).meta_description || ''}
    onChange={(e) => setSettings({ ...(settings as any), meta_description: e.target.value })}
    placeholder="מופיע בתצוגה המקדימה בווצאפ/פייסבוק"
    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
  />
</div>


              <Input
                value={settings.waze_url || ''}
                onChange={e => setSettings({ ...settings, waze_url: e.target.value })}
                placeholder="קישור Waze"
                dir="ltr"
              />
            </div>

            {/* HERO */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
              <p className="text-sm font-medium">HERO – טקסטים + תמונות</p>

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
                          <img src={u} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
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

            {/* ברכות */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3" dir="rtl">
              <p className="text-sm font-medium text-right">ברכות</p>

              <Input
                className="text-right"
                dir="rtl"
                value={String(settings.blessings_label ?? '')}
                onChange={e => setSettings({ ...settings, blessings_label: e.target.value })}
                placeholder="תיאור מתחת לכותרת (מופיע בבית ובדף ברכות)"
              />

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
                value={String(settings.blessings_subtitle ?? '')}
                onChange={e => setSettings({ ...settings, blessings_subtitle: e.target.value })}
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
                  checked={Boolean((settings as any).require_approval)}
                  onChange={e => setSettings({ ...(settings as any), require_approval: e.target.checked })}
                />
                כל ברכה דורשת אישור מנהל גם לפני האירוע (require_approval)
              </label>

              {(() => {
                try {
                  const lockDaysRaw = Number((settings as any).approval_lock_after_days)
                  const lockDays = Number.isFinite(lockDaysRaw) ? lockDaysRaw : 7
                  const startAtIso = (settings as any).start_at as string | undefined
                  const openedAtIso = (settings as any).approval_opened_at as string | undefined
                  const startAt = startAtIso ? new Date(startAtIso) : null
                  const openedAt = openedAtIso ? new Date(openedAtIso) : null
                  const now = new Date()

                  const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
                  const addDaysUtc = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000)

                  const anchorAt = (startAt && openedAt && openedAt < startAt) ? startAt : (openedAt || startAt)
                  const lockAt =
                    anchorAt && Number.isFinite(lockDays) && lockDays >= 0
                      ? addDaysUtc(startOfUtcDay(anchorAt), lockDays + 1)
                      : null

                  const isAfterLockWindow = lockAt ? now >= lockAt : false
                  const effectiveApproval = Boolean((settings as any).require_approval) || isAfterLockWindow

                  return (
                    <div className="mt-1 grid gap-1" dir="rtl">
                      <label className="text-xs flex items-center gap-2 flex-row-reverse justify-end text-right text-zinc-600">
                        <input type="checkbox" checked={effectiveApproval} readOnly />
                        מצב אישור בפועל כרגע
                      </label>
                      {lockAt && (
                        <p className="text-xs text-zinc-500 text-right">
                          נעילה אוטומטית לפי approval_lock_after_days ב {lockAt.toLocaleString('he-IL')}
                        </p>
                      )}
                    </div>
                  )
                } catch {
                  return null
                }
              })()}

              <p className="text-xs text-zinc-500 text-right">
                כשמכבים את האפשרות הזו, הברכות מתפרסמות אוטומטית עד שיחלפו הימים שמוגדרים בשדה למטה.
                ספירת הימים מתחילה מיום האירוע. אם פותחים שוב, הספירה מתחילה מרגע הפתיחה.
              </p>

              <label className="text-xs text-zinc-500 text-right">אישור מנהל אוטומטי אחרי כמה ימים מיום האירוע (approval_lock_after_days)</label>
              <Input
                className="text-right"
                dir="rtl"
                value={String((settings as any).approval_lock_after_days ?? 7)}
                onChange={e => setSettings({ ...(settings as any), approval_lock_after_days: Number(e.target.value) })}
                placeholder="למשל 2 לבר מצווה, 7 לחתונה"
              />

              <label className="text-xs text-zinc-500 text-right">מקסימום שורות לברכה לפני שליחה לאישור מנהל (max_blessing_lines)</label>
              <Input
                className="text-right"
                dir="rtl"
                value={String((settings as any).max_blessing_lines ?? 50)}
                onChange={e => setSettings({ ...(settings as any), max_blessing_lines: Number(e.target.value) })}
                placeholder="למשל 50"
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

            {/* QR & שיתוף */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3" dir="rtl">
              <p className="text-sm font-medium text-right">QR & שיתוף</p>

              <div className="grid gap-2">
                <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                  <input
                    type="checkbox"
                    checked={settings.qr_enabled_admin !== false}
                    onChange={e => setSettings({ ...settings, qr_enabled_admin: e.target.checked })}
                  />
                  להציג QR בדף מנהל
                </label>

                <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                  <input
                    type="checkbox"
                    checked={settings.qr_enabled_blessings !== false}
                    onChange={e => setSettings({ ...settings, qr_enabled_blessings: e.target.checked })}
                  />
                  להציג QR/שיתוף בדף ברכות (אורחים)
                </label>

                <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                  <input
                    type="checkbox"
                    checked={settings.share_enabled !== false}
                    onChange={e => setSettings({ ...settings, share_enabled: e.target.checked })}
                  />
                  לאפשר שיתוף ברכות
                </label>

                <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                  <input
                    type="checkbox"
                    checked={settings.share_whatsapp_enabled !== false}
                    onChange={e => setSettings({ ...settings, share_whatsapp_enabled: e.target.checked })}
                  />
                  לאפשר שיתוף WhatsApp
                </label>

                <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                  <input
                    type="checkbox"
                    checked={settings.share_webshare_enabled !== false}
                    onChange={e => setSettings({ ...settings, share_webshare_enabled: e.target.checked })}
                  />
                  לאפשר Web Share (מובייל)
                </label>

                <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                  <input
                    type="checkbox"
                    checked={settings.share_use_permalink !== false}
                    onChange={e => setSettings({ ...settings, share_use_permalink: e.target.checked })}
                  />
                  שיתוף לקישור ישיר (Permalink)
                </label>
              </div>


              <div className="grid gap-2 mt-1 rounded-xl border border-zinc-200 p-3" dir="rtl">
                <p className="text-sm font-medium text-right">תמונת תצוגה לקישורים (OpenGraph)</p>

                <div className="grid gap-2">
                  <p className="text-xs text-zinc-500 text-right">
                    זו התמונה ש-WhatsApp / Facebook / Telegram מציגים כשהשולחים משתפים קישור.
                  </p>

                  {/* current */}
                  {String(settings.og_default_image_url || '').length > 0 && (
                    <div className="rounded-xl overflow-hidden border border-zinc-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={(() => {
                          const u = String(settings.og_default_image_url || '')
                          const sep = u.includes('?') ? '&' : '?'
                          return `${u}${sep}v=${ogPreviewKey}`
                        })()}
                        alt="OG"
                        className="w-full"
                      />
                    </div>
                  )}

                  <label className="text-sm text-zinc-700 text-right">העלאה (מומלץ):</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setOgFile((e.target.files || [])[0] || null)}
                  />

                  {ogPreview && (
                    <div className="grid gap-2">
                      <p className="text-xs text-zinc-500 text-right">
                        בחר מרכז (פוקוס) לתמונה – לחיצה על התמונה.
                        נחתוך אוטומטית ל־800×800.
                      </p>
                      <div
                        className="relative rounded-xl overflow-hidden border border-zinc-200 cursor-crosshair"
                        onClick={e => {
                          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                          const x = (e.clientX - r.left) / r.width
                          const y = (e.clientY - r.top) / r.height
                          setOgFocus({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) })
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ogPreview} alt="preview" className="w-full block" />
                        <div
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{ left: `${ogFocus.x * 100}%`, top: `${ogFocus.y * 100}%` }}
                        >
                          <div className="h-4 w-4 rounded-full bg-black/70 ring-2 ring-white" />
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button onClick={uploadOgDefaultImage} disabled={ogUploading}>
                          {ogUploading ? 'מעלה…' : 'שמור תמונת תצוגה'}
                        </Button>

                        <Button
                          variant="ghost"
                          onClick={() => {
                            const v = Date.now()
                            setOgPreviewKey(v)
                            window.open(`/api/og/image?default=1&v=${v}`, '_blank', 'noopener,noreferrer')
                          }}
                          disabled={ogUploading}
                        >
                          נקה קאש / בדיקת OG עכשיו
                        </Button>

                        <Button variant="ghost" onClick={() => setOgFile(null)} disabled={ogUploading}>
                          ביטול
                        </Button>
                      </div>

                      {ogMsg && <p className="text-sm text-right">{ogMsg}</p>}
                    </div>
                  )}

                  <label className="text-sm text-zinc-700 text-right">או להזין URL ידני:</label>
                  <Input
                    className="text-right"
                    dir="rtl"
                    value={String(settings.og_default_image_url ?? '')}
                    onChange={e => {
                      setSettings({ ...settings, og_default_image_url: e.target.value })
                      setOgPreviewKey(Date.now())
                    }}
                    placeholder="URL לתמונה ברירת מחדל לקישורים (אם ריק — נשתמש בתמונה הראשית הראשונה)"
                  />

                  <p className="text-xs text-zinc-500 text-right">
                    לקישור ישיר לברכה עם תמונה — השיתוף ישתמש בנתיב /blessings/p/&lt;id&gt;.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 mt-1">
                <Input
                  className="text-right"
                  dir="rtl"
                  value={String(settings.qr_title ?? '')}
                  onChange={e => setSettings({ ...settings, qr_title: e.target.value })}
                  placeholder="כותרת QR (למשל: סרקו והוסיפו ברכה)"
                />

                <Input
                  className="text-right"
                  dir="rtl"
                  value={String(settings.qr_subtitle ?? '')}
                  onChange={e => setSettings({ ...settings, qr_subtitle: e.target.value })}
                  placeholder="תת-כותרת QR (למשל: פותח את עמוד הברכות)"
                />


                <Input
                  className="text-right"
                  dir="rtl"
                  value={String(settings.qr_blessings_cta_label ?? '')}
                  onChange={e => setSettings({ ...settings, qr_blessings_cta_label: e.target.value })}
                  placeholder="טקסט כפתור בדף ברכות (למשל: סרקו / שתפו את עמוד הברכות)"
                />

                <Input
                  className="text-right"
                  dir="rtl"
                  value={String(settings.qr_target_path ?? '/blessings')}
                  onChange={e => setSettings({ ...settings, qr_target_path: e.target.value })}
                  placeholder="נתיב יעד ל-QR (ברירת מחדל: /blessings)"
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    className="text-right"
                    dir="rtl"
                    value={String(settings.qr_btn_download_label ?? '')}
                    onChange={e => setSettings({ ...settings, qr_btn_download_label: e.target.value })}
                    placeholder="תווית כפתור: הורדה"
                  />
                  <Input
                    className="text-right"
                    dir="rtl"
                    value={String(settings.qr_btn_copy_label ?? '')}
                    onChange={e => setSettings({ ...settings, qr_btn_copy_label: e.target.value })}
                    placeholder="תווית כפתור: העתק"
                  />
                  <Input
                    className="text-right"
                    dir="rtl"
                    value={String(settings.qr_btn_whatsapp_label ?? '')}
                    onChange={e => setSettings({ ...settings, qr_btn_whatsapp_label: e.target.value })}
                    placeholder="תווית כפתור: וואטסאפ"
                  />
                </div>
              </div>

              <div className="grid gap-2 mt-1">
                <Input
                  className="text-right"
                  dir="rtl"
                  value={String(settings.share_button_label ?? '')}
                  onChange={e => setSettings({ ...settings, share_button_label: e.target.value })}
                  placeholder="תווית כפתור שיתוף בכרטיס (ברירת מחדל: שתף)"
                />
                <Input
                  className="text-right"
                  dir="rtl"
                  value={String(settings.share_whatsapp_button_label ?? '')}
                  onChange={e => setSettings({ ...settings, share_whatsapp_button_label: e.target.value })}
                  placeholder="תווית כפתור WhatsApp (ברירת מחדל: שתף בוואטסאפ)"
                />
                <Input
                  className="text-right"
                  dir="rtl"
                  value={String(settings.share_modal_title ?? '')}
                  onChange={e => setSettings({ ...settings, share_modal_title: e.target.value })}
                  placeholder="כותרת מודאל שיתוף (ברירת מחדל: שיתוף)"
                />
                <Input
                  className="text-right"
                  dir="rtl"
                  value={String(settings.share_no_text_fallback ?? '')}
                  onChange={e => setSettings({ ...settings, share_no_text_fallback: e.target.value })}
                  placeholder="Fallback אם אין טקסט (למשל: נשלחה ברכה מהממת 💙)"
                />
                <Textarea
                  className="text-right"
                  dir="rtl"
                  value={String(settings.share_message_template ?? '')}
                  onChange={e => setSettings({ ...settings, share_message_template: e.target.value })}
                  placeholder={`תבנית הודעה לשיתוף\nמשתנים: {EVENT_NAME} {AUTHOR_NAME} {TEXT} {LINK} {DATE}`}
                  rows={5}
                />
              </div>

              {settings.qr_enabled_admin !== false && qrUrl ? (
                <div className="mt-2">
                  <QrPanel
                    url={qrUrl}
                    title={settings.qr_title || 'סרקו והוסיפו ברכה'}
                    subtitle={settings.qr_subtitle || 'פותח את עמוד הברכות'}
                    btnDownloadLabel={settings.qr_btn_download_label || 'הורד כתמונה'}
                    btnCopyLabel={settings.qr_btn_copy_label || 'העתק קישור'}
                    btnWhatsappLabel={settings.qr_btn_whatsapp_label || 'שלח בוואטסאפ'}
                  />
                </div>
              ) : null}
            </div>

            {/* ניהול תוכן (חסימות/חריגים) */}
            <div className="grid gap-2 rounded-xl border border-zinc-200 p-3" dir="rtl">
              <p className="text-sm font-medium text-right">ניהול תוכן – חסימות וחריגים</p>
              <p className="text-xs text-zinc-500 text-right">
                החוקים חלים על טקסט הברכה, שם הכותב, קישור ומדיה. חסימה תמיד תשלח לאישור מנהל. חריג יכול למנוע חסימת־שווא במודרציה.
              </p>

              <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <select
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    value={ruleType}
                    onChange={e => setRuleType(e.target.value as any)}
                  >
                    <option value="block">חסימה</option>
                    <option value="allow">חריג</option>
                  </select>

                  <select
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    value={ruleScope}
                    onChange={e => setRuleScope(e.target.value as any)}
                  >
                    <option value="event">אירוע</option>
                    <option value="global">גלובלי</option>
                  </select>

                  <select
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    value={ruleMatchType}
                    onChange={e => setRuleMatchType(e.target.value as any)}
                  >
                    <option value="contains">מכיל</option>
                    <option value="exact">בדיוק</option>
                    <option value="word">מילה שלמה</option>
                  </select>

                  <Input
                    className="text-right md:col-span-2"
                    dir="rtl"
                    value={ruleExpression}
                    onChange={e => setRuleExpression(e.target.value)}
                    placeholder="מילה/ביטוי (למשל: למות עליך)"
                  />

                  <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                    <input
                      type="checkbox"
                      checked={!!ruleIsActive}
                      onChange={e => setRuleIsActive(e.target.checked)}
                    />
                    פעיל
                  </label>
                </div>

                <Input
                  className="text-right"
                  dir="rtl"
                  value={ruleNote}
                  onChange={e => setRuleNote(e.target.value)}
                  placeholder="הערה (אופציונלי)"
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="text-right text-xs text-zinc-600">{rulesMsg ? rulesMsg : null}</div>
                  <div className="flex gap-2">
                    {editingRuleId ? (
                      <Button variant="ghost" onClick={resetRuleForm}>בטל עריכה</Button>
                    ) : null}
                    <Button onClick={saveContentRule}>{editingRuleId ? 'שמור שינוי' : 'הוסף'}</Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                {contentRules.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-right">אין חוקים עדיין.</p>
                ) : (
                  contentRules.map(r => (
                    <div key={String(r.id)} className="rounded-xl border border-zinc-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {r.rule_type === 'block' ? 'חסימה' : 'חריג'} • {r.scope === 'global' ? 'גלובלי' : 'אירוע'} •{' '}
                            {r.match_type === 'exact' ? 'בדיוק' : r.match_type === 'word' ? 'מילה שלמה' : 'מכיל'}
                          </p>
                          <p className="text-sm" dir="rtl">{r.expression}</p>
                          {r.note ? <p className="text-xs text-zinc-500">{r.note}</p> : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                            <input
                              type="checkbox"
                              checked={r.is_active !== false}
                              onChange={e => toggleContentRule(Number(r.id), e.target.checked)}
                            />
                            פעיל
                          </label>
                          <Button variant="ghost" onClick={() => beginEditRule(r)}>ערוך</Button>
                          <Button variant="ghost" onClick={() => deleteContentRule(Number(r.id))}>מחק</Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
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

              {/* שורה 2 בפוטר */}
              <div className="mt-2 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-sm font-medium">פוטר – שורה 2</p>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!(settings as any).footer_line2_enabled}
                    onChange={e => setSettings({ ...(settings as any), footer_line2_enabled: e.target.checked } as any)}
                  />
                  להציג שורה 2 בפוטר
                </label>

                <Input
                  value={(settings as any).footer_line2_label || ''}
                  onChange={e => setSettings({ ...(settings as any), footer_line2_label: e.target.value } as any)}
                  placeholder="טקסט שורה 2 (למשל: לכל שאלה – שלחו הודעה)"
                />

                <Input
                  value={(settings as any).footer_line2_url || ''}
                  onChange={e => setSettings({ ...(settings as any), footer_line2_url: e.target.value } as any)}
                  placeholder="קישור שורה 2 (tel: / https://...)"
                  dir="ltr"
                />
              </div>
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

          <p className="mt-1 text-sm text-zinc-600 text-right">
            כאן ניתן להפעיל/לכבות בלוקים בדף הבית ולשנות סדר (↑↓). בשלב הבא נוסיף שמות/כפתורים לכל בלוק.
          </p>

          <div className="mt-3 grid gap-3">
            {(() => {
              const typeLabel: Record<string, string> = {
                hero: 'כותרת עליונה (Hero)',
                menu: 'תפריט / ניווט',
                gallery: 'גלריה',
                blessings: 'ברכות',
                gift: 'מתנה / תשלום',
                qr: 'QR ושיתוף',
              }

              return blocks.map((b: any, idx: number) => {
                const title = (b?.config?.title || typeLabel[String(b.type)] || String(b.type)) as string
                const canUp = idx > 0
                const canDown = idx < blocks.length - 1

                return (
              <div key={b.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <p className="font-medium">{title}</p>
                    <p className="text-xs text-zinc-500">key: {b.type} • סדר: {b.order_index}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      disabled={!canUp}
                      title="הזז למעלה"
                      onClick={() => {
                        if (!canUp) return
                        const ids = blocks.map((x: any) => String(x.id))
                        ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
                        reorderBlocks(ids)
                      }}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!canDown}
                      title="הזז למטה"
                      onClick={() => {
                        if (!canDown) return
                        const ids = blocks.map((x: any) => String(x.id))
                        ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
                        reorderBlocks(ids)
                      }}
                    >
                      ↓
                    </Button>

                    <label className="text-sm flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!b.is_visible}
                        onChange={e => updateBlock({ id: b.id, is_visible: e.target.checked })}
                      />
                      מוצג
                    </label>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <Input
                    value={String(b?.config?.title || '')}
                    onChange={e => {
                      const v = e.target.value
                      updateBlock({ id: b.id, config: { ...(b.config || {}), title: v } })
                    }}
                    placeholder="שם בלוק לתצוגה (רשות)"
                  />

                  {/* בקרוב: cta_label / cta_action */}
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
                )
              })
            })()}
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
          <h3 className="font-semibold">גלריות</h3>
          <p className="mt-1 text-sm text-zinc-600">ניהול גלריות + אישור תמונות לכל גלריה.</p>

          {settings && (
            <div className="mt-4 grid gap-2 rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-right">הגדרות גלריות</p>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">ממתינות לאישור: {galleriesTotalPending}</span>
              </div>

              <Input
                value={settings.guest_gallery_title || ''}
                onChange={e => setSettings({ ...settings, guest_gallery_title: e.target.value })}
                placeholder="כותרת גלריית אורחים"
              />

              <label className="text-sm flex items-center gap-2 justify-end flex-row-reverse">
                <input
                  type="checkbox"
                  checked={settings.guest_gallery_show_all_button !== false}
                  onChange={e => setSettings({ ...settings, guest_gallery_show_all_button: e.target.checked })}
                />
                להציג כפתור “לכל התמונות” בגלריית אורחים
              </label>

              <Input
                value={settings.admin_gallery_title || ''}
                onChange={e => setSettings({ ...settings, admin_gallery_title: e.target.value })}
                placeholder="כותרת גלריית מנהל"
              />

              <label className="text-sm flex items-center gap-2 justify-end flex-row-reverse">
                <input
                  type="checkbox"
                  checked={settings.admin_gallery_show_all_button !== false}
                  onChange={e => setSettings({ ...settings, admin_gallery_show_all_button: e.target.checked })}
                />
                להציג כפתור “לכל התמונות” בגלריית מנהל
              </label>

              

              <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-zinc-700 text-right">פריוויו גלריות בדף הבית</p>

                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <label className="text-xs text-zinc-500 text-right">פריסה</label>
                    <select
                      className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-right"
                      value={`${Number(settings?.home_gallery_preview_cols || 3)}x${Math.ceil(Number(settings?.home_gallery_preview_limit || 6) / Number(settings?.home_gallery_preview_cols || 3))}`}
                      onChange={e => {
                        const v = e.target.value
                        if (v === '3x2') setSettings({ ...settings, home_gallery_preview_cols: 3, home_gallery_preview_limit: 6 })
                        else if (v === '4x2') setSettings({ ...settings, home_gallery_preview_cols: 4, home_gallery_preview_limit: 8 })
                        else if (v === '3x3') setSettings({ ...settings, home_gallery_preview_cols: 3, home_gallery_preview_limit: 9 })
                      }}
                    >
                      <option value="3x2">3x2 (6 תמונות)</option>
                      <option value="4x2">4x2 (8 תמונות)</option>
                      <option value="3x3">3x3 (9 תמונות)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <label className="text-xs text-zinc-500 text-right">כמות תמונות (limit)</label>
                      <Input
                        type="number"
                        value={Number(settings?.home_gallery_preview_limit || 6)}
                        onChange={e => setSettings({ ...settings, home_gallery_preview_limit: Number(e.target.value || 0) })}
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-xs text-zinc-500 text-right">עמודות (cols)</label>
                      <Input
                        type="number"
                        value={Number(settings?.home_gallery_preview_cols || 3)}
                        onChange={e => setSettings({ ...settings, home_gallery_preview_cols: Number(e.target.value || 0) })}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500 text-right">
                    ברירת מחדל מומלצת: 3x2 (6 תמונות).
                  </p>
                </div>
              </div>
<div className="flex items-center justify-end">
                <Button onClick={() => saveSettings()} disabled={saving}>
                  {saving ? 'שומר...' : 'שמור הגדרות גלריות'}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
            {/* Left: galleries list */}
            <div className="rounded-2xl border border-zinc-200 p-3">
              <div className="text-sm font-medium mb-2 text-right">גלריות</div>
              <div className="grid gap-2">
                {galleries.map((g: any) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGalleryId(g.id)
                      setGalleryMsg(null)
                      setSelectMode(false)
                      clearSelected()
                      loadPendingMedia(g.id)
                      loadApprovedMedia(g.id)
                    }}
                    className={
                      'w-full rounded-xl border px-3 py-2 text-right text-sm ' +
                      (selectedGalleryId === g.id ? 'border-black bg-zinc-50' : 'border-zinc-200 bg-white')
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{g.display_title || g.title || g.slug || g.id}</span>
                      {g.pending_count > 0 && (
                        <span className="inline-flex min-w-[1.75rem] justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {g.pending_count}
                        </span>
                      )}
                    </div>
                    {!g.upload_enabled && <span className="mr-2 text-xs text-zinc-500">(סגור)</span>}
                  </button>
                ))}
                {galleries.length === 0 && <p className="text-sm text-zinc-600 text-right">אין גלריות.</p>}
              </div>
            </div>

            {/* Right: selected gallery */}
            <div className="rounded-2xl border border-zinc-200 p-4">
              {(() => {
                const g = galleries.find((x: any) => x.id === selectedGalleryId)
                if (!g) return <p className="text-sm text-zinc-600 text-right">בחר גלריה.</p>

                return (
                  <div className="grid gap-4">
                    <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
                      <div className="text-right">
                        <h4 className="font-semibold">{g.display_title || g.title || 'גלריה'}</h4>
                        {g.auto_approve_until && (
                          <p className="text-xs text-zinc-500 mt-1">
                            אוטומט-אישור עד: {new Date(g.auto_approve_until).toLocaleString('he-IL')}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
                        <div className="flex items-center gap-2 sm:flex-row-reverse">
                          <label className="text-sm flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!g.upload_enabled}
                              onChange={e => updateGallery(g.id, { upload_enabled: e.target.checked })}
                              disabled={galleryBusy}
                            />
                            העלאה מותרת
                          </label>

                          <label className="text-sm flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!g.require_approval}
                              onChange={e => updateGallery(g.id, { require_approval: e.target.checked })}
                              disabled={galleryBusy}
                            />
                            דורש אישור אחרי הזמן
                          </label>
                        </div>

                        <div className="flex items-center gap-2 sm:flex-row-reverse">
                          <input
                            type="number"
                            min={1}
                            max={72}
                            value={hoursToOpen}
                            onChange={e => setHoursToOpen(Number(e.target.value || 8))}
                            className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                          <Button onClick={() => openGalleryWindow(g.id)} disabled={galleryBusy}>
                            פתח ל-{hoursToOpen || 8} שעות
                          </Button>
                        </div>
                      </div>
                    </div>

                    {galleryMsg && <p className="text-sm text-zinc-700 text-right">{galleryMsg}</p>}

                    <div className="flex items-center justify-between">
                      <Button variant="ghost" onClick={() => loadPendingMedia(g.id)} disabled={galleryBusy}>
                        רענן ממתינות
                      </Button>
                      <div className="text-sm text-zinc-600 text-right">
                        ממתינות לאישור: <b>{pendingMedia.length}</b>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {pendingMedia.map((p: any) => (
                        <div key={p.id} className="rounded-2xl border border-zinc-200 overflow-hidden">
                          <button
                            className="relative block aspect-square w-full bg-zinc-50"
                            onClick={() => p.url && setLightbox(p.url)}
                            type="button"
                          >
                            <img src={p.thumb_url || p.url} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
                          </button>

                          <div className="p-3 flex gap-2">
                            <Button variant="ghost" onClick={() => approveMediaItem(p.id)}>
                              אשר
                            </Button>
                            <Button variant="ghost" onClick={() => deleteMediaItem(p.id)}>
                              מחק
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {pendingMedia.length === 0 && <p className="text-sm text-zinc-600 text-right">אין תמונות ממתינות.</p>}

                    <div className="mt-6 border-t border-zinc-200 pt-4">
                      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
                          <Button variant="ghost" onClick={() => loadApprovedMedia(g.id)} disabled={galleryBusy}>
                            רענן מאושרות
                          </Button>

                          {!selectMode ? (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setErr('')
                                setGalleryMsg('')
                                clearSelected()
                                setSelectMode(true)
                              }}
                              disabled={galleryBusy}
                            >
                              בחר תמונות
                            </Button>
                          ) : (
                            <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
                              <Button
                                onClick={selectedCount <= DIRECT_MAX ? downloadSelectedDirect : downloadSelectedZip}
                                disabled={galleryBusy || selectedCount === 0}
                              >
                                {selectedCount <= DIRECT_MAX
                                  ? `הורד ישיר (${selectedCount}/${DIRECT_MAX})`
                                  : `הורד ZIP (${selectedCount})`}
                              </Button>

                              <Button variant="ghost" onClick={selectAllApproved} disabled={galleryBusy}>
                                בחר הכל
                              </Button>

                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setSelectMode(false)
                                  clearSelected()
                                  setErr('')
                                  setGalleryMsg('')
                                }}
                                disabled={galleryBusy}
                              >
                                ביטול
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="text-sm text-zinc-600 text-right">
                          מאושרות: <b>{approvedMedia.length}</b>
                        </div>
                      </div>

                      {selectMode && (
                        <p className="mt-1 text-xs text-zinc-500 text-right">
                          1–{DIRECT_MAX} תמונות יורדות בהורדה ישירה. מעל {DIRECT_MAX} יורד ZIP (ללא הגבלה).
                        </p>
                      )}

                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {approvedMedia.map((p: any) => (
                          <div key={p.id} className="rounded-2xl border border-zinc-200 overflow-hidden">
                            <button
                              className="relative block aspect-square w-full bg-zinc-50"
                              onClick={() => {
                                if (selectMode) return toggleSelected(p.id)
                                if (p.url) setLightbox(p.url)
                              }}
                              type="button"
                            >
                              <img src={p.thumb_url || p.url} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />

                              {selectMode ? (
                                <div className="absolute left-2 top-2">
                                  <div
                                    className={`h-7 w-7 rounded-full border bg-white/90 flex items-center justify-center text-sm ${selected[p.id] ? 'font-bold' : ''}`}
                                    aria-hidden
                                  >
                                    {selected[p.id] ? '✓' : ''}
                                  </div>
                                </div>
                              ) : null}
                            </button>

                            <div className="p-3 flex gap-2 justify-end">
                              <Button variant="ghost" onClick={() => deleteMediaItem(p.id)}>
                                מחק
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {approvedMedia.length === 0 && <p className="text-sm text-zinc-600 text-right mt-2">אין תמונות מאושרות.</p>}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {lightbox && (
            <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
              <div className="relative mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
                <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                  <Button variant="ghost" onClick={() => triggerDownload(lightbox)} className="bg-white/90 text-black shadow hover:bg-white" type="button">
                    הורד תמונה
                  </Button>
                  <Button variant="ghost" onClick={() => setLightbox(null)} className="bg-white/90 text-black shadow hover:bg-white" type="button">
                    סגור
                  </Button>
                </div>

                <img src={lightbox} alt="" className="w-full rounded-2xl bg-white" />
              </div>
            </div>
          )}
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