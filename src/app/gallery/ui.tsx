'use client'

import { useMemo, useRef, useState } from 'react'
import { Button, Card } from '@/components/ui'

type Post = {
  id: string
  media_url?: string | null
  video_url?: string | null
  created_at?: string
}

function isVideoFile(f: File) {
  return (f.type || '').startsWith('video/')
}

export default function GalleryClient({ initialItems }: { initialItems: any[] }) {
  const [items, setItems] = useState<Post[]>(initialItems || [])
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null)

  const pickerRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLInputElement | null>(null)

  const feed = useMemo(
    () => (items || []).filter(i => i.media_url || i.video_url),
    [items]
  )

  function addFiles(list: FileList | null) {
    const next = Array.from(list || [])
    if (!next.length) return
    setFiles(prev => [...prev, ...next])
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function uploadAll() {
    setErr(null)
    if (!files.length) {
      setErr('בחר תמונות/וידאו')
      return
    }
    setBusy(true)
    try {
      // מעלים אחד אחד (יותר יציב במובייל)
      for (const f of files) {
        const fd = new FormData()
        fd.set('file', f)
        fd.set('kind', 'gallery')

        const up = await fetch('/api/upload', { method: 'POST', body: fd })
        const upJson = await up.json().catch(() => ({}))
        if (!up.ok) throw new Error(upJson?.error || 'שגיאה בהעלאה')

        const payload: any = {
          kind: 'gallery',
          author_name: null,
          text: null,
          media_path: upJson.path,
          media_url: isVideoFile(f) ? null : upJson.publicUrl,
          video_url: isVideoFile(f) ? upJson.publicUrl : null,
          link_url: null
        }

        const created = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const cJson = await created.json().catch(() => ({}))
        if (!created.ok) throw new Error(cJson?.error || 'שגיאה ביצירת פוסט')

        // אם זה מאושר מיידית — נכניס לרשימה
        if (cJson?.status === 'approved' && cJson?.post) {
          setItems(prev => [cJson.post, ...prev])
        }
      }

      setFiles([])
    } catch (e: any) {
      setErr(e?.message || 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          {/* בוחר מהמכשיר */}
          <input
            ref={pickerRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={e => addFiles(e.target.files)}
          />

          {/* מצלמה (צילום תמונה) */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />

          {/* צילום וידאו */}
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" type="button" onClick={() => cameraRef.current?.click()}>
              📷 צלם
            </Button>
            <Button variant="ghost" type="button" onClick={() => videoRef.current?.click()}>
              🎥 וידאו
            </Button>
            <Button onClick={uploadAll} disabled={busy || files.length === 0}>
              {busy ? 'מעלה...' : `העלה ${files.length || ''}`}
            </Button>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((f, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => removeFile(idx)}
                className="rounded-xl border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                title="הסר"
              >
                {isVideoFile(f) ? '🎥' : '🖼️'} {f.name} ✕
              </button>
            ))}
          </div>
        )}

        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <p className="mt-2 text-xs text-zinc-500">טיפ: אם מוגדר אישור מנהל, התוכן יופיע אחרי אישור.</p>
      </Card>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <div className="mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
            {lightbox.type === 'video' ? (
              <video src={lightbox.url} controls className="w-full rounded-2xl bg-black" playsInline />
            ) : (
              <img src={lightbox.url} alt="" className="w-full rounded-2xl bg-white" />
            )}
            <div className="mt-3 text-center">
              <Button variant="ghost" onClick={() => setLightbox(null)} className="text-white hover:bg-white/10">סגור</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {feed.map((it) => {
          const isVideo = !!it.video_url && !it.media_url
          const url = (it.media_url || it.video_url) as string
          return (
            <button
              key={it.id}
              className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-50"
              onClick={() => setLightbox({ url, type: isVideo ? 'video' : 'image' })}
              type="button"
            >
              {isVideo ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl">▶️</span>
                </div>
              ) : (
                <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </button>
          )
        })}
      </div>

      {feed.length === 0 && (
        <Card>
          <p className="text-sm text-zinc-600">אין עדיין תמונות. העלו את הראשונה 📸</p>
        </Card>
      )}
    </div>
  )
}
