// app/api/unfurl/route.ts
// Link preview (oEmbed / OpenGraph) with basic SSRF protections.
// Supports: Facebook, Instagram, TikTok + generic OpenGraph.
//
// ENV:
//   META_OEMBED_ACCESS_TOKEN = "<APP_ID>|<APP_SECRET>"  (or a valid Meta access token)
// Notes:
// - Facebook thumbnails often come back HTML-escaped (&amp; / &#x200f;). We decode entities.
// - Instagram oEmbed needs the instagram_oembed endpoint (not the FB oembed_post endpoint).

import { NextResponse } from "next/server";
import net from "net";
import { Buffer } from "buffer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UnfurlData = {
  url: string;
  title: string;
  description: string;
  image: string;
  site_name: string;
};

function safeHostname(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}

function minimalData(finalUrl: string): UnfurlData {
  return {
    url: finalUrl,
    title: safeHostname(finalUrl) || finalUrl,
    description: "",
    image: "",
    site_name: safeHostname(finalUrl) || "",
  };
}

/** Decode HTML entities (e.g. &amp; , &#x200f;) that break <img src> and titles in React props. */
function decodeHtmlEntities(s: string) {
  if (!s) return "";
  // Fast path: if no entities, return as-is
  if (!/[&][#a-zA-Z0-9]+;/.test(s)) return s;
  // Minimal entity decoder (browser-free)
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function isPrivateIp(ip: string) {
  // IPv4
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  // IPv6
  if (ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // ULA
  if (ip.startsWith("fe80")) return true; // link-local
  return false;
}

async function hostnameToIp(hostname: string): Promise<string | null> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`, {
      cache: "no-store",
    });
    const json: any = await res.json().catch(() => ({}));
    const ans = Array.isArray(json?.Answer) ? json.Answer : [];
    const a = ans.find((x: any) => x?.type === 1 && typeof x?.data === "string");
    return a?.data || null;
  } catch {
    return null;
  }
}

async function assertUrlIsSafe(u: URL) {
  const host = u.hostname;
  if (!host) throw new Error("Invalid host");

  // Block obvious local targets
  if (host === "localhost" || host.endsWith(".local")) throw new Error("Blocked host");

  // If host is literal IP -> block private ranges
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Blocked IP");
    return;
  }

  // Resolve A record and block private targets (basic SSRF protection)
  const ip = await hostnameToIp(host);
  if (ip && isPrivateIp(ip)) throw new Error("Blocked IP");
}

function normalizeUrl(inputUrl: string) {
  // trim + normalize
  const u = new URL(inputUrl.trim());
  // remove common tracking
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => u.searchParams.delete(k));
  return u;
}

/* -------------------- TikTok oEmbed -------------------- */
async function tiktokOembed(finalUrl: string): Promise<UnfurlData | null> {
  try {
    const api = `https://www.tiktok.com/oembed?url=${encodeURIComponent(finalUrl)}`;
    const r = await fetch(api, { cache: "no-store" });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return null;

    const title = decodeHtmlEntities((j?.title || "").toString());
    const image = decodeHtmlEntities((j?.thumbnail_url || "").toString());
    return {
      url: finalUrl,
      title: title || safeHostname(finalUrl) || finalUrl,
      description: "",
      image: image || "",
      site_name: "TikTok",
    };
  } catch {
    return null;
  }
}

/* -------------------- Meta oEmbed (FB / IG) -------------------- */
async function metaOembed(finalUrl: string): Promise<UnfurlData | null> {
  const token = (process.env.META_OEMBED_ACCESS_TOKEN || "").trim();
  if (!token) return null;

  try {
    const u = new URL(finalUrl);
    const host = u.hostname.replace(/^www\./, "");

    // Use the correct endpoint per platform:
    // - FB: oembed_post
    // - IG: instagram_oembed
    const endpoint =
      host.endsWith("instagram.com")
        ? "https://graph.facebook.com/v20.0/instagram_oembed"
        : "https://graph.facebook.com/v20.0/oembed_post";

    const api = `${endpoint}?url=${encodeURIComponent(finalUrl)}&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(api, { cache: "no-store" });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return null;

    const title = decodeHtmlEntities((j?.title || "").toString());
    const site = decodeHtmlEntities((j?.provider_name || j?.author_name || safeHostname(finalUrl) || "").toString());

    // Many Meta responses include HTML with an <img> / <blockquote>. Prefer explicit thumbnail_url if present.
    const thumb =
      decodeHtmlEntities((j?.thumbnail_url || "").toString()) ||
      decodeHtmlEntities((j?.thumbnail_url_with_play_button || "").toString());

    return {
      url: finalUrl,
      title: title || safeHostname(finalUrl) || finalUrl,
      description: "",
      image: thumb || "",
      site_name: site || safeHostname(finalUrl) || "",
    };
  } catch {
    return null;
  }
}

/* -------------------- OpenGraph fallback -------------------- */
function getMetaTag(html: string, prop: string) {
  // matches: <meta property="og:image" content="...">
  const r = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(r);
  return m?.[1] || "";
}

async function openGraphUnfurl(finalUrl: string): Promise<UnfurlData> {
  try {
    const r = await fetch(finalUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; ActiveBarPreviewBot/1.0; +https://www.activebar.co.il)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const html = await r.text();
    const title =
      decodeHtmlEntities(getMetaTag(html, "og:title")) ||
      decodeHtmlEntities((html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ""));
    const desc = decodeHtmlEntities(getMetaTag(html, "og:description") || getMetaTag(html, "twitter:description"));
    const img = decodeHtmlEntities(getMetaTag(html, "og:image") || getMetaTag(html, "twitter:image"));
    const site = decodeHtmlEntities(getMetaTag(html, "og:site_name"));

    return {
      url: finalUrl,
      title: title || safeHostname(finalUrl) || finalUrl,
      description: desc || "",
      image: img || "",
      site_name: site || safeHostname(finalUrl) || "",
    };
  } catch {
    return minimalData(finalUrl);
  }
}

/* -------------------- Main handler -------------------- */
export async function POST(req: Request) {
  let requestedUrl = "";
  try {
    const body: any = await req.json().catch(() => ({}));
    requestedUrl = (body?.url || "").toString().trim();
    if (!requestedUrl) {
      return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
    }

    let u: URL;
    try {
      u = normalizeUrl(requestedUrl);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(u.protocol)) {
      return NextResponse.json({ ok: false, error: "Invalid protocol" }, { status: 400 });
    }

    await assertUrlIsSafe(u);

    const finalUrl = u.toString();
    const host = u.hostname.replace(/^www\./, "");

    // 1) TikTok oEmbed (no token needed)
    if (host.endsWith("tiktok.com")) {
      const tt = await tiktokOembed(finalUrl);
      if (tt) return NextResponse.json({ ok: true, data: tt });
      // fallback to OG (sometimes blocked)
      const og = await openGraphUnfurl(finalUrl);
      return NextResponse.json({ ok: true, data: og });
    }

    // 2) Meta oEmbed for FB/IG
    if (host.endsWith("facebook.com") || host.endsWith("fb.watch") || host.endsWith("instagram.com")) {
      const meta = await metaOembed(finalUrl);
      if (meta) return NextResponse.json({ ok: true, data: meta });
      const og = await openGraphUnfurl(finalUrl);
      return NextResponse.json({ ok: true, data: og });
    }

    // 3) Generic OG fallback
    const og = await openGraphUnfurl(finalUrl);
    return NextResponse.json({ ok: true, data: og });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unfurl failed", data: requestedUrl ? minimalData(requestedUrl) : null },
      { status: 500 }
    );
  }
}
