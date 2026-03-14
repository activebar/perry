'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, Textarea } from '@/components/ui'

function addEventParam(url: string) {
  if (typeof window === 'undefined') return url
  const e = new URLSearchParams(window.location.search).get('event')
  if (!e) return url
  if (/[?&]event=/.test(url)) return url
  return url + (url.includes('?') ? '&' : '?') + 'event=' + encodeURIComponent(e)
}

async function jfetch(url: string, opts?: RequestInit) {
  const res = await fetch(addEventParam(url), {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts?.headers || {}) }
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json?.error || `HTTP ${res.status}`) as Error & { payload?: any }
    ;(err as any).payload = json
    throw err
  }
  return json
}

type TemplateRow = {
  id: string
  name: string
  kind: string
  description?: string | null
  config_json?: any
  is_active: boolean
  source_event_id?: string | null
  created_at?: string
  updated_at?: string
}

type ResultState = {
  open: boolean
  kind: 'success' | 'error'
  title: string
  message: string
  details?: string[]
}

type ProgressState = {
  open: boolean
  title: string
  message: string
  startedAt: number | null
}

function normalizeEventId(raw: string) {
  const original = raw || ''
  let s = original.trim().toLowerCase()
  s = s.replace(/[_\s]+/g, '-')
  s = s.replace(/[^a-z0-9-]+/g, '-')
  s = s.replace(/-+/g, '-')
  s = s.replace(/^-+/, '').replace(/-+$/, '')
  return s
}

function isValidEventId(id: string) {
  if (!id) return false
  if (id.length > 24) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
}

function toHebrewError(msg: string) {
  const m = String(msg || '').trim().toLowerCase()

  if (!m) return 'אירעה שגיאה לא ידועה'

  if (m.includes('target event_id already exists')) return 'כבר קיים אירוע עם ה־event id הזה'
  if (m.includes('missing target_event_id')) return 'חסר target_event_id'
  if (m.includes('missing source_event_id')) return 'חסר source_event_id'
  if (m.includes('missing event_id')) return 'חסר event_id'
  if (m.includes('missing event id')) return 'חסר event_id'
  if (m.includes('missing template_id')) return 'חסר template_id'
  if (m.includes('missing confirm')) return 'חסרים נתוני אישור למחיקה'
  if (m.includes('unauthorized')) return 'אין הרשאה לבצע פעולה זו'
  if (m.includes('forbidden')) return 'הפעולה חסומה'
  if (m.includes('delete_event_password is not configured')) return 'סיסמת המחיקה לא הוגדרה במערכת'
  if (m.includes('סיסמת המחיקה')) return msg
  if (m.includes('לא ניתן למחוק אירוע')) return msg
  if (m.includes('storage list failed')) return 'שגיאה בקריאת קבצי ה־Storage'
  if (m.includes('storage remove failed')) return 'שגיאה במחיקת קבצים מה־Storage'
  if (m.includes('request failed')) return 'הבקשה נכשלה'
  if (m.includes('http 400')) return 'הבקשה לא תקינה'
  if (m.includes('http 401')) return 'אין הרשאה'
  if (m.includes('http 403')) return 'הפעולה חסומה'
  if (m.includes('http 404')) return 'הנתיב לא נמצא'
  if (m.includes('http 409')) return 'קיימת התנגשות בנתונים'
  if (m.includes('http 500')) return 'שגיאת שרת פנימית'

  return msg
}

function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs text-zinc-600 hover:bg-zinc-50"
        aria-label="עזרה"
        onClick={() => setOpen((p) => !p)}
        title={text}
      >
        ?
      </button>
      {open ? (
        <span className="absolute right-0 top-6 z-20 w-72 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-700 shadow-lg">
          {text}
          <button type="button" className="mt-2 text-xs text-zinc-500 underline" onClick={() => setOpen(false)}>
            סגור
          </button>
        </span>
      ) : null}
    </span>
  )
}

