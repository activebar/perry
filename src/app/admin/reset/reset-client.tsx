'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui'

export default function ResetClient() {
  const router = useRouter()
  const sp = useSearchParams()
  const token = sp?.get('token') || ''

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // When no token, just show instructions.
    if (!token) return

    let cancelled = false
    ;(async () => {
      setBusy(true)
      setMsg(null)
      setErr(null)
      try {
        const res = await fetch('/api/admin/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error || 'שגיאה')
        if (cancelled) return
        setMsg('✅ בוצע איפוס. מעביר למסך התחברות…')
        setTimeout(() => router.push('/admin'), 900)
      } catch (e: any) {
        if (cancelled) return
        setErr(String(e?.message || 'שגיאה'))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6" dir="rtl">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-right">
        <h1 className="text-xl font-bold">איפוס מנהל</h1>

        {!token ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-zinc-600">
              חסר טוקן איפוס. פתח/י את הקישור המלא שנשלח אליך.
            </p>
            <Link href="/admin">
              <Button variant="ghost">חזרה למסך מנהל</Button>
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {busy && <p className="text-sm text-zinc-700">מבצע איפוס…</p>}
            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
            {err && <p className="text-sm text-red-600">{err}</p>}
            {!busy && !msg && !err && <p className="text-sm text-zinc-700">מתחיל…</p>}
          </div>
        )}
      </div>
    </main>
  )
}
