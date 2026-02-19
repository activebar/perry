import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'
import { ADMIN_TOKEN_COOKIE } from '@/lib/adminSession'

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'missing credentials' }, { status: 400 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'missing service role env' }, { status: 500 })
    }

    const srv = supabaseServiceRole()
    const { data: admin, error: aerr } = await srv
      .from('admin_users')
      .select('username,email,role,is_active')
      .eq('username', username)
      .single()

    if (aerr || !admin?.email) {
      // לא מפרטים אם username קיים או לא (שומר על אבטחה)
      return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
    }

    if (admin.is_active === false) {
      return NextResponse.json({ error: 'inactive' }, { status: 403 })
    }

    const sb = supabaseAnon()
    const { data, error } = await sb.auth.signInWithPassword({ email: admin.email, password })

    if (error || !data.session?.access_token) {
      return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
    }

    cookies().set({
      name: ADMIN_TOKEN_COOKIE,
      value: data.session.access_token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    })

    return NextResponse.json({ ok: true, role: admin.role })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
