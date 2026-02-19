import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_TOKEN_COOKIE } from '@/lib/adminSession'
import { EVENT_ACCESS_COOKIE } from '@/lib/eventAccessSession'

export async function POST() {
  cookies().set({ name: ADMIN_TOKEN_COOKIE, value: '', maxAge: 0, path: '/' })
  cookies().set({ name: EVENT_ACCESS_COOKIE, value: '', maxAge: 0, path: '/' })
  return NextResponse.json({ ok: true })
}
