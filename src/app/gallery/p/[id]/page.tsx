import Link from "next/link";
import type { Metadata } from "next";

import { Button, Card, Container } from "@/components/ui";
import { fetchSettings } from "@/lib/db";
import { supabaseServiceRole } from "@/lib/supabase";
import { getSiteUrl, toAbsoluteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MediaRow = {
  id: string;
  public_url: string | null;
  mime_type: string | null;
  kind: string | null;
};

async function getMediaItem(id: string): Promise<MediaRow | null> {
  const sb = supabaseServiceRole();
  const { data, error } = await sb
    .from('media_items')
    .select('id, public_url, mime_type, kind')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data as MediaRow;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const settings = await fetchSettings();
  const site = getSiteUrl();

  const eventName = String((settings as any)?.event_name || '');
  const metaDescription = String((settings as any)?.meta_description || '').trim();

  const heroImages = Array.isArray((settings as any)?.hero_images)
    ? (settings as any).hero_images
    : [];
  // Always keep as a concrete string to avoid `string | undefined` leaking into helpers.
  const fallback: string = String(
    (settings as any)?.og_default_image_url ||
      (typeof heroImages?.[0] === 'string' ? heroImages[0] : '') ||
      ''
  );

  const fallbackAbs = toAbsoluteUrl(fallback) || '';
  const og = `${site}/api/og/image?media=${encodeURIComponent(params.id)}&v=1${fallbackAbs ? `&fallback=${encodeURIComponent(fallbackAbs)}` : ''}`;

  const title = eventName ? `${eventName} – גלריה` : 'גלריה';
  const description = metaDescription || '';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: og,
          width: 800,
          height: 800,
          type: 'image/jpeg',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [og],
    },
  };
}

export default async function Page({ params }: { params: { id: string } }) {
  const settings = await fetchSettings();
  const item = await getMediaItem(params.id);

  if (!item) {
    return (
      <Container>
        <Card className="p-6 text-right">
          <div className="text-xl font-semibold">הפריט לא נמצא</div>
          <div className="mt-4">
            <Link href="/gallery">
              <Button>חזרה לגלריה</Button>
            </Link>
          </div>
        </Card>
      </Container>
    );
  }

  const url = item.public_url || '';
  const isVid = !!item.mime_type && item.mime_type.startsWith('video/');

  return (
    <Container>
      <Card className="p-6 text-right">
        <div className="text-2xl font-bold">גלריה לאירוע {String((settings as any)?.event_name || '')}</div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
          {isVid ? (
            <video src={url} controls className="w-full h-auto" />
          ) : (
            <img src={url} alt="" className="w-full h-auto object-cover" />
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Link href="/gallery">
            <Button>חזרה לגלריה</Button>
          </Link>
        </div>
      </Card>
    </Container>
  );
}
