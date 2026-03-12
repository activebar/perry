'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, Textarea } from '@/components/ui'

async function jfetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts?.headers || {}) }
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'Request failed')
  return json
}

type TemplateRow = {
  id: string
  name: string
  kind: string
  description?: string | null
  is_active: boolean
  updated_at?: string | null
}

export default function ClonePanel(props: { eventId: string }) {
  const { eventId } = props
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>('')

  const [targetEventId, setTargetEventId] = useState('')
  const [targetName, setTargetName] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [notes, setNotes] = useState('')

  const selected = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId])

  async function refresh() {
    setLoading(true)
    setErr('')
    try {
      const json = await jfetch('/api/admin/site-templates')
      setTemplates(json?.templates || [])
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function createTemplateFromCurrent() {
    setBusy(true)
    setErr('')
    try {
      const name = prompt('שם תבנית') || ''
      if (!name.trim()) return
      const kind = prompt('סוג תבנית, למשל wedding או barmitzvah או trip') || ''
      const description = prompt('תיאור קצר, אופציונלי') || ''
      await jfetch('/api/admin/site-templates', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_from_event',
          source_event_id: eventId,
          name: name.trim(),
          kind: kind.trim() || 'generic',
          description: description.trim()
        })
      })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function runClone() {
    setBusy(true)
    setErr('')
    try {
      if (!targetEventId.trim()) throw new Error('חסר event_id חדש')
      if (!templateId) throw new Error('בחר תבנית')

      await jfetch('/api/admin/clone-event', {
        method: 'POST',
        body: JSON.stringify({
          source_event_id: eventId,
          template_id: templateId,
          target_event_id: targetEventId.trim(),
          target_event_name: targetName.trim(),
          notes: notes.trim()
        })
      })

      alert('שכפול בוצע. עכשיו צריך לפתוח פרויקט Vercel חדש עם EVENT_SLUG של האתר החדש, ולהריץ SQL אם נדרש.')
      setTargetEventId('')
      setTargetName('')
      setNotes('')
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-right">
            <h3 className="font-semibold">שכפול אתר לפי תבנית</h3>
            <p className="mt-1 text-sm text-zinc-600">
              תבנית היא סט של הגדרות, בלוקים, גלריות וחוקים שניתן לשכפל לאירועים נוספים.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={refresh} disabled={loading || busy}>
              רענן
            </Button>
            <Button type="button" onClick={createTemplateFromCurrent} disabled={busy}>
              שמור כתבנית מהאירוע הנוכחי
            </Button>
          </div>
        </div>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <div className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">בחר תבנית</label>
            <select
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">בחר</option>
              {templates
                .filter((t) => t.is_active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.kind})
                  </option>
                ))}
            </select>
            {selected?.description ? <p className="text-xs text-zinc-500">{selected.description}</p> : null}
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">event_id חדש</label>
            <Input value={targetEventId} onChange={(e) => setTargetEventId(e.target.value)} placeholder="למשל shai-wedding" dir="ltr" />
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">שם תצוגה לאירוע, אופציונלי</label>
            <Input value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="למשל שי והרן" />
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">הערות, אופציונלי</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={runClone} disabled={busy}>
              {busy ? 'מבצע שכפול...' : 'שכפל'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h4 className="font-semibold">מה קורה אחרי השכפול</h4>
        <ol className="mt-2 list-decimal space-y-1 pr-5 text-sm text-zinc-700">
          <li>הנתונים משוכפלים בבסיס הנתונים ל event_id החדש</li>
          <li>ב Vercel יוצרים Project חדש ומגדירים ENV: EVENT_SLUG=ה event_id החדש</li>
          <li>אם צריך, מעדכנים דומיין וסאב דומיין</li>
        </ol>
      </Card>
    </div>
  )
}
