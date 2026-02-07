'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input } from '@/components/ui'

type Access = {
  id: string
  event_id: string
  name: string
  role: string
  phone: string | null
  email: string | null
  is_active: boolean
  session_version: number
  last_sent_at: string | null
  created_at: string
  permissions?: PermissionMap
}

type PermissionMap = Record<string, boolean>

type Row = {
  event_id: string
  admin_user_id: string
  permissions: PermissionMap
  is_active: boolean
  created_at: string
  admin: { id: string; email: string; username: string; role: string; is_active: boolean }
}

const PERMS: Array<{ key: string; label: string; group: string }> = [
  { key: 'blessings.read', label: 'צפייה', group: 'ברכות' },
  { key: 'blessings.write', label: 'הוספה', group: 'ברכות' },
  { key: 'blessings.moderate', label: 'אישור/סינון', group: 'ברכות' },
  { key: 'blessings.delete', label: 'מחיקה', group: 'ברכות' },

  { key: 'galleries.read', label: 'צפייה', group: 'גלריות' },
  { key: 'galleries.write', label: 'יצירה/העלאה/סדר', group: 'גלריות' },
  { key: 'galleries.delete', label: 'מחיקה', group: 'גלריות' },

  { key: 'design.edit', label: 'עריכה', group: 'עיצוב ותוכן' },

  { key: 'event.edit', label: 'עריכת פרטי אירוע', group: 'אירוע' },
  { key: 'event.clone', label: 'שכפול אירוע', group: 'אירוע' },
]

function groupPerms() {
  const g: Record<string, Array<{ key: string; label: string }>> = {}
  for (const p of PERMS) {
    g[p.group] ||= []
    g[p.group].push({ key: p.key, label: p.label })
  }
  return g
}

