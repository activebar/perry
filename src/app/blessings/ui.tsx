'use client'

import { useMemo, useState } from 'react'
import { Button, Card, Input, Textarea } from '@/components/ui'

type FeedItem =
  | { type: 'post'; item: any }
  | { type: 'ad'; item: any }

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

async function jfetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts?.headers || {}) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'Request failed')
  return json
}

export default function BlessingsClient({ initialFeed }: { initialFeed: FeedItem[] }) {
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed || [])
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const postsOnly = useMemo(
    () => feed.filter(x => x.type === 'post').map(x => (x as any).item),
    [feed]
  )

  async function submitBlessing() {
    setErr(null)
    if (!text.trim()) {
      setErr('נא לכתוב ברכה')
      return
    }

    setBusy(true)
    try {
      const created = await jfetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'blessing',
          author_name: author || null,
          text: text.trim(),
          media_path: null,
          media_url: null,
        }),
      })

      // אם require_approval מופעל -> לא נכניס לפיד ישר
      if (created.status === 'approved') {
        setFeed(prev => [{ type: 'post', item: created.post }, ...prev])
      }

      setAuthor('')
      setText('')
    } catch (e: any) {
      setErr(e?.message || 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function toggleReaction(postId: string, emoji: string) {
    try {
      const res = await jfetch('/api/reactions/toggle', {
        method: 'POST',
        body: JSON.stringify({ post_id: postId, emoji }),
      })

      setFeed(prev =>
        prev.map(x => {
          if (x.type !== 'post') return x
          if (x.item.id !== postId) return x
          return {
            type: 'post',
            item: {
              ...x.item,
              reaction_counts: res.counts,
              my_reactions: res.my,
            },
          }
        })
      )
    } catch {
      // לא מפילים UI על ריאקשן
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-semibold">כתיבת ברכה</h3>
        <div className="mt-3 grid gap-2">
          <Input placeholder="שם (לא חובה)" value={author} onChange={e => setAuthor(e.target.value)} />
          <Textarea placeholder="הברכה שלך..." rows={4} value={text} onChange={e => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={submitBlessing} disabled={busy}>
              {busy ? 'שולח...' : 'שלח ברכה'}
            </Button>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <p className="text-xs text-zinc-500">אם מוגדר “אישור מנהל” — הברכה תופיע אחרי אישור.</p>
        </div>
      </Card>

      <div className="grid gap-3">
        {feed.map((x, idx) => {
          if (x.type === 'ad') {
            const ad = x.item
            return (
              <Card key={`ad-${ad.id ?? idx}`}>
                <p className="text-xs text-zinc-500">פרסומת</p>
                <p className="mt-1 font-semibold">{ad.title}</p>
                {ad.body && <p className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap">{ad.body}</p>}
                {ad.link_url && (
                  <a className="mt-2 inline-block text-sm underline" href={ad.link_url} target="_blank" rel="noreferrer">
                    מעבר לקישור
                  </a>
                )}
              </Card>
            )
          }

          const p = x.item
          const counts = p.reaction_counts || { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
          const my = new Set<string>(p.my_reactions || [])

          return (
            <Card key={p.id}>
              <p className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleString('he-IL')}</p>
              {p.author_name && <p className="mt-1 text-sm font-semibold">{p.author_name}</p>}
              {p.text && <p className="mt-2 whitespace-pre-wrap text-sm">{p.text}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {EMOJIS.map(e => (
                  <Button
                    key={e}
                    variant={my.has(e) ? 'primary' : 'ghost'}
                    onClick={() => toggleReaction(p.id, e)}
                  >
                    {e} {counts[e] || 0}
                  </Button>
                ))}
              </div>
            </Card>
          )
        })}
      </div>

      {postsOnly.length === 0 && (
        <Card>
          <p className="text-sm text-zinc-600">אין עדיין ברכות. תכתבו את הראשונה ❤️</p>
        </Card>
      )}
    </div>
  )
}
