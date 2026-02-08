'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import AdminApp from './ui'
import type { AdminMainTab } from './page'

type InnerTab = 'login' | 'settings' | 'blocks' | 'moderation' | 'ads' | 'admin_gallery' | 'diag' | 'permissions'

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
      { key: 'design', label: 'עיצוב ותוכן' },
      { key: 'permissions', label: 'הרשאות' }
    ] as const,
  []
)


  const subTabs = useMemo(() => {
    if (tab === 'event') {
      return [
        { key: 'general', label: 'הגדרות כלליות' },
        { key: 'hero', label: 'HERO' },
        { key: 'rotate', label: 'תמונות מתחלפות' },
        { key: 'footer', label: 'פוטר' }
      ] as const
    }
    if (tab === 'blessings') {
      return [
        { key: 'blessings', label: 'ברכות' },
        { key: 'content', label: 'ניהול תוכן' },
        { key: 'qr', label: 'QR & שיתוף' },
        { key: 'moderation', label: 'אישור תכנים' }
      ] as const
    }
    // גלריות – בהמשך: לכל גלריה תת-טאבים. כרגע נשאר מסך גלריה קיים.
    return [] as const
  }, [tab])

  const activeSub = useMemo(() => {
    const def = tab === 'event' ? 'general' : tab === 'blessings' ? 'blessings' : ''
    const allowed = new Set((subTabs as any[]).map(t => t.key))
    if (sub && allowed.has(sub)) return sub
    return def
  }, [tab, sub, subTabs])

  const initial = useMemo(() => {
    // מיפוי “טאב עליון” + תת-טאב → טאב פנימי ב-AdminApp
    let initialTab: InnerTab = 'settings'
    let pendingKind: 'blessing' | 'gallery' = 'blessing'
    let initialSettingsSub:
      | 'general'
      | 'hero'
      | 'rotate'
      | 'footer'
      | 'blessings'
      | 'content'
      | 'qr'
      | undefined

    if (tab === 'event') {
      initialTab = 'settings'
      pendingKind = 'blessing'
      initialSettingsSub = (activeSub as any) || 'general'
    } else if (tab === 'blessings') {
      pendingKind = 'blessing'
      if (activeSub === 'moderation') {
        initialTab = 'moderation'
      } else {
        initialTab = 'settings'
        initialSettingsSub = (activeSub as any) || 'blessings'
      }
    } else if (tab === 'galleries') {
      initialTab = 'admin_gallery'
      pendingKind = 'gallery'
    } else if (tab === 'design') {
      initialTab = 'blocks'
      pendingKind = 'blessing'
    } else if (tab === 'permissions') {
      initialTab = 'permissions'
      pendingKind = 'blessing'
    }

    return { initialTab, pendingKind, initialSettingsSub }
  }, [tab, activeSub])

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

      {subTabs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {subTabs.map(st => (
            <Link
              key={st.key}
              href={`/admin?tab=${tab}&sub=${st.key}`}
              className={classNames(
                'rounded-xl px-4 py-2 text-sm border',
                activeSub === st.key
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50'
              )}
            >
              {st.label}
            </Link>
          ))}
        </div>
      )}

      {/* דף המנהל המלא (הקיים) עם אתחול לפי הטאב העליון */}
      <div className="mt-4">
        <AdminApp
          key={`${tab}:${activeSub}`}
          initialTab={initial.initialTab}
          initialPendingKind={initial.pendingKind}
          initialSettingsSubTab={initial.initialSettingsSub}
          embeddedMode
        />
      </div>
    </div>
  )
}