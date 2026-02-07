'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import AdminApp from './ui'
import type { AdminMainTab } from './page'

type InnerTab = 'login' | 'settings' | 'blocks' | 'moderation' | 'ads' | 'admin_gallery' | 'diag'

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

export default function AdminDashboard({ tab }: { tab: AdminMainTab }) {
  const tabs = useMemo(
    () =>
      [
        { key: 'event', label: 'אירוע' },
        { key: 'blessings', label: 'ברכות' },
        { key: 'galleries', label: 'גלריות' },
        { key: 'design', label: 'עיצוב ותוכן' }
      ] as const,
    []
  )

  const initial = useMemo(() => {
    // מיפוי “טאב עליון” לטאב הפנימי הקיים ב-AdminApp
    // (כדי להחזיר את דף המנהל המלא, בלי לשבור דברים קיימים)
    let initialTab: InnerTab = 'settings'
    let pendingKind: 'blessing' | 'gallery' = 'blessing'

    if (tab === 'event') {
      initialTab = 'settings'
      pendingKind = 'blessing'
    } else if (tab === 'blessings') {
      initialTab = 'moderation'
      pendingKind = 'blessing'
    } else if (tab === 'galleries') {
      // שלד “גלריות” – מתחילים מגלריית מנהל (קיים), ומאישור תכנים לגלריה
      initialTab = 'admin_gallery'
      pendingKind = 'gallery'
    } else if (tab === 'design') {
      initialTab = 'blocks'
      pendingKind = 'blessing'
    }

    return { initialTab, pendingKind }
  }, [tab])

  return (
    <div>
      {/* טאבים עליונים */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            className={classNames(
              'rounded-xl px-4 py-2 text-sm border',
              tab === t.key
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50'
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* שלד קצר לטאב גלריות */}
      {tab === 'galleries' ? (
        <div className="mt-4 rounded-2xl border bg-white p-4">
          <div className="font-semibold">שלד טאב גלריות</div>
          <div className="mt-1 text-sm text-zinc-600">
            כרגע: גלריית מנהל + אישור תכנים לגלריה (קיים במערכת).
            השלב הבא: ריבוי גלריות + שכפול בין אירועים (לפי event_id).
          </div>
          <ul className="mt-3 list-disc pr-5 text-sm text-zinc-700">
            <li>יצירת גלריה חדשה</li>
            <li>הוספה/סידור פריטים (תמונה/וידאו)</li>
            <li>שכפול גלריה מאירוע אחר</li>
            <li>RLS לפי event_id + הרשאות מנהל</li>
          </ul>
        </div>
      ) : null}

      {/* דף המנהל המלא (הקיים) עם אתחול לפי הטאב העליון */}
      <div className="mt-4">
        <AdminApp
          key={tab}
          initialTab={initial.initialTab}
          initialPendingKind={initial.pendingKind}
        />
      </div>
    </div>
  )
}
