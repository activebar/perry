import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json()
    if (!username) return NextResponse.json({ error: 'missing username' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data: admin } = await srv.from('admin_users').select('email').eq('username', username).eq('is_active', true).single()
    if (!admin?.email) {
      // avoid user enumeration
      return NextResponse.json({ ok: true })
    }

    const origin = req.nextUrl.origin
    const sb = supabaseAnon()
    const { error } = await sb.auth.resetPasswordForEmail(admin.email, { redirectTo: `${origin}/admin/reset` })
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
