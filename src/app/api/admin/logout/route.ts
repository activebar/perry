import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_TOKEN_COOKIE } from '@/lib/adminSession'

export async function POST() {
  cookies().set({ name: ADMIN_TOKEN_COOKIE, value: '', maxAge: 0, path: '/' })
  return NextResponse.json({ ok: true })
}
