'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';

type Post = {
  id: string;
  media_url?: string | null;
  video_url?: string | null;
  created_at?: string;
  status?: string | null;
  media_path?: string | null;
  can_edit?: boolean;
  can_delete?: boolean;
  editable_until?: string | null;
};

function isVideoFile(f: File) {
  return (f.type || '').startsWith('video/');
}

async function downloadUrl(url: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const fileName = (url.split('/').pop() || 'media').split('?')[0] || 'media';
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }


}

async function shareUrl(url: string) {
  const clean = String(url || '').trim();
  if (!clean) return;
  try {
    // Prefer native share on mobile
    if ((navigator as any).share) {
      await (navigator as any).share({ url: clean });
      return;
    }
  } catch {}
  try {
    await navigator.clipboard.writeText(clean);
    alert('הקישור הועתק ✅');
  } catch {
    window.open(clean, '_blank', 'noopener,noreferrer');
  }
}

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as any)?.error || 'error')
  return json
}

function friendlyError(msg: string) {
  if (!msg) return 'שגיאה'
  if (msg.includes('רק בשעה הראשונה')) return 'חלפה שעה — אי אפשר לערוך/למחוק יותר.'
  if (msg.includes('forbidden')) return 'אין הרשאה (רק מהמכשיר ששלח, לשעה).'
  return msg
}

