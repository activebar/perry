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
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
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
      setErr(e?.message || 'שגיאה בטעינת תבניות')
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
      setErr(e?.message || 'שגיאה בשמירה כתבנית')
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
    try {
      const json = await jfetch('/api/admin/clone-event', {
        method: 'POST',
        body: JSON.stringify({
          source_event_id: eventId,
          template_id: templateId,
          target_event_id: targetEventId,
          target_event_name: targetName.trim(),
          notes: notes.trim() || null
        })
      })
      setOk(json?.message || 'בוצע')
      setConfirmOpen(false)
      setTargetEventIdRaw('')
      setTargetName('')
      setNotes('')
      await refresh()
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בשכפול')
    } finally {
      setBusy(false)
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
      setErr('לא ניתן למחוק אירוע שמשמש כתבנית פעילה')
      return
    }

    if (deleteConfirmEventId.trim() !== eventId) {
      setErr('יש להקליד את ה-event_id המדויק לאישור')
      return
    }

    if (!deletePassword.trim()) {
      setErr('יש להקליד סיסמת מחיקה')
      return
    }

    if (!deleteChecked) {
      setErr('יש לאשר שהמחיקה תמחק גם DB וגם Storage')
      return
    }

    setDeleteBusy(true)
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

      setOk(json?.message || `האירוע "${eventId}" נמחק בהצלחה`)
      setDeleteOpen(false)
      resetDeleteForm()
      await refresh()
    } catch (e: any) {
      setErr(e?.message || 'שגיאה במחיקת האירוע')
    } finally {
      setDeleteBusy(false)
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