function ResultDialog({
  state,
  onClose
}: {
  state: ResultState
  onClose: () => void
}) {
  if (!state.open) return null

  const isSuccess = state.kind === 'success'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div
        className={
          'w-full max-w-lg rounded-2xl border bg-white p-4 shadow-lg ' +
          (isSuccess ? 'border-emerald-200' : 'border-red-200')
        }
        dir="rtl"
      >
        <div className="text-right">
          <h4 className={'font-semibold ' + (isSuccess ? 'text-emerald-700' : 'text-red-700')}>
            {state.title}
          </h4>
          <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{state.message}</p>
        </div>

        {state.details && state.details.length > 0 ? (
          <div className="mt-4 rounded-xl bg-zinc-50 p-3">
            <div className="mb-2 text-sm font-medium text-zinc-800">פירוט</div>
            <ul className="space-y-1 text-sm text-zinc-700">
              {state.details.map((line, i) => (
                <li key={`${line}-${i}`}>• {line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onClose}>
            סגור
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProgressDialog({
  state
}: {
  state: ProgressState
}) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!state.open || !state.startedAt) {
      setSeconds(0)
      return
    }

    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - state.startedAt!) / 1000))
      setSeconds(diff)
    }

    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [state.open, state.startedAt])

  if (!state.open) return null

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl" dir="rtl">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-3 text-5xl" aria-hidden>
            ⏳
          </div>

          <h4 className="text-lg font-semibold text-zinc-900">{state.title}</h4>
          <p className="mt-2 text-sm text-zinc-600">{state.message}</p>

          <div className="mt-4 rounded-xl bg-zinc-100 px-4 py-2 font-mono text-sm text-zinc-800">
            זמן שעבר: {mm}:{ss}
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-zinc-800" />
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            נא להמתין, לא לסגור את החלון ולא לרענן את הדף.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ClonePanel({ eventId }: { eventId: string }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [templateId, setTemplateId] = useState('')
  const [targetEventIdRaw, setTargetEventIdRaw] = useState('')
  const [targetName, setTargetName] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmEventId, setDeleteConfirmEventId] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteChecked, setDeleteChecked] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const [resultState, setResultState] = useState<ResultState>({
    open: false,
    kind: 'success',
    title: '',
    message: '',
    details: []
  })

  const [progressState, setProgressState] = useState<ProgressState>({
    open: false,
    title: '',
    message: '',
    startedAt: null
  })

  const selected = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId])

  const targetEventId = useMemo(() => normalizeEventId(targetEventIdRaw), [targetEventIdRaw])
  const idChangedByNormalize = useMemo(
    () => targetEventIdRaw.trim() !== '' && targetEventIdRaw.trim().toLowerCase() !== targetEventId,
    [targetEventIdRaw, targetEventId]
  )

  const idWarnLong = targetEventId.length > 20 && targetEventId.length <= 24
  const idValid = isValidEventId(targetEventId)

  const nameValid = targetName.trim().length >= 2
  const templateValid = !!templateId
  const canSubmit = templateValid && idValid && nameValid && !busy

  const blockingTemplates = useMemo(
    () =>
      templates.filter(
        (t) =>
          t.is_active &&
          String(t.source_event_id || '').trim() === String(eventId || '').trim()
      ),
    [templates, eventId]
  )

  const canDelete =
    deleteConfirmEventId.trim() === eventId &&
    deletePassword.trim().length > 0 &&
    deleteChecked &&
    !deleteBusy &&
    blockingTemplates.length === 0

  async function refresh() {
    setLoading(true)
    setErr(null)
    setOk(null)
    try {
      const json = await jfetch('/api/admin/site-templates')
      setTemplates(Array.isArray(json?.templates) ? json.templates : [])
    } catch (e: any) {
      setErr(toHebrewError(e?.message || 'שגיאה בטעינת תבניות'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function createTemplateFromCurrent() {
    setErr(null)
    setOk(null)
    setBusy(true)
    try {
      const fallbackName = eventId ? `Template ${eventId}` : 'Template'
      const json = await jfetch('/api/admin/site-templates', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_from_event',
          source_event_id: eventId,
          name: fallbackName,
          kind: 'generic',
          description: `נוצר מהאירוע ${eventId}`
        })
      })
      setOk(json?.message || 'התבנית נשמרה בהצלחה')
      await refresh()
    } catch (e: any) {
      setErr(toHebrewError(e?.message || 'שגיאה בשמירה כתבנית'))
    } finally {
      setBusy(false)
    }
  }

  function openConfirm() {
    setErr(null)
    setOk(null)

    if (!templateValid) return setErr('צריך לבחור תבנית')
    if (!targetEventId) return setErr('צריך למלא event id')
    if (!idValid) return setErr('event id לא תקין, יש להשתמש באנגלית קטנה ומספרים בלבד, ומקפים בין מילים')
    if (!nameValid) return setErr('צריך למלא שם תצוגה, לפחות 2 תווים')

    setConfirmOpen(true)
  }

  async function runClone() {
    setErr(null)
    setOk(null)
    setBusy(true)
    setProgressState({
      open: true,
      title: 'השכפול בתהליך',
      message: 'מעתיק נתונים, גלריות וקבצים. זה עשוי לקחת מעט זמן.',
      startedAt: Date.now()
    })

    try {
      const finalTargetName = targetName.trim()
      const json = await jfetch('/api/admin/clone-event', {
        method: 'POST',
        body: JSON.stringify({
          source_event_id: eventId,
          template_id: templateId,
          target_event_id: targetEventId,
          target_event_name: finalTargetName,
          notes: notes.trim() || null
        })
      })

      setConfirmOpen(false)
      setTargetEventIdRaw('')
      setTargetName('')
      setNotes('')
      await refresh()

      setResultState({
        open: true,
        kind: 'success',
        title: 'השכפול הושלם בהצלחה',
        message: json?.message || `האירוע "${targetEventId}" נוצר בהצלחה`,
        details: [
          `אירוע מקור: ${eventId}`,
          `אירוע חדש: ${targetEventId}`,
          `שם תצוגה: ${finalTargetName}`
        ]
      })
    } catch (e: any) {
      const payload = e?.payload || {}
      const details: string[] = []

      if (payload?.details) details.push(String(payload.details))

      setResultState({
        open: true,
        kind: 'error',
        title: 'השכפול נכשל',
        message: toHebrewError(e?.message || 'שגיאה בשכפול'),
        details
      })
    } finally {
      setBusy(false)
      setProgressState({
        open: false,
        title: '',
        message: '',
        startedAt: null
      })
    }
  }

  function resetDeleteForm() {
    setDeleteConfirmEventId('')
    setDeletePassword('')
    setDeleteChecked(false)
    setDeleteBusy(false)
  }

  function openDeleteDialog() {
    setErr(null)
    setOk(null)
    resetDeleteForm()
    setDeleteOpen(true)
  }

  async function runDelete() {
    setErr(null)
    setOk(null)

    if (blockingTemplates.length > 0) {
      setResultState({
        open: true,
        kind: 'error',
        title: 'לא ניתן למחוק את האירוע',
        message: 'האירוע משמש כתבנית פעילה ולכן המחיקה נחסמה.',
        details: blockingTemplates.map((t) => `${t.name} (${t.kind})`)
      })
      return
    }

    if (deleteConfirmEventId.trim() !== eventId) {
      setResultState({
        open: true,
        kind: 'error',
        title: 'מחיקת האירוע נכשלה',
        message: 'יש להקליד את ה-event_id המדויק לאישור.'
      })
      return
    }

    if (!deletePassword.trim()) {
      setResultState({
        open: true,
        kind: 'error',
        title: 'מחיקת האירוע נכשלה',
        message: 'יש להקליד סיסמת מחיקה.'
      })
      return
    }

    if (!deleteChecked) {
      setResultState({
        open: true,
        kind: 'error',
        title: 'מחיקת האירוע נכשלה',
        message: 'יש לאשר שהמחיקה תמחק גם DB וגם Storage.'
      })
      return
    }

    setDeleteBusy(true)
    setProgressState({
      open: true,
      title: 'המחיקה בתהליך',
      message: 'מוחק נתוני DB וקבצי Storage של האירוע. זה עשוי לקחת מעט זמן.',
      startedAt: Date.now()
    })

    try {
      const json = await jfetch('/api/admin/delete-event', {
        method: 'POST',
        body: JSON.stringify({
          event_id: eventId,
          confirm_event_id: deleteConfirmEventId.trim(),
          delete_password: deletePassword.trim(),
          confirm_checked: deleteChecked
        })
      })

      const dbDeleted = json?.db_deleted || {}
      const details: string[] = [
        `event_id: ${json?.deleted_event_id || eventId}`,
        `נמחקו מה-Storage: ${Number(json?.storage_deleted_count || 0)} קבצים`
      ]

      Object.entries(dbDeleted).forEach(([table, count]) => {
        details.push(`${table}: ${Number(count || 0)} רשומות`)
      })

      setDeleteOpen(false)
      resetDeleteForm()
      await refresh()

      setResultState({
        open: true,
        kind: 'success',
        title: 'האירוע נמחק בהצלחה',
        message: json?.message || `האירוע "${eventId}" נמחק בהצלחה`,
        details
      })
    } catch (e: any) {
      const payload = e?.payload || {}
      const details: string[] = []

      if (Array.isArray(payload?.templates) && payload.templates.length > 0) {
        for (const t of payload.templates) {
          details.push(`${t.name || t.id} (${t.kind || 'template'})`)
        }
      }

      setResultState({
        open: true,
        kind: 'error',
        title: 'מחיקת האירוע נכשלה',
        message: toHebrewError(e?.message || 'שגיאה במחיקת האירוע'),
        details
      })
    } finally {
      setDeleteBusy(false)
      setProgressState({
        open: false,
        title: '',
        message: '',
        startedAt: null
      })
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <ProgressDialog state={progressState} />

      <ResultDialog
        state={resultState}
        onClose={() =>
          setResultState({
            open: false,
            kind: 'success',
            title: '',
            message: '',
            details: []
          })
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-right">
            <h3 className="font-semibold">שכפול אתר לפי תבנית</h3>
            <p className="mt-1 text-sm text-zinc-600">
              תבנית היא סט של הגדרות, בלוקים, גלריות וחוקים שניתן לשכפל לאירועים נוספים.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={refresh} disabled={loading || busy || deleteBusy}>
              רענן
            </Button>
            <Button type="button" onClick={createTemplateFromCurrent} disabled={busy || deleteBusy}>
              שמור כתבנית מהאירוע הנוכחי
            </Button>
            <button
              type="button"
              onClick={openDeleteDialog}
              disabled={busy || deleteBusy}
              className="rounded-xl border border-red-200 bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              מחק אירוע
            </button>
          </div>
        </div>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        {ok ? <p className="mt-3 text-sm text-emerald-700">{ok}</p> : null}

        <div className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <label className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                בחר תבנית
                <HelpTip text="התבנית קובעת אילו בלוקים, הגדרות, גלריות וחוקי תוכן יועתקו לאירוע החדש. אפשר ליצור תבנית מהאירוע הנוכחי ואז לשכפל ממנה." />
              </span>
              <span className="text-[11px] text-zinc-400">{loading ? 'טוען...' : `${templates.filter((t) => t.is_active).length} פעיל`}</span>
            </label>
            <select
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={busy || deleteBusy || loading}
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
            {!loading && templates.filter((t) => t.is_active).length === 0 ? (
              <p className="text-xs text-zinc-500">
                עדיין אין תבניות פעילות. אפשר ללחוץ על "שמור כתבנית מהאירוע הנוכחי" כדי ליצור תבנית ראשונה.
              </p>
            ) : null}
            {!templateValid ? <p className="text-xs text-red-600">חובה לבחור תבנית</p> : null}
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">
              event id חדש
              <HelpTip text="זה השם הטכני של האתר. בשלב הזה הוא ישמש גם כחלק מהכתובת, למשל perry b vercel app wedding, ובהמשך כסאב דומיין, למשל wedding activebar co il. מומלץ קצר, ברור וקל להקלדה." />
            </label>
            <Input value={targetEventIdRaw} onChange={(e) => setTargetEventIdRaw(e.target.value)} placeholder="למשל wedding" dir="ltr" />
            {idChangedByNormalize ? (
              <p className="text-xs text-zinc-600">
                תיקון אוטומטי מוצע: <span className="font-mono">{targetEventId || 'ריק'}</span>
              </p>
            ) : null}
            {!targetEventId ? <p className="text-xs text-red-600">חובה למלא event id</p> : null}
            {targetEventId && !idValid ? (
              <p className="text-xs text-red-600">
                event id לא תקין. מותר אותיות באנגלית קטנה, מספרים, ומקפים בין מילים. אורך מקסימלי 24 תווים.
              </p>
            ) : null}
            {idWarnLong ? <p className="text-xs text-amber-700">טיפ, event id ארוך יקשה על כתובת הדומיין. מומלץ לקצר.</p> : null}
            {idValid ? (
              <p className="text-xs text-zinc-600">
                כתובת זמנית: <span className="font-mono">{`perry-b.vercel.app/${targetEventId}`}</span>
                <br />
                כתובת עתידית: <span className="font-mono">{`${targetEventId}.activebar.co.il`}</span>
              </p>
            ) : null}
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">
              שם תצוגה לאירוע
              <HelpTip text="זה שם שמופיע באתר ובמנהל, למשל עידו בר מצווה, שי והרן חתונה, טיול קוסמוי. זה לא משפיע על הכתובת." />
            </label>
            <Input value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="למשל שי והרן" />
            {!nameValid ? <p className="text-xs text-red-600">חובה למלא שם תצוגה</p> : null}
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">
              הערות, אופציונלי
              <HelpTip text="עוזר לך לזכור מה נוצר ולמה. לא מוצג לאורחים." />
            </label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={openConfirm} disabled={!canSubmit}>
              שכפל
            </Button>
          </div>
          {!canSubmit ? <p className="text-xs text-zinc-500">כדי לשכפל, בחר תבנית, מלא event id תקין, ומלא שם תצוגה.</p> : null}
        </div>
      </Card>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg" dir="rtl">
            <div className="text-right">
              <h4 className="font-semibold">אישור שכפול</h4>
              <p className="mt-1 text-sm text-zinc-600">בדוק את הפרטים לפני יצירה. אחרי יצירה אפשר לערוך דרך מנהל.</p>
            </div>

            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-zinc-500">תבנית</span>
                <span className="font-medium">{selected ? `${selected.name} (${selected.kind})` : templateId}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-zinc-500">event id</span>
                <span className="font-mono">{targetEventId}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-zinc-500">שם תצוגה</span>
                <span className="font-medium">{targetName.trim()}</span>
              </div>
              <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-700">
                <div className="font-semibold">מה יועתק</div>
                <div className="mt-1">בלוקים, הגדרות אירוע, גלריות, חוקי תוכן, ותוספות נוספות לפי התבנית.</div>
              </div>
            </div>

            <div className="mt-4 flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>
                חזור לעריכה
              </Button>
              <Button type="button" onClick={runClone} disabled={busy}>
                {busy ? 'מבצע שכפול...' : 'אשר שכפול'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-4 shadow-lg" dir="rtl">
            <div className="text-right">
              <h4 className="font-semibold text-red-700">מחיקת אירוע</h4>
              <p className="mt-1 text-sm text-zinc-600">
                פעולה זו מוחקת את כל נתוני האירוע מה־DB ואת כל קבצי ה־Storage תחת
                <span className="mx-1 font-mono" dir="ltr">
                  uploads/{eventId}/
                </span>
              </p>
            </div>

            {blockingTemplates.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-semibold">לא ניתן למחוק כרגע את האירוע</div>
                <div className="mt-1">יש template פעיל שתלוי באירוע הזה:</div>
                <ul className="mt-2 list-disc pr-5">
                  {blockingTemplates.map((t) => (
                    <li key={t.id}>
                      {t.name} ({t.kind})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <div className="rounded-xl bg-zinc-50 p-3 text-sm">
                <div>
                  event_id למחיקה:
                  <span className="mr-2 font-mono" dir="ltr">
                    {eventId}
                  </span>
                </div>
              </div>

              <div className="grid gap-1">
                <label className="text-xs text-zinc-500">הקלד את ה־event_id המדויק לאישור</label>
                <Input
                  value={deleteConfirmEventId}
                  onChange={(e) => setDeleteConfirmEventId(e.target.value)}
                  placeholder={eventId}
                  dir="ltr"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs text-zinc-500">סיסמת מחיקה</label>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="DELETE_EVENT_PASSWORD"
                  dir="ltr"
                />
              </div>

              <label className="text-sm flex items-center gap-2 flex-row-reverse justify-end text-right">
                <input
                  type="checkbox"
                  checked={deleteChecked}
                  onChange={(e) => setDeleteChecked(e.target.checked)}
                />
                אני מבין שהמחיקה תמחק גם DB וגם Storage של האירוע
              </label>
            </div>

            <div className="mt-5 flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDeleteOpen(false)
                  resetDeleteForm()
                }}
                disabled={deleteBusy}
              >
                ביטול
              </Button>

              <button
                type="button"
                onClick={runDelete}
                disabled={!canDelete}
                className="rounded-xl border border-red-200 bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteBusy ? 'מוחק...' : 'מחק אירוע'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Card>
        <h4 className="font-semibold">מה קורה אחרי השכפול</h4>
        <ol className="mt-2 list-decimal space-y-1 pr-5 text-sm text-zinc-700">
          <li>הנתונים משוכפלים בבסיס הנתונים ל event id החדש</li>
          <li>בשלב ראשון אפשר לפתוח את האתר בנתיב, למשל perry b vercel app wedding</li>
          <li>בהמשך אפשר לחבר סאב דומיין, למשל wedding activebar co il, בלי ליצור פרויקט נוסף</li>
        </ol>
      </Card>
    </div>
  )
}
