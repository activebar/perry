import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET galleries
 */
export async function GET(req: NextRequest) {
  const event = req.nextUrl.searchParams.get("event");

  if (!event) {
    return NextResponse.json({ error: "event missing" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("galleries")
    .select("*")
    .eq("event_id", event)
    .order("order_index");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * CREATE NEW GALLERY
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const { event_id } = body;

  if (!event_id) {
    return NextResponse.json({ error: "event_id missing" }, { status: 400 });
  }

  /**
   * find existing galleries
   */
  const { data: galleries } = await supabase
    .from("galleries")
    .select("*")
    .eq("event_id", event_id)
    .order("order_index");

  const nextIndex = (galleries?.length || 0) + 1;
  const title = `gallery_${nextIndex}`;

  /**
   * create gallery
   */
  const { data: newGallery, error } = await supabase
    .from("galleries")
    .insert({
      event_id,
      title,
      order_index: nextIndex,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /**
   * create block
   */
  await supabase.from("blocks").insert({
    event_id,
    type: title,
    config: {
      gallery_id: newGallery.id,
      title: title,
      limit: 12
    }
  });

  return NextResponse.json(newGallery);
}
