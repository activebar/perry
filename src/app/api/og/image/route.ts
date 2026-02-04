import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseServiceRole } from "@/lib/supabase";
import { fetchSettings } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OG_SIZE = 800;

// Hard fallback that should always exist (your known default image)
const DEFAULT_STORAGE_OG =
  "https://oqglyotlvtyewlcvmlcr.supabase.co/storage/v1/object/public/uploads/ido/og/default.jpg";

// In this codebase `supabaseServiceRole` is a factory function that returns a Supabase client.
const sb = supabaseServiceRole();

function extractUploadsPathFromPublicUrl(u: string) {
  // https://<project>.supabase.co/storage/v1/object/public/uploads/<path>
  const m = u.match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/);
  return m?.[1] || null;
}

function normalizeUrlMaybe(s: unknown): string | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  // We only accept absolute URLs here. (route fetches directly)
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

async function getFirstApprovedPostByPrefix(prefix: string) {
  const { data, error } = await sb
    .from("posts")
    .select("id, author_name, text, media_url, status, kind")
    .eq("kind", "blessing")
    .eq("status", "approved")
    .ilike("id", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getMediaItemByPrefix(prefix: string) {
  const { data, error } = await sb
    .from("media_items")
    .select("id, public_url, storage_path, mime_type, kind")
    .ilike("id", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchImageBuffer(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

async function toSquareJpeg(input: Buffer) {
  return await sharp(input)
    .rotate() // respect EXIF orientation
    .resize(OG_SIZE, OG_SIZE, { fit: "cover", position: "centre" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const defaultParam = url.searchParams.get("default"); // any truthy means "use default"
  const post = url.searchParams.get("post");
  const media = url.searchParams.get("media");
  const fallbackParam = url.searchParams.get("fallback");

  try {
    const settings = await fetchSettings();

    // settings fallbacks
    const settingsOg = normalizeUrlMaybe((settings as any)?.og_default_image_url);

    const heroImagesRaw = (settings as any)?.hero_images;
    const heroFirst =
      Array.isArray(heroImagesRaw) && typeof heroImagesRaw[0] === "string"
        ? normalizeUrlMaybe(heroImagesRaw[0])
        : null;

    const queryFallback = normalizeUrlMaybe(fallbackParam);

    // 1) Resolve the desired base image URL
    let imageUrl: string | null = null;

    // default
    if (defaultParam) {
      // Prefer DB setting, then hero image, then hard default
      imageUrl = settingsOg || heroFirst || DEFAULT_STORAGE_OG;
    }

    // blessing post
    if (!imageUrl && post) {
      const byUuid = /^[0-9a-f-]{36}$/i.test(post);
      if (byUuid) {
        const { data, error } = await sb
          .from("posts")
          .select("media_url, status, kind")
          .eq("id", post)
          .maybeSingle();

        if (error) throw error;

        if (data?.kind === "blessing" && data?.status === "approved") {
          imageUrl = normalizeUrlMaybe((data as any)?.media_url);
        }
      } else {
        const p = await getFirstApprovedPostByPrefix(post);
        imageUrl = normalizeUrlMaybe((p as any)?.media_url);
      }
    }

    // gallery media item
    if (!imageUrl && media) {
      const byUuid = /^[0-9a-f-]{36}$/i.test(media);
      const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
      const bucket = "uploads";

      const toPublic = (storagePath: string) =>
        supabaseUrl
          ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`
          : "";

      if (byUuid) {
        // Support both media_items.id (preferred) and legacy links that pass media_items.post_id
        const { data, error } = await sb
          .from("media_items")
          .select("public_url, storage_path, mime_type, id, post_id")
          .or(`id.eq.${media},post_id.eq.${media}`)
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          const pu = normalizeUrlMaybe((data as any).public_url);
          const sp = String((data as any).storage_path || "").trim();
          imageUrl = pu || (sp ? normalizeUrlMaybe(toPublic(sp)) : null);
        }
      } else {
        const m = await getMediaItemByPrefix(media);
        const pu = normalizeUrlMaybe((m as any)?.public_url);
        const sp = String((m as any)?.storage_path || "").trim();
        imageUrl = pu || (sp ? normalizeUrlMaybe(toPublic(sp)) : null);
      }
    }

    // fallback parameter (usually hero image)
    if (!imageUrl && queryFallback) {
      imageUrl = queryFallback;
    }

    // final fallback chain (never fail)
    if (!imageUrl) {
      imageUrl = settingsOg || heroFirst || DEFAULT_STORAGE_OG;
    }

    if (!imageUrl) {
      // Should never happen now, but keep safe guard
      return new NextResponse("Missing OG image source", { status: 404 });
    }

    // 2) If the URL points to Supabase public uploads, stream via service-role.
    const uploadsPath = extractUploadsPathFromPublicUrl(imageUrl);

    let buf: Buffer;
    if (uploadsPath) {
      const { data, error } = await sb.storage.from("uploads").download(uploadsPath);
      if (error) throw error;
      buf = Buffer.from(await data.arrayBuffer());
    } else {
      buf = await fetchImageBuffer(imageUrl);
    }

    // 3) Normalize to WhatsApp-friendly square
    const out = await toSquareJpeg(buf);
    const body = new Uint8Array(out);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return new NextResponse(`OG error: ${msg}`, { status: 500 });
  }
}
