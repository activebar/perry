'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, Input, Button } from '@/components/ui'

function normalize(s: string) {
  return (s || '').trim()
}

export default function LoginByCode() {
  const router = useRouter()
  const sp = useSearchParams()
  const event = normalize((sp?.get('event') ?? sp?.get('event_id') ?? ''))

  const [eventId, setEventId] = useState(event)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [forgotValue, setForgotValue] = useState('')
  const [forgotMsg, setForgotMsg] = useState<string | null>(null)

  const canSubmit = useMemo(() => !!normalize(eventId) && !!normalize(code) && !busy, [eventId, code, busy])

  async function login() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/event-access/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event_id: normalize(eventId), code })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'שגיאה בהתחברות')
      router.replace('/admin')
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בהתחברות')
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    setBusy(true)
    setErr(null)
    setForgotMsg(null)
    try {
      const res = await fetch('/api/event-access/forgot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event_id: normalize(eventId), value: normalize(forgotValue) })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'לא הצלחנו לשלוח קוד')
      setForgotMsg('✅ נשלח קוד חדש למייל שמוגדר בגישה הזו.')
      setForgotValue('')
    } catch (e: any) {
      setForgotMsg(null)
      setErr(e?.message || 'לא הצלחנו לשלוח קוד')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4" dir="rtl">
      <Card>
        <h1 className="text-lg font-bold">כניסה לניהול אירוע</h1>
        <p className="mt-1 text-sm text-zinc-600">הזן/י קוד גישה שקיבלת במייל.</p>

        <div className="mt-4 grid gap-2">
          <Input placeholder="Event ID / Slug (לדוגמה: ido)" value={eventId} onChange={e => setEventId(e.target.value)} />
          <Input
            placeholder="קוד גישה"
            value={code}
            onChange={e => setCode(e.target.value)}
            autoComplete="current-password"
            onKeyDown={e => {
              if (e.key === 'Enter' && canSubmit) login()
            }}
          />
          <Button disabled={!canSubmit} onClick={login}>
            {busy ? 'מתחבר...' : 'התחבר'}
          </Button>

          {err ? <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        </div>

        <div className="mt-6 rounded-2xl border bg-zinc-50 p-3">
          <div className="font-semibold">שכחתי קוד</div>
          <p className="mt-1 text-xs text-zinc-600">נשלח קוד חדש למייל המשויך לגישה (נדרש מייל מוגדר אצל מנהל האירוע).</p>
          <div className="mt-2 flex flex-col gap-2 md:flex-row">
            <Input placeholder="מייל או טלפון" value={forgotValue} onChange={e => setForgotValue(e.target.value)} />
            <Button variant="ghost" disabled={busy || !normalize(eventId) || !normalize(forgotValue)} onClick={forgot}>
              שלח קוד
            </Button>
          </div>
          {forgotMsg ? <div className="mt-2 text-sm text-green-700">{forgotMsg}</div> : null}
        </div>

        <div className="mt-4 text-xs text-zinc-500">
          מנהל ראשי? התחברות עם שם משתמש/סיסמה נמצאת בעמוד /admin.
        </div>
      </Card>
    </div>
  )
}
