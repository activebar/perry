import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const device_id = cookies().get('device_id')?.value || null
    const srv = supabaseServiceRole()

    const { data, error } = await srv.from('posts').select('*').eq('id', id).limit(1).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // allow returning full item only if it belongs to this device and still editable
    const createdAt = data?.created_at ? new Date(data.created_at).getTime() : 0
    const editableUntil = createdAt ? new Date(createdAt + 60 * 60 * 1000).toISOString() : null
    const can = !!(device_id && data?.device_id && data.device_id === device_id && Date.now() < (createdAt + 60 * 60 * 1000))

    if (!can) {
      // return only safe public fields
      return NextResponse.json({
        ok: true,
        item: {
          id: data.id,
          kind: data.kind,
          author_name: data.author_name,
          text: data.text,
          link_url: data.link_url,
          media_url: data.media_url,
          created_at: data.created_at,
          status: data.status
        }
      })
    }

    return NextResponse.json({
      ok: true,
      item: {
        id: data.id,
        kind: data.kind,
        author_name: data.author_name,
        text: data.text,
        link_url: data.link_url,
        media_url: data.media_url,
        media_path: data.media_path,
        created_at: data.created_at,
        status: data.status,
        editable_until: editableUntil,
        can_edit: true,
        can_delete: true
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
