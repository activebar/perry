'use client'

import { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'

export default function GalleryClient({
  initialItems,
  readOnly,
}: {
  initialItems: any[]
  readOnly?: boolean
}) {
  const [items, setItems] = useState(initialItems)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const images = useMemo(() => items.filter(i => i.media_url), [items])

  async function upload() {
    if (readOnly) return

    setErr(null)
    if (!file) {
      setErr('בחר תמונה')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('kind', 'gallery')
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const upJson = await up.json()
      if (!up.ok) throw new Error(upJson?.error || 'Upload failed')

      const created = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'gallery',
          text: null,
          author_name: null,
          media_path: upJson.path,
          media_url: upJson.publicUrl,
        }),
      })
      const cJson = await created.json()
      if (!created.ok) throw new Error(cJson?.error || 'Create failed')

      if (cJson.status === 'approved') {
        setItems([cJson.post, ...items])
      }
      setFile(null)
    } catch (e: any) {
      setErr(e?.message || 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
            <Button onClick={upload} disabled={busy}>{busy ? 'מעלה...' : 'העלה תמונה'}</Button>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
          <p className="mt-2 text-xs text-zinc-500">טיפ: אם מוגדר אישור מנהל, התמונה תופיע אחרי אישור.</p>
        </Card>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <div className="mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
            <img src={lightbox} alt="" className="w-full rounded-2xl bg-white" />
            <div className="mt-3 text-center">
              <Button variant="ghost" onClick={() => setLightbox(null)} className="text-white hover:bg-white/10">סגור</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((it) => (
          <button
            key={it.id}
            className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-50"
            onClick={() => setLightbox(it.media_url)}
            type="button"
          >
            <img src={it.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {images.length === 0 && (
        <Card>
          <p className="text-sm text-zinc-600">אין עדיין תמונות. העלו את הראשונה 📸</p>
        </Card>
      )}
    </div>
  )
}
