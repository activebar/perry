'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { Button, Card, Container, Input } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function ResetInner() {
  const sp = useSearchParams()

  const token = useMemo(() => sp.get('token') || '', [sp])
  const email = useMemo(() => sp.get('email') || '', [sp])

  const [newPass, setNewPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setMsg(null)
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, new_password: newPass })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'שגיאה')
      setMsg('✅ עודכן! אפשר להתחבר עם הסיסמה החדשה.')
      setNewPass('')
    } catch (e: any) {
      setErr(e?.message || 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <Container>
        <Card>
          <div className="flex items-center justify-between gap-2" dir="rtl">
            <h2 className="text-xl font-bold">איפוס סיסמה</h2>
            <Link href="/admin/login">
              <Button variant="ghost">← התחברות</Button>
            </Link>
          </div>
        </Card>

        <div className="mt-4">
          <Card>
            <div className="space-y-2" dir="rtl">
              <p className="text-sm text-zinc-600">כתובת: <span className="font-semibold">{email || '—'}</span></p>
              {!token && <p className="text-sm text-red-600">חסר token בקישור.</p>}

              <Input
                type="password"
                placeholder="סיסמה חדשה"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
              />

              <Button disabled={busy || !token || newPass.length < 6} onClick={submit}>
                {busy ? 'שומר...' : 'עדכן סיסמה'}
              </Button>

              {msg && <p className="text-sm text-emerald-600">{msg}</p>}
              {err && <p className="text-sm text-red-600">{err}</p>}
            </div>
          </Card>
        </div>
      </Container>
    </main>
  )
}

export default function AdminResetPage() {
  // Next דורש Suspense סביב useSearchParams כדי להימנע משגיאת prerender
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  )
}
