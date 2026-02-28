import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, admin })
}
