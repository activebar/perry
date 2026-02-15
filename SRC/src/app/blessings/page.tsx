import Link from "next/link";
import { cookies } from "next/headers";
import { Container, Card, Button } from "@/components/ui";
import { supabaseServiceRole } from "@/lib/supabase";
import { fetchBlocks, fetchSettings, getBlockTitle } from "@/lib/db";
import BlessingsClient from "./ui";
import BlessingsShareHeader from "./BlessingsShareHeader";
import type { Metadata } from "next";
import { getSiteUrl, toAbsoluteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchSettings();
  const eventName = (settings as any)?.event_name || "Event";
  const title = `${eventName} – ברכות`;

  const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : [];
  const imageUrlRaw =
    (settings as any)?.og_default_image_url || (typeof heroImages[0] === "string" ? heroImages[0] : undefined);

  // Always use an absolute OG image URL (best effort). If the image is in Supabase private storage,
  // the proxy route will still serve it on our domain.
  const v = encodeURIComponent(String((settings as any)?.updated_at || Date.now()));
  const ogImage = toAbsoluteUrl(`/api/og/image?default=1&fallback=${encodeURIComponent(String(imageUrlRaw || ''))}&v=${v}`);

  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description: `${eventName} – עמוד הברכות` ,
    openGraph: {
      title,
      description: `${eventName} – עמוד הברכות`,
      images: ogImage ? [{ url: ogImage, width: 800, height: 800, alt: title, type: 'image/jpeg' }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description: `${eventName} – עמוד הברכות`,
      images: ogImage ? [{ url: ogImage, width: 800, height: 800, alt: title }] : undefined,
    },
  };
}

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

  const blessingsTitle = getBlockTitle(blocks as any, 'blessings', (settings as any)?.blessings_title || 'ברכות');
  const galleryTitle = getBlockTitle(blocks as any, 'gallery', 'גלריה');
  const giftTitle = getBlockTitle(blocks as any, 'gift', 'מתנה');
  // subtitle in /blessings is controlled by blessings_label (falls back to blessings_subtitle)
  const blessingsSubtitle = (settings as any)?.blessings_label || (settings as any)?.blessings_subtitle || 'כתבו ברכה, צרפו תמונה, ותנו ריאקשן.';


  return (
    <main>
      <Container>
{/* במקום Card className */}
        <div className="mt-4">
          <Card dir="rtl">
            <div className="text-right">
              <h2 className="text-xl font-bold">{blessingsTitle}</h2>
              <p className="text-sm text-zinc-600">{blessingsSubtitle}</p>
              <BlessingsShareHeader settings={settings} />
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
