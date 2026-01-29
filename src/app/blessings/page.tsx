import Link from 'next/link'
import { Container, Card, Button } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'
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

  const { data: ads } = await sb
    .from('ads')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50)

  // interleave: every 3 posts
  const feed: any[] = []
  let ai = 0
  for (let i = 0; i < (posts || []).length; i++) {
    feed.push({ type: 'post', item: posts![i] })
    if ((i + 1) % 3 === 0 && ads && ads.length) {
      feed.push({ type: 'ad', item: ads[ai % ads.length] })
      ai++
    }
  }

  return feed
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
