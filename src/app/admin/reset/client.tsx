'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Button, Card, Input } from '@/components/ui'


export default function AdminResetPage() {
  const sp = useSearchParams()
  const [ready, setReady] = useState(false)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const sb = createClient(url, anon)

        // Supabase may return either `code` (PKCE) or legacy token params.
        const code = sp.get('code')
        if (code) {
          await sb.auth.exchangeCodeForSession(code)
        }
        setReady(true)
      } catch (e: any) {
        setMsg(e?.message || 'שגיאה בקישור')
      }
    })()
  }, [sp])

  async function setPassword() {
    setMsg(null)
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const sb = createClient(url, anon)
      const { error } = await sb.auth.updateUser({ password: pw })
      if (error) throw error
      setMsg('סיסמה עודכנה. אפשר לחזור לעמוד Admin ולהתחבר.')
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה')
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <Card>
        <h2 className="text-xl font-bold">איפוס סיסמה</h2>
        {!ready && <p className="mt-2 text-sm text-zinc-600">טוען קישור...</p>}
        {ready && (
          <div className="mt-3 grid gap-2">
            <Input type="password" placeholder="סיסמה חדשה" value={pw} onChange={e => setPw(e.target.value)} />
            <Button onClick={setPassword} disabled={!pw}>עדכן סיסמה</Button>
          </div>
        )}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </Card>
    </main>
  )
}
