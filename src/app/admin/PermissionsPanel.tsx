'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input } from '@/components/ui'

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

  useEffect(() => {
    if (!eventId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

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
