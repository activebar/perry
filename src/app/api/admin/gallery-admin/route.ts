import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'
import { getAdminFromRequest, requireMaster } from '@/lib/adminSession'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // אם אתה רוצה שרק master ימחק – תשאיר.
    // אם גם client יכול למחוק, תמחק את השורה הבאה:
    requireMaster(admin)

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const srv = supabaseServiceRole()

    // מוחק את הרשומה (הקובץ ב-storage לא נמחק כאן — אפשר להוסיף בהמשך)
    const { data, error } = await srv.from('posts').delete().eq('id', id).select('id').single()
    if (error) throw error

    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
