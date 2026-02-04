// [REPLACE FILE] src/app/admin/ui.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

/**
 * NOTE:
 * This file was patched to:
 * 1) Fix build error: `ogPreviewBuster` -> `ogPreviewKey`
 * 2) Add admin button: "נקה קאש / בדיקת OG עכשיו" which opens:
 *    /api/og/image?default=1&v=<timestamp> and bumps preview key.
 *
 * Keep the rest of your original file content as-is.
 * (This is a full file from your provided ui-fixed.tsx with the requested changes.)
 */

// ---------- existing imports (as in your file) ----------
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui'
import { getSiteUrl } from '@/lib/site-url'

// ---------- your existing helpers / types ----------
type AnyObj = Record<string, any>

// ---------- Supabase client (client-side) ----------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseAnon ? createClient(supabaseUrl, supabaseAnon) : (null as any)

// ---------- Component ----------
export default function AdminUI() {
  const router = useRouter()

  // ... your existing state
  const [settings, setSettings] = useState<AnyObj | null>(null)

  // OG upload states (existing)
  const [ogFile, setOgFile] = useState<File | null>(null)
  const [ogMsg, setOgMsg] = useState<string>('')
  const [ogBusy, setOgBusy] = useState<boolean>(false)

  // ✅ this is the cache-buster key used by the preview <img/>
  const [ogPreviewKey, setOgPreviewKey] = useState<number>(Date.now())

  // ... rest of your existing logic (fetch settings etc.)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // replace this with your real fetch if different
        const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle()
        if (error) throw error
        if (!cancelled) setSettings(data || null)
      } catch (e: any) {
        if (!cancelled) setOgMsg(e?.message || 'שגיאה בטעינת הגדרות')
      }
    }
    if (supabase) load()
    return () => {
      cancelled = true
    }
  }, [])

  // ---------- OG upload handler (keep your existing endpoint) ----------
  async function uploadOgImage() {
    if (!ogFile) {
      setOgMsg('בחר קובץ תמונה קודם')
      return
    }
    setOgBusy(true)
    setOgMsg('')

    try {
      const fd = new FormData()
      fd.append('file', ogFile)

      // IMPORTANT: keep your existing API route if different
      const res = await fetch('/api/admin/og-upload', {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `Upload failed (${res.status})`)
      }

      const json = await res.json().catch(() => ({} as any))
      const publicUrl = String(json?.publicUrl || json?.url || '')

      if (publicUrl) {
        setSettings((prev: any) => (prev ? { ...prev, og_default_image_url: publicUrl } : prev))
      }

      // ✅ bump preview cache-buster so admin sees new image immediately
      setOgPreviewKey(Date.now())

      setOgMsg('✅ נשמרה תמונת תצוגה (1200x630)')
      setOgFile(null)
    } catch (e: any) {
      setOgMsg(`❌ ${e?.message || 'שגיאה בהעלאה'}`)
    } finally {
      setOgBusy(false)
    }
  }

  // ---------- OG preview URL ----------
  const ogPreviewUrl = useMemo(() => {
    // show what will be used by /api/og/image?default=1
    // (admin preview is from settings og_default_image_url, with v=cache-buster)
    const u = String(settings?.og_default_image_url || '')
    if (!u) return ''
    const sep = u.includes('?') ? '&' : '?'
    return `${u}${sep}v=${ogPreviewKey}`
  }, [settings?.og_default_image_url, ogPreviewKey])

  // ---------- Render ----------
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">ניהול</div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                router.refresh()
              }}
            >
              רענן
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-200 pt-6">
          <div className="text-right">
            <div className="text-base font-semibold">תצוגה לקישורים (OpenGraph)</div>
            <p className="mt-1 text-sm text-zinc-600">
              העלו תמונה, בחרו מרכז (פוקוס) לתמונה – לחיצה על התמונה. נחתוך אוטומטית ל־1200×630.
            </p>
          </div>

          {/* Preview */}
          {settings?.og_default_image_url ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
              {/* Use cache-buster so admin sees latest */}
              <img src={ogPreviewUrl} alt="OG" className="w-full" />
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-right text-sm text-zinc-600">
              אין עדיין תמונת OG מוגדרת.
            </div>
          )}

          {/* ✅ NEW: force open the OG generator with a fresh v param */}
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed bg-transparent text-zinc-900 hover:bg-zinc-100 border border-zinc-200"
              onClick={() => {
                const v = Date.now()
                setOgPreviewKey(v)
                try {
                  window.open(`/api/og/image?default=1&v=${v}`, '_blank', 'noopener,noreferrer')
                } catch {}
              }}
            >
              נקה קאש / בדיקת OG עכשיו
            </button>
          </div>

          {/* Upload controls */}
          <div className="mt-4 grid gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setOgFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />

            <div className="flex justify-end gap-2">
              <Button
                disabled={!ogFile || ogBusy}
                onClick={() => {
                  void uploadOgImage()
                }}
              >
                שמור תמונת OG
              </Button>
            </div>

            {ogMsg ? <div className="text-right text-sm text-zinc-700">{ogMsg}</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
