import Link from "next/link";
import { cookies } from "next/headers";
import { Container, Card, Button } from "@/components/ui";
import { supabaseServiceRole } from "@/lib/supabase";
import { fetchBlocks, fetchSettings } from "@/lib/db";
import BlessingsClient from "./ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getFeed() {
  const device_id = cookies().get("device_id")?.value || null;
  const srv = supabaseServiceRole();

  const { data: posts, error } = await srv
    .from("posts")
    .select(
      "id, created_at, author_name, text, media_url, media_path, video_url, link_url, status, device_id"
    )
    .eq("kind", "blessing")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const items = posts || [];
  if (!items.length) return [];

  const ids = items.map((p: any) => p.id);

  const { data: rRows, error: rErr } = await srv
    .from("reactions")
    .select("post_id, emoji, device_id")
    .in("post_id", ids);

  const countsByPost: Record<string, Record<string, number>> = {};
  const myByPost: Record<string, Set<string>> = {};

  if (!rErr) {
    for (const r of rRows || []) {
      const pid = (r as any).post_id;
      const emo = (r as any).emoji;

      countsByPost[pid] ||= { "👍": 0, "😍": 0, "🔥": 0, "🙏": 0 };
      countsByPost[pid][emo] = (countsByPost[pid][emo] || 0) + 1;

      if (device_id && (r as any).device_id === device_id) {
        myByPost[pid] ||= new Set();
        myByPost[pid].add(emo);
      }
    }
  }

  return items.map((p: any) => {
    const createdMs = p.created_at ? new Date(p.created_at).getTime() : 0;
    const canMine = !!(
      device_id &&
      p.device_id &&
      p.device_id === device_id &&
      createdMs &&
      Date.now() - createdMs < 60 * 60 * 1000
    );

    return {
      id: p.id,
      created_at: p.created_at,
      author_name: p.author_name,
      text: p.text,
      media_url: p.media_url,
      video_url: p.video_url,
      link_url: p.link_url,
      status: p.status,

      editable_until: createdMs
        ? new Date(createdMs + 60 * 60 * 1000).toISOString()
        : null,
      can_delete: canMine,
      can_edit: canMine,

      reaction_counts:
        countsByPost[p.id] || { "👍": 0, "😍": 0, "🔥": 0, "🙏": 0 },
      my_reactions: Array.from(myByPost[p.id] || []),
    };
  });
}

export default async function BlessingsPage() {
  const [feed, settings, blocks] = await Promise.all([
    getFeed(),
    fetchSettings(),
    fetchBlocks(),
  ]);

  const blessingsLabel = (settings as any)?.blessings_label || (settings as any)?.blessings_title || 'ברכות';
  const blessingsSubtitle = (settings as any)?.blessings_subtitle || 'כתבו ברכה, צרפו תמונה, ותנו ריאקשן.';

  return (
    <main>
      <Container>
        {/* ניווט עליון */}
        <Card dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-2" dir="rtl">
            <Link href="/">
              <Button variant="ghost">← חזרה לדף הבית</Button>
            </Link>

            <div className="flex flex-wrap gap-2">
              <Link href="/">
                <Button variant="ghost">בית</Button>
              </Link>
              <Link href="/gallery">
                <Button variant="ghost">גלריה</Button>
              </Link>
              <Link href="/blessings">
                <Button>{blessingsLabel}</Button>
              </Link>
              {settings.gift_enabled && (
                <Link href="/gift">
                  <Button variant="ghost">מתנה</Button>
                </Link>
              )}
            </div>
          </div>
        </Card>

        {/* במקום Card className */}
        <div className="mt-4">
          <Card dir="rtl">
            <div className="text-right">
              <h2 className="text-xl font-bold">{blessingsLabel}</h2>
              <p className="text-sm text-zinc-600">{blessingsSubtitle}</p>
            </div>
          </Card>
        </div>

        <div className="mt-4">
          <BlessingsClient initialFeed={feed} settings={settings} blocks={blocks} showHeader={false} />
        </div>
      </Container>
    </main>
  );
}
