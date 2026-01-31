'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';

type Post = {
  id: string;
  media_url?: string | null;
  video_url?: string | null;
  created_at?: string;
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

export default function GalleryClient({ initialItems }: { initialItems: any[] }) {
  const [items, setItems] = useState<Post[]>(initialItems || []);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  const pickerRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);

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

        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error((upJson as any)?.error || 'שגיאה בהעלאה');

        const payload: any = {
          kind: 'gallery',
          author_name: null,
          text: null,
          media_path: (upJson as any).path,
          media_url: isVideoFile(f) ? null : (upJson as any).publicUrl,
          video_url: isVideoFile(f) ? (upJson as any).publicUrl : null,
          link_url: null,
        };

        const created = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const cJson = await created.json().catch(() => ({}));
        if (!created.ok) throw new Error((cJson as any)?.error || 'שגיאה ביצירת פוסט');

        if ((cJson as any)?.status === 'approved' && (cJson as any)?.post) {
          setItems(prev => [(cJson as any).post, ...prev]);
        }
      }
      setFiles([]);
    } catch (e: any) {
      setErr(e?.message || 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
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
              {/* share */}
              <Button variant="ghost" onClick={() => shareUrl(lightbox.url)} className="bg-white/90 text-black shadow hover:bg-white">
                שתף
              </Button>
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
