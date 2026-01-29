import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/adminSession";
import { supabaseServiceRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasSrv = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    const srv = supabaseServiceRole();
    const { data: s, error: serr } = await srv
      .from("event_settings")
      .select("id, start_at, updated_at")
      .limit(1)
      .single();

    const admin = await getAdminFromRequest(req);

    return NextResponse.json({
      ok: true,
      env: { hasUrl, hasAnon, hasSrv },
      cookie: { hasAdminToken: !!req.cookies.get("sb_admin_token")?.value },
      admin: admin
        ? { username: admin.username, email: admin.email, role: admin.role }
        : null,
      settings: s || null,
      settingsError: serr?.message || null,
      now: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "error" },
      { status: 500 }
    );
  }
}
