import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getPublicEnv, getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const srv = supabaseServiceRole()

    // Counts
    const [{ count: settingsCount }, { count: blocksCount }, { count: postsCount }, { count: reactionsCount }, { count: adsCount }] = await Promise.all([
      srv.from('event_settings').select('id', { count: 'exact', head: true }),
      srv.from('blocks').select('id', { count: 'exact', head: true }),
      srv.from('posts').select('id', { count: 'exact', head: true }),
      srv.from('reactions').select('id', { count: 'exact', head: true }),
      srv.from('ads').select('id', { count: 'exact', head: true }),
    ])

    // Latest settings row (the one the site should be using)
    const { data: latestSettings } = await srv
      .from('event_settings')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: blocks } = await srv
      .from('blocks')
      .select('id,type,order_index,is_visible,config,created_at')
      .order('order_index', { ascending: true })

    // Per-kind post counts
    const { data: postKinds } = await srv
      .from('posts')
      .select('kind')
      .limit(5000)

    const perKind: Record<string, number> = {}
    for (const row of postKinds || []) {
      const k = (row as any)?.kind || 'unknown'
      perKind[k] = (perKind[k] || 0) + 1
    }

    // Env presence (never return secrets)
    const pub = (() => {
      try { return getPublicEnv() } catch { return null }
    })()
    const srvEnv = (() => {
      try { return getServerEnv() } catch { return null }
    })()

    const env = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      EVENT_SLUG: !!process.env.EVENT_SLUG,
      CRON_SECRET: !!process.env.CRON_SECRET,
      GDRIVE_SERVICE_ACCOUNT_JSON: !!process.env.GDRIVE_SERVICE_ACCOUNT_JSON,
      GDRIVE_ROOT_FOLDER_ID: !!process.env.GDRIVE_ROOT_FOLDER_ID,
      parsed_public_env_ok: !!pub,
      parsed_server_env_ok: !!srvEnv,
    }

    return NextResponse.json({
      ok: true,
      server_now: new Date().toISOString(),
      admin: { username: admin.username, email: admin.email, role: admin.role },
      counts: {
        event_settings: settingsCount ?? null,
        blocks: blocksCount ?? null,
        posts: postsCount ?? null,
        reactions: reactionsCount ?? null,
        ads: adsCount ?? null,
        posts_by_kind: perKind,
      },
      latest_settings: latestSettings ?? null,
      blocks: blocks || [],
      env,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
