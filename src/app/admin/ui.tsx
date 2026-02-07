'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input } from '@/components/ui'

type AdminMe = { id: string; email: string; role: string }
type ContentRule = {
  id: string
  rule_type: 'block' | 'allow'
  scope: 'event' | 'global'
  event_id: string | null
  match_type: 'contains' | 'exact' | 'word'
  expression: string
  note: string | null
  is_active: boolean
  created_at?: string
}

type PostRow = {
  id: string
  created_at: string
  author_name: string | null
  text: string | null
  media_url: string | null
  video_url: string | null
  link_url: string | null
  status: string
  kind: string
}

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

function getActiveEventIdClient() {
  // compile-time replaced in Next for client bundle
  return (process.env.NEXT_PUBLIC_EVENT_ID || process.env.EVENT_ID || 'IDO').trim()
}

export default function AdminUI() {
  const activeEventId = useMemo(() => getActiveEventIdClient(), [])

  const [admin, setAdmin] = useState<AdminMe | null>(null)
  const [checking, setChecking] = useState(true)

  // login form
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // tabs
  type Tab = 'settings' | 'moderation' | 'content'
  const [tab, setTab] = useState<Tab>('moderation')

  // moderation
  const [pendingKind, setPendingKind] = useState<'blessing' | 'gallery'>('blessing')
  const [pending, setPending] = useState<PostRow[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loadingPending, setLoadingPending] = useState(false)

  // content rules
  const [rules, setRules] = useState<ContentRule[]>([])
  const [loadingRules, setLoadingRules] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [ruleType, setRuleType] = useState<'block' | 'allow'>('block')
  const [scope, setScope] = useState<'event' | 'global'>('event')
  const [matchType, setMatchType] = useState<'contains' | 'exact' | 'word'>('contains')
  const [expression, setExpression] = useState('')
  const [note, setNote] = useState('')

  async function refreshMe() {
    try {
      const res = await jfetch('/api/admin/me')
      setAdmin(res.admin || null)
    } catch {
      setAdmin(null)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    refreshMe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login() {
    setErr(null)
    setBusy(true)
    try {
      await jfetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) })
      await refreshMe()
    } catch (e: any) {
      setErr(e?.message || 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    try {
      await jfetch('/api/admin/logout', { method: 'POST' })
    } catch {}
    setAdmin(null)
    setBusy(false)
  }

  async function loadPending() {
    setLoadingPending(true)
    try {
      const res = await jfetch(`/api/admin/posts?status=pending&kind=${pendingKind}`, { method: 'GET' })
      setPending(res.posts || [])
      setPendingCount((res.posts || []).length)
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בטעינת ממתינות')
    } finally {
      setLoadingPending(false)
    }
  }

  async function setPostStatus(id: string, status: 'approved' | 'deleted') {
    try {
      await jfetch('/api/admin/posts', { method: 'PUT', body: JSON.stringify({ id, status }) })
      setPending((prev) => prev.filter((p) => p.id !== id))
      setPendingCount((c) => Math.max(0, c - 1))
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בעדכון סטטוס')
    }
  }

  async function loadRules() {
    setLoadingRules(true)
    try {
      const res = await jfetch('/api/admin/content-rules', { method: 'GET' })
      setRules(res.rules || [])
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בטעינת חוקים')
    } finally {
      setLoadingRules(false)
    }
  }

  function resetRuleForm() {
    setEditingId(null)
    setRuleType('block')
    setScope('event')
    setMatchType('contains')
    setExpression('')
    setNote('')
  }

  function beginEdit(r: ContentRule) {
    setEditingId(r.id)
    setRuleType(r.rule_type)
    setScope(r.scope)
    setMatchType(r.match_type)
    setExpression(r.expression || '')
    setNote(r.note || '')
    setTab('content')
  }

  async function saveRule() {
    setErr(null)
    const payload = {
      id: editingId,
      rule_type: ruleType,
      scope,
      match_type: matchType,
      expression,
      note: note || null,
      is_active: true,
    }
    if (!expression.trim()) {
      setErr('חובה להזין מילה או ביטוי')
      return
    }
    try {
      if (editingId) {
        await jfetch('/api/admin/content-rules', { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await jfetch('/api/admin/content-rules', { method: 'POST', body: JSON.stringify(payload) })
      }
      resetRuleForm()
      await loadRules()
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בשמירה')
    }
  }

  async function toggleRule(id: string, is_active: boolean) {
    try {
      await jfetch('/api/admin/content-rules', { method: 'PUT', body: JSON.stringify({ id, is_active }) })
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, is_active } : r)))
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בעדכון חוק')
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('למחוק את החוק?')) return
    try {
      await jfetch('/api/admin/content-rules', { method: 'DELETE', body: JSON.stringify({ id }) })
      setRules((prev) => prev.filter((r) => r.id !== id))
      if (editingId === id) resetRuleForm()
    } catch (e: any) {
      setErr(e?.message || 'שגיאה במחיקה')
    }
  }

  // auto-load when switching tabs
  useEffect(() => {
    if (!admin) return
    if (tab === 'moderation') loadPending()
    if (tab === 'content') loadRules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pendingKind, admin])

  if (checking) {
    return (
      <div className="p-6" dir="rtl">
        <p className="text-sm text-zinc-600">טוען...</p>
      </div>
    )
  }

  if (!admin) {
    return (
      <div className="p-6" dir="rtl">
        <Card className="mx-auto max-w-md">
          <h2 className="mb-3 text-lg font-semibold">כניסת מנהל</h2>
          <div className="space-y-2">
            <Input placeholder="שם משתמש" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input
              placeholder="סיסמה"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button onClick={login} disabled={busy || !username || !password}>
              {busy ? 'מתחבר...' : 'התחבר'}
            </Button>
            {err && <p className="text-sm text-red-600">{err}</p>}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-right">
            <div className="text-sm text-zinc-700">
              Event ID פעיל: <span className="font-semibold text-zinc-900">{activeEventId}</span>
            </div>
            <div className="text-xs text-zinc-500">
              מחובר: {admin.email} · Role: {admin.role}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setTab('moderation')
              }}
            >
              הצג רק ממתינות{pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Button>
            <Button variant="ghost" onClick={logout} disabled={busy}>
              יציאה
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap gap-2">
          <Button variant={tab === 'moderation' ? 'primary' : 'ghost'} onClick={() => setTab('moderation')}>
            אישורים
          </Button>
          <Button variant={tab === 'content' ? 'primary' : 'ghost'} onClick={() => setTab('content')}>
            ניהול תוכן
          </Button>
          <Button variant={tab === 'settings' ? 'primary' : 'ghost'} onClick={() => setTab('settings')}>
            הגדרות
          </Button>
        </div>
      </Card>

      {tab === 'moderation' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">ממתינות לאישור</h3>
            <div className="flex items-center gap-2">
              <select
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={pendingKind}
                onChange={(e) => setPendingKind(e.target.value as any)}
              >
                <option value="blessing">ברכות</option>
                <option value="gallery">גלריה</option>
              </select>
              <Button variant="ghost" onClick={loadPending} disabled={loadingPending}>
                רענן
              </Button>
            </div>
          </div>

          {loadingPending ? (
            <p className="mt-3 text-sm text-zinc-600">טוען...</p>
          ) : pending.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">אין ממתינות להצגה</p>
          ) : (
            <div className="mt-3 space-y-3">
              {pending.map((p) => (
                <div key={p.id} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="font-semibold">{p.author_name || 'אורח'}</span>{' '}
                      <span className="text-zinc-500">{new Date(p.created_at).toLocaleString('he-IL')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button onClick={() => setPostStatus(p.id, 'approved')}>אשר</Button>
                      <Button variant="ghost" onClick={() => setPostStatus(p.id, 'deleted')}>
                        מחק
                      </Button>
                    </div>
                  </div>
                  {p.text && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{p.text}</p>}
                  {p.link_url && (
                    <p className="mt-2 text-xs text-zinc-500">
                      קישור: <span className="break-all">{p.link_url}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'content' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">ניהול תוכן · חסימות וחריגים</h3>
            <Button variant="ghost" onClick={loadRules} disabled={loadingRules}>
              רענן
            </Button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-5">
            <select
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as any)}
            >
              <option value="block">חסימה</option>
              <option value="allow">חריג</option>
            </select>

            <select
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
            >
              <option value="event">אירוע</option>
              <option value="global">גלובלי</option>
            </select>

            <select
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as any)}
            >
              <option value="contains">מכיל</option>
              <option value="exact">בדיוק</option>
              <option value="word">מילה שלמה</option>
            </select>

            <Input placeholder="מילה או ביטוי" value={expression} onChange={(e) => setExpression(e.target.value)} />
            <Input placeholder="הערה (אופציונלי)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={saveRule}>{editingId ? 'שמור שינוי' : 'הוסף חוק'}</Button>
            {editingId && (
              <Button variant="ghost" onClick={resetRuleForm}>
                בטל עריכה
              </Button>
            )}
          </div>

          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

          <div className="mt-4 space-y-2">
            {loadingRules ? (
              <p className="text-sm text-zinc-600">טוען...</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-zinc-600">אין חוקים להצגה</p>
            ) : (
              rules.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                  <div className="text-sm">
                    <span className="font-semibold">{r.rule_type === 'block' ? 'חסימה' : 'חריג'}</span>{' '}
                    <span className="text-zinc-500">
                      · {r.scope === 'global' ? 'גלובלי' : 'אירוע'} ·{' '}
                      {r.match_type === 'contains' ? 'מכיל' : r.match_type === 'exact' ? 'בדיוק' : 'מילה שלמה'}
                    </span>
                    <div className="mt-1 break-all text-zinc-900">{r.expression}</div>
                    {r.note && <div className="mt-1 text-xs text-zinc-500">{r.note}</div>}
                    {r.scope === 'event' && r.event_id && (
                      <div className="mt-1 text-xs text-zinc-500">event_id: {r.event_id}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={!!r.is_active}
                        onChange={(e) => toggleRule(r.id, e.target.checked)}
                      />
                      פעיל
                    </label>
                    <Button variant="ghost" onClick={() => beginEdit(r)}>
                      ערוך
                    </Button>
                    <Button variant="ghost" onClick={() => deleteRule(r.id)}>
                      מחק
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {tab === 'settings' && (
        <Card>
          <h3 className="text-base font-semibold">הגדרות</h3>
          <p className="mt-2 text-sm text-zinc-600">המסך הזה נשאר כמו שהיה בגרסה הקודמת. כרגע התמקדנו בתוכן ואישורים.</p>
        </Card>
      )}
    </div>
  )
}