export default function GalleryClient({
  initialItems,
  galleryId,
  uploadEnabled,
}: {
  initialItems: any[]
  galleryId: string
  uploadEnabled: boolean
}) {
  const [items, setItems] = useState<Post[]>(initialItems || []);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ id: string; url: string; type: 'image' | 'video'; post?: Post } | null>(null);

  const pickerRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);

  // refresh feed occasionally (also brings my pending items + edit window flags)
  useEffect(() => {
    let cancelled = false
    async function pull() {
      try {
        const res = await fetch(`/api/gallery/feed?gallery_id=${encodeURIComponent(galleryId)}&ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json().catch(() => ({}))
        if (!cancelled && Array.isArray((j as any).items)) setItems((j as any).items)
      } catch {
        // ignore
      }
    }
    pull()
    const t = setInterval(pull, 15000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [galleryId])

  const feed = useMemo(() => (items || []).filter(i => i.media_url || i.video_url), [items]);

  function addFiles(list: FileList | null) {
    const next = Array.from(list || []);
    if (!next.length) return;
    setFiles(prev => [...prev, ...next]);
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function uploadAll() {
    setErr(null);
    if (!uploadEnabled) {
      setErr('העלאה לגלריה זו אינה זמינה.')
      return
    }
    if (!files.length) {
      setErr('בחר תמונות/וידאו');
      return;
    }
    setBusy(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.set('file', f);
        fd.set('kind', 'gallery');
        fd.set('gallery_id', galleryId);

        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error((upJson as any)?.error || 'שגיאה בהעלאה');

        const payload: any = {
          kind: 'gallery',
          gallery_id: galleryId,
          author_name: null,
          text: null,
          media_path: (upJson as any).path,
          media_url: isVideoFile(f) ? null : (upJson as any).publicUrl,
          video_url: isVideoFile(f) ? (upJson as any).publicUrl : null,
          link_url: null,
        };

        const cJson = await jfetch('/api/posts', { method: 'POST', body: JSON.stringify(payload) })
        if (cJson?.post) setItems(prev => [cJson.post as any, ...prev])
      }
      setFiles([]);
    } catch (e: any) {
      setErr(friendlyError(String(e?.message || 'שגיאה')));
    } finally {
      setBusy(false);
    }
  }

  async function deleteMine(postId: string) {
    setErr(null)
    setBusy(true)
    try {
      await jfetch('/api/posts', { method: 'DELETE', body: JSON.stringify({ id: postId }) })
      setItems(prev => prev.filter(p => p.id !== postId))
      setLightbox(null)
    } catch (e: any) {
      setErr(friendlyError(String(e?.message || 'שגיאה')))
    } finally {
      setBusy(false)
    }
  }

  async function replaceMine(postId: string, file: File) {
    setErr(null)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('kind', 'gallery')
      fd.set('gallery_id', galleryId)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const upJson = await up.json().catch(() => ({}))
      if (!up.ok) throw new Error((upJson as any)?.error || 'שגיאה בהעלאה')

      const isVid = isVideoFile(file)
      const patch = {
        id: postId,
        media_path: (upJson as any).path,
        media_url: isVid ? null : (upJson as any).publicUrl,
        video_url: isVid ? (upJson as any).publicUrl : null,
      }
      const j = await jfetch('/api/posts', { method: 'PUT', body: JSON.stringify(patch) })
      if (j?.post) {
        setItems(prev => prev.map(p => (p.id === postId ? { ...(p as any), ...(j.post as any) } : p)))
        const url = (j.post.media_url || j.post.video_url) as string
        setLightbox({ id: postId, url, type: j.post.video_url ? 'video' : 'image', post: j.post })
      }
    } catch (e: any) {
      setErr(friendlyError(String(e?.message || 'שגיאה')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        {uploadEnabled ? (
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <input
              ref={pickerRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={e => addFiles(e.target.files)}
            />

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />

          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => cameraRef.current?.click()}>
                צלם תמונה
              </Button>
              <Button type="button" variant="ghost" onClick={() => videoRef.current?.click()}>
                צלם וידאו
              </Button>
              <Button type="button" onClick={uploadAll} disabled={busy || files.length === 0}>
                {busy ? 'מעלה…' : 'העלה'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-600">
            העלאה לגלריה זו סגורה. ניתן לצפות ולהוריד תמונות בלבד.
          </div>
        )}

        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((f, idx) => (
              <button
                key={idx}
                type="button"
                className="rounded-xl border px-3 py-1 text-sm"
                onClick={() => removeFile(idx)}
                title="הסר"
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </Card>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" dir="rtl">
          <div className="w-full max-w-3xl">
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" onClick={() => setLightbox(null)} className="bg-white/90 text-black shadow hover:bg-white">
                סגור
              </Button>
              {/* replace input */}
              <input
                ref={replaceRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  e.currentTarget.value = ''
                  if (!f || !lightbox) return
                  replaceMine(lightbox.id, f)
                }}
              />

              {/* share */}
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!lightbox) return
                  try {
                    const origin = window.location.origin
                    const code = String(lightbox.id).slice(0, 8)
                    const targetPath = `/gallery/p/${lightbox.id}`
                    await fetch('/api/short-links', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ kind: 'gl', post_id: lightbox.id, code, target_path: targetPath }),
                    })
                    const shortUrl = `${origin}/gl/${code}`
                    await shareUrl(shortUrl)
                  } catch {
                    await shareUrl(lightbox.url)
                  }
                }}
                className="bg-white/90 text-black shadow hover:bg-white"
              >
                שתף
              </Button>

              {lightbox.post?.status === 'pending' && (
                <span className="rounded-full bg-yellow-200 px-3 py-1 text-xs text-yellow-900">ממתין לאישור</span>
              )}

              {lightbox.post?.can_delete && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => replaceRef.current?.click()}
                    className="bg-white/90 text-black shadow hover:bg-white"
                    disabled={busy}
                  >
                    החלף
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => deleteMine(lightbox.id)}
                    className="bg-white/90 text-black shadow hover:bg-white"
                    disabled={busy}
                  >
                    מחק
                  </Button>
                </>
              )}
              {lightbox.type === 'image' && (
                <Button
                  variant="ghost"
                  onClick={() => downloadUrl(lightbox.url)}
                  className="bg-white/90 text-black shadow hover:bg-white"
                >
                  הורד תמונה
                </Button>
              )}
            </div>

            {lightbox.type === 'video' ? (
              <video src={lightbox.url} controls playsInline className="w-full rounded-2xl bg-black" />
            ) : (
              <img src={lightbox.url} alt="" className="w-full rounded-2xl bg-white" />
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {feed.map(it => {
          const isVideo = !!it.video_url && !it.media_url;
          const url = (it.media_url || it.video_url) as string;
          return (
            <button
              key={it.id}
              className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-50"
              onClick={() => setLightbox({ id: it.id, url, type: isVideo ? 'video' : 'image', post: it })}
              type="button"
            >
              {it.status === 'pending' && (
                <span className="absolute left-2 top-2 rounded-full bg-yellow-200 px-2 py-1 text-[11px] text-yellow-900 shadow">
                  ממתין
                </span>
              )}
              {isVideo ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl">▶️</span>
                </div>
              ) : (
                <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </button>
          );
        })}
      </div>

      {feed.length === 0 && (
        <Card>
          <p className="text-sm text-zinc-600">אין עדיין תמונות. העלו את הראשונה 📸</p>
        </Card>
      )}
    </div>
  );
}