export default function PermissionsPanel({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const grouped = useMemo(() => groupPerms(), [])

  // Event access codes (per-event)
  const [accessRows, setAccessRows] = useState<Access[]>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessErr, setAccessErr] = useState<string | null>(null)

  const [aName, setAName] = useState('')
  const [aRole, setARole] = useState('client')
  const [aPhone, setAPhone] = useState('')
  const [aEmail, setAEmail] = useState('')
  const [createMsg, setCreateMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    const res = await fetch(`/api/admin/event-admins?event_id=${encodeURIComponent(eventId)}`, { cache: 'no-store' })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setErr(j?.error || 'שגיאה בטעינה')
      setRows([])
      setLoading(false)
      return
    }
    setRows(j.rows || [])
    setLoading(false)
  }

  async function loadAccess() {
    setAccessLoading(true)
    setAccessErr(null)
    const res = await fetch(`/api/admin/event-access?event_id=${encodeURIComponent(eventId)}`, { cache: 'no-store' })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setAccessErr(j?.error || 'שגיאה בטעינת גישות')
      setAccessRows([])
      setAccessLoading(false)
      return
    }
    setAccessRows(j.rows || [])
    setAccessLoading(false)
  }

  useEffect(() => {
    if (!eventId) return
    load()
    loadAccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function createAccess(send: 'none' | 'email' | 'both') {
    setAccessErr(null)
    setCreateMsg(null)
    const payload = {
      event_id: eventId,
      name: aName.trim(),
      role: aRole.trim() || 'client',
      phone: aPhone.trim() || null,
      email: aEmail.trim().toLowerCase() || null,
      send
    }
    const res = await fetch('/api/admin/event-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setAccessErr(j?.error || 'שגיאה ביצירה')
      return
    }
    setAccessRows(j.rows || [])
    setAName('')
    setARole('client')
    setAPhone('')
    setAEmail('')
    if (send === 'none' && j.code) {
      setCreateMsg(`✅ נוצרה גישה. קוד זמני: ${j.code}`)
    } else {
      setCreateMsg('✅ נוצרה גישה ונשלח מייל (אם המייל מוגדר והשליחה פעילה).')
    }
  }

  async function rotateCode(row: Access, send: 'none' | 'email') {
    setAccessErr(null)
    const res = await fetch('/api/admin/event-access', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'rotate_code', id: row.id, event_id: eventId, send, email: row.email })
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setAccessErr(j?.error || 'שגיאה')
      return
    }
    setAccessRows(j.rows || [])
    if (send === 'none' && j.code) setCreateMsg(`✅ קוד חדש: ${j.code}`)
    else setCreateMsg('✅ נוצר קוד חדש ונשלח מייל (אם פעיל).')
  }

  function setAccessPerm(accessId: string, key: string, value: boolean) {
    setAccessRows(prev =>
      prev.map(r => {
        if (r.id !== accessId) return r
        const next = { ...(r.permissions || {}) }
        next[key] = value
        return { ...r, permissions: next }
      })
    )
  }

  async function saveAccessPerms(row: Access) {
    setAccessErr(null)
    const res = await fetch('/api/admin/event-access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_permissions',
        id: row.id,
        event_id: row.event_id,
        permissions: row.permissions || {}
      })
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setAccessErr(j?.error || 'שגיאה בשמירת הרשאות')
      return
    }
    setAccessRows(j.rows || prev => prev)
  }

  function defaultAccessPermsForRole(role: string): PermissionMap {
    const r = (role || 'client').toLowerCase()
    if (r === 'photographer') return { 'galleries.read': true, 'galleries.write': true }
    if (r === 'partner') return { 'blessings.read': true, 'blessings.write': true, 'blessings.moderate': true, 'galleries.read': true, 'galleries.write': true }
    // client (default)
    return { 'blessings.read': true, 'blessings.write': true }
  }

  function applyRoleDefaults(row: Access) {
    setAccessRows(prev => prev.map(r => (r.id === row.id ? { ...r, permissions: defaultAccessPermsForRole(r.role) } : r)))
  }

  async function toggleAccessActive(row: Access) {
    setAccessErr(null)
    const res = await fetch('/api/admin/event-access', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_active', id: row.id, event_id: eventId, is_active: !row.is_active })
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setAccessErr(j?.error || 'שגיאה')
      return
    }
    await loadAccess()
  }

  async function logoutAll(row: Access) {
    if (!confirm('לנתק את כל המכשירים של הגישה הזו?')) return
    setAccessErr(null)
    const res = await fetch('/api/admin/event-access', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'logout_all', id: row.id, event_id: eventId })
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setAccessErr(j?.error || 'שגיאה')
      return
    }
    setAccessRows(j.rows || [])
    setCreateMsg('✅ נותקו כל המכשירים (המשתמש יצטרך להתחבר מחדש).')
  }

  function waLink(row: Access) {
    const phone = (row.phone || '').replace(/[^0-9]/g, '')
    if (!phone) return ''
    const url = `${location.origin}/admin/login?event=${encodeURIComponent(eventId)}`
    const msg = `פרטי גישה לניהול האירוע\n\nאירוע: ${eventId}\nקישור כניסה: ${url}\n\n(אם שכחת קוד: בעמוד יש אפשרות "שכחתי קוד" למייל)`
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  }

  async function addAdmin() {
    const e = email.trim().toLowerCase()
    if (!e) return
    setErr(null)
    const res = await fetch('/api/admin/event-admins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, email: e, permissions: {}, is_active: true })
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setErr(j?.error || 'שגיאה בהוספה')
      return
    }
    setEmail('')
    await load()
  }

  async function deleteAccess(row: Access) {
    if (!confirm('למחוק את הגישה?')) return
    setAccessErr(null)
    const res = await fetch(`/api/admin/event-access?event_id=${encodeURIComponent(eventId)}&id=${encodeURIComponent(row.id)}`, {
      method: 'DELETE'
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setAccessErr(j?.error || 'שגיאה במחיקה')
      return
    }
    setAccessRows(j.rows || [])
  }

  function togglePerm(row: Row, key: string) {
    const next: Row = {
      ...row,
      permissions: { ...row.permissions, [key]: !(row.permissions?.[key] ?? false) }
    }
    saveRow(next)
  }

  async function toggleActive(row: Row) {
    const next: Row = { ...row, is_active: !row.is_active }
    saveRow(next)
  }

  async function saveRow(row: Row) {
    setErr(null)
    const res = await fetch('/api/admin/event-admins', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_id: row.event_id,
        admin_user_id: row.admin_user_id,
        permissions: row.permissions,
        is_active: row.is_active
      })
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setErr(j?.error || 'שגיאה בשמירה')
      return
    }
    setRows(prev => prev.map(r => (r.admin_user_id === row.admin_user_id ? row : r)))
  }

  async function removeRow(row: Row) {
    if (!confirm('למחוק את המנהל מהאירוע?')) return
    setErr(null)
    const res = await fetch(
      `/api/admin/event-admins?event_id=${encodeURIComponent(eventId)}&admin_user_id=${encodeURIComponent(row.admin_user_id)}`,
      { method: 'DELETE' }
    )
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      setErr(j?.error || 'שגיאה במחיקה')
      return
    }
    await load()
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-bold">הרשאות מנהלים לאירוע</h3>
        <p className="text-sm text-zinc-600">
          כאן מנהל ראשי (master) מאשר למנהלי אתר אילו חלקים הם יכולים לנהל.
        </p>

        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
          <Input
            placeholder="מייל של מנהל (admin_users)"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full md:max-w-md"
          />
          <Button onClick={addAdmin}>הוסף מנהל</Button>
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        ) : null}
      </Card>

      <Card>
        <h3 className="text-lg font-bold">גישות מהירות לאירוע (קוד גישה)</h3>
        <p className="text-sm text-zinc-600">
          יצירת גישות ללקוח/צלם/שותף עם קוד גישה. ניתן לשלוח במייל (Resend) או לשתף בווטסאפ.
          קישור כניסה: <span className="font-mono" dir="ltr">/admin/login?event={eventId}</span>
        </p>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <Input placeholder="שם" value={aName} onChange={e => setAName(e.target.value)} />
          <Input placeholder="תפקיד (client/photographer/partner...)" value={aRole} onChange={e => setARole(e.target.value)} />
          <Input placeholder="טלפון (לוואטסאפ)" value={aPhone} onChange={e => setAPhone(e.target.value)} />
          <Input placeholder="מייל (לשליחה)" value={aEmail} onChange={e => setAEmail(e.target.value)} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => createAccess('none')} disabled={!aName.trim()}>
            צור קוד והצג לי
          </Button>
          <Button variant="ghost" onClick={() => createAccess('email')} disabled={!aName.trim() || !aEmail.trim()}>
            צור ושלח במייל
          </Button>
        </div>

        {createMsg ? <div className="mt-3 text-sm text-green-700">{createMsg}</div> : null}
        {accessErr ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{accessErr}</div> : null}

        <div className="mt-4 flex items-center justify-between">
          <h4 className="font-bold">רשימת גישות</h4>
          <div className="text-xs text-zinc-500">{accessRows.length} גישות</div>
        </div>

        {accessLoading ? (
          <div className="mt-3 text-sm text-zinc-600">טוען...</div>
        ) : accessRows.length === 0 ? (
          <div className="mt-3 text-sm text-zinc-600">אין גישות עדיין.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {accessRows.map(r => (
              <div key={r.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">{r.name} <span className="text-xs text-zinc-500">({r.role})</span></div>
                    <div className="text-xs text-zinc-500" dir="ltr">
                      {r.email || '—'} {r.phone ? ` • ${r.phone}` : ''}
                    </div>
                    <div className="text-xs text-zinc-400">id: <span className="font-mono">{r.id}</span> • ver: {r.session_version}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleAccessActive(r)}
                      className={'rounded-xl px-3 py-1.5 text-xs ' + (r.is_active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800')}
                    >
                      {r.is_active ? 'פעיל' : 'מושבת'}
                    </button>
                    <button onClick={() => rotateCode(r, 'none')} className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs hover:bg-zinc-200">
                      קוד חדש
                    </button>
                    <button
                      onClick={() => rotateCode(r, 'email')}
                      disabled={!r.email}
                      className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs hover:bg-zinc-200 disabled:opacity-50"
                    >
                      קוד חדש במייל
                    </button>
                    <button onClick={() => logoutAll(r)} className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100">
                      נתק מכשירים
                    </button>
                    {r.phone ? (
                      <a href={waLink(r)} target="_blank" rel="noreferrer" className="rounded-xl bg-green-50 px-3 py-1.5 text-xs text-green-700 hover:bg-green-100">
                        וואטסאפ
                      </a>
                    ) : null}
                    <button onClick={() => deleteAccess(r)} className="rounded-xl bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100">
                      מחק
                    </button>
                  </div>
                </div>

                {/* permissions for this access */}
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {Object.entries(grouped).map(([groupName, items]) => (
                    <div key={groupName} className="rounded-xl bg-zinc-50 p-3">
                      <div className="mb-2 text-sm font-semibold">{groupName}</div>
                      <div className="space-y-2">
                        {items.map(p => (
                          <label key={p.key} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!(r.permissions || {})[p.key]}
                              onChange={e => setAccessPerm(r.id, p.key, e.target.checked)}
                            />
                            <span>{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="md:col-span-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => applyRoleDefaults(r)}
                      className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs hover:bg-zinc-200"
                    >
                      ברירת מחדל לפי תפקיד
                    </button>
                    <button
                      onClick={() => saveAccessPerms(r)}
                      className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs text-white hover:opacity-90"
                    >
                      שמור הרשאות
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h4 className="font-bold">רשימת מנהלים</h4>
          <div className="text-xs text-zinc-500">{rows.length} מנהלים</div>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-zinc-600">טוען...</div>
        ) : rows.length === 0 ? (
          <div className="mt-4 text-sm text-zinc-600">אין מנהלי אירוע מוגדרים עדיין.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map(row => (
              <div key={row.admin_user_id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">{row.admin?.email}</div>
                    <div className="text-xs text-zinc-500">
                      {row.admin?.username} • role: {row.admin?.role} • id: <span className="font-mono">{row.admin_user_id}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleActive(row)}
                      className={
                        'rounded-xl px-3 py-1.5 text-xs ' +
                        (row.is_active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800')
                      }
                    >
                      {row.is_active ? 'פעיל' : 'מושבת'}
                    </button>
                    <button
                      onClick={() => removeRow(row)}
                      className="rounded-xl bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
                    >
                      הסר
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {Object.entries(grouped).map(([group, perms]) => (
                    <div key={group} className="rounded-xl border bg-zinc-50 p-3">
                      <div className="mb-2 text-sm font-semibold">{group}</div>
                      <div className="space-y-2">
                        {perms.map(p => {
                          const checked = row.permissions?.[p.key] ?? false
                          return (
                            <label key={p.key} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePerm(row, p.key)}
                              />
                              <span className="text-zinc-800">{p.label}</span>
                              <span className="text-xs text-zinc-500 font-mono">{p.key}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
