import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { supabaseServiceRole } from "@/lib/supabase"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const file = form.get("file") as File
    const event = form.get("event") as string
    const kind = form.get("kind") as string
    const galleryId = form.get("gallery_id") as string | null

    if (!file || !event || !kind) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 })
    }

    const ab = await file.arrayBuffer()
    const input = new Uint8Array(ab)

    const fullBuf = await sharp(input)
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()

    const thumbBuf = await sharp(input)
      .rotate()
      .resize(600)
      .webp({ quality: 82 })
      .toBuffer()

    const filename = `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.jpg`

    let path = ""

    if (kind === "hero") {
      path = `${event}/hero/${filename}`
    }

    if (kind === "blessing") {
      path = `${event}/blessings/${filename}`
    }

    if (kind === "gallery") {
      path = `${event}/gallery/${galleryId}/${filename}`
    }

    const thumbPath = `${path}.thumb.webp`

    const supabase = supabaseServiceRole()

    await supabase.storage.from("uploads").upload(path, fullBuf, {
      contentType: "image/jpeg",
      upsert: false,
    })

    await supabase.storage.from("uploads").upload(thumbPath, thumbBuf, {
      contentType: "image/webp",
      upsert: false,
    })

    const publicUrl = supabase.storage.from("uploads").getPublicUrl(path).data
      .publicUrl

    const thumbUrl = supabase.storage
      .from("uploads")
      .getPublicUrl(thumbPath).data.publicUrl

    await supabase.from("media_items").insert({
      event_id: event,
      kind,
      gallery_id: galleryId,
      storage_path: path,
      url: publicUrl,
      thumb_url: thumbUrl,
      is_approved: true,
    })

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      thumb: thumbUrl,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "upload failed" }, { status: 500 })
  }
}
