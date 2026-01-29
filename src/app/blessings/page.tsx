import Link from 'next/link'
import { cookies } from 'next/headers'
import { Container, Card, Button } from '@/components/ui'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'
import BlessingsClient from './ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getFeed() {
  const sb = supabaseAnon()
  const { data: posts, error } = await sb
    .from('posts')
    .select('*')
    .eq('kind', 'blessing')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw error

  const items = posts || []
  if (!items.length) return []

  const ids = items.map((p: any) => p.id)
  const device_id = cookies().get('device_id')?.value || null

  // reactions: counts + my reactions
  const srv = supabaseServiceRole()
  const { data: rRows, error: rErr } = await srv
    .from('reactions')
    .select('post_id, emoji, device_id')
    .in('post_id', ids)

  if (rErr) {
    // fallback: no reactions
    return items.map((p: any) => ({
      ...p,
      reaction_counts: { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
      my_reactions: []
    }))
  }

  const countsByPost: Record<string, Record<string, number>> = {}
  const myByPost: Record<string, Set<string>> = {}

  for (const r of rRows || []) {
    const pid = (r as any).post_id
    const emo = (r as any).emoji
    countsByPost[pid] ||= { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
    countsByPost[pid][emo] = (countsByPost[pid][emo] || 0) + 1

    if (device_id && (r as any).device_id === device_id) {
      myByPost[pid] ||= new Set()
      myByPost[pid].add(emo)
    }
  }

  return items.map((p: any) => ({
    ...p,
    reaction_counts: countsByPost[p.id] || { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
    my_reactions: Array.from(myByPost[p.id] || [])
  }))
}

export default async function BlessingsPage() {
  const [feed, settings] = await Promise.all([getFeed(), fetchSettings()])

  return (
    <main>
      <Container>
        {/* ניווט עליון */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/"><Button variant="ghost">← חזרה לדף הבית</Button></Link>

            <div className="flex flex-wrap gap-2">
              <Link href="/"><Button variant="ghost">בית</Button></Link>
              <Link href="/gallery"><Button variant="ghost">גלריה</Button></Link>
              <Link href="/blessings"><Button>ברכות</Button></Link>
              {settings.gift_enabled && (
                <Link href="/gift"><Button variant="ghost">מתנה</Button></Link>
              )}
            </div>
          </div>
        </Card>

        <Card className="mt-4">
          <h2 className="text-xl font-bold">ברכות</h2>
          <p className="text-sm text-zinc-600">כתבו ברכה, צרפו תמונה, ותנו ריאקשן.</p>
        </Card>

        <div className="mt-4">
          <BlessingsClient initialFeed={feed} />
        </div>
      </Container>
    </main>
  )
}
