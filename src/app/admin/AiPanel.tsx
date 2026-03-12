'use client'

import { useMemo, useState } from 'react'
import { Card, Button, Input, Textarea } from '@/components/ui'

type SettingsLike = Record<string, any>

export default function AiPanel(props: {
  settings: SettingsLike
  setSettings: (next: SettingsLike) => void
  onSave: () => Promise<void>
  saving: boolean
}) {
  const { settings, setSettings, onSave, saving } = props

  const enabled = Boolean(settings?.ai_blessing_enabled)
  const dailyLimit = useMemo(() => {
    const n = Number(settings?.ai_daily_limit)
    if (!Number.isFinite(n)) return 3
    return Math.max(0, Math.floor(n))
  }, [settings?.ai_daily_limit])

  const [tmpJson, setTmpJson] = useState<string>(() => {
    try {
      return JSON.stringify(settings?.ai_config ?? {}, null, 2)
    } catch {
      return '{}' 
    }
  })

  function applyJson() {
    try {
      const parsed = JSON.parse(tmpJson || '{}')
      setSettings({ ...settings, ai_config: parsed })
    } catch {
      // ignore, user will fix
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-right">
          <h3 className="font-semibold">הגדרות AI</h3>
          <p className="mt-1 text-sm text-zinc-600">
            כאן שולטים בהפעלת שיפור ברכה, מגבלת שימוש, וברירות מחדל לכתיבה.
          </p>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving ? 'שומר...' : 'שמור'}
        </Button>
      </div>

      <div className="mt-4 grid gap-4" dir="rtl">
        <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">הפעל AI בברכות</p>
              <p className="text-xs text-zinc-500">אם כבוי, לא יוצגו כפתורי שיפור ברכה לאורחים.</p>
            </div>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setSettings({ ...settings, ai_blessing_enabled: e.target.checked })}
              />
              <span className="text-sm">פעיל</span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">מגבלת בקשות יומית למכשיר</label>
            <Input
              value={String(dailyLimit)}
              onChange={(e) => setSettings({ ...settings, ai_daily_limit: e.target.value })}
              dir="ltr"
            />
          </div>
        </div>

        <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
          <p className="text-sm font-medium">הגדרות ברירת מחדל לכתיבה</p>
          <p className="text-xs text-zinc-500">
            הערכים כאן משמשים את השרת לבניית הפרומפט. אפשר להשאיר ריק ולהסתמך על מה שנשלח מהטופס.
          </p>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">טקסט פתיחה ברירת מחדל</label>
            <Input
              value={settings?.ai_default_seed_text || ''}
              onChange={(e) => setSettings({ ...settings, ai_default_seed_text: e.target.value })}
              placeholder="למשל, מזל טוב"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">שם החוגג או נושא האתר</label>
            <Input
              value={settings?.ai_subject_name || ''}
              onChange={(e) => setSettings({ ...settings, ai_subject_name: e.target.value })}
              placeholder="למשל עידו, או שי והרן, או קוסמוי"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-zinc-500">סוג האתר</label>
            <Input
              value={settings?.ai_site_kind || ''}
              onChange={(e) => setSettings({ ...settings, ai_site_kind: e.target.value })}
              placeholder="למשל בר מצווה, חתונה, טיול, ביקורת"
            />
          </div>
        </div>

        <div className="grid gap-2 rounded-xl border border-zinc-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">ai_config, מתקדם</p>
            <Button variant="ghost" type="button" onClick={applyJson}>החל JSON</Button>
          </div>
          <Textarea
            value={tmpJson}
            onChange={(e) => setTmpJson(e.target.value)}
            rows={10}
            dir="ltr"
          />
          <p className="text-xs text-zinc-500" dir="rtl">
            אם ה JSON לא תקין הוא לא יישמר. מומלץ להשאיר את זה לשלב הבא.
          </p>
        </div>
      </div>
    </Card>
  )
}
