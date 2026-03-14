import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'uploads'

function getEventIdFromReq(req: NextRequest) {
  const url = new URL(req.url)
  return (
    String(url.searchParams.get('event') || '').trim() ||
    String(url.searchParams.get('event_id') || '').trim()
  )
}

async function listAllStoragePaths(
  sb: ReturnType<typeof supabaseServiceRole>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const collected: string[] = []

  async function walk(path: string) {
    const { data, error } = await sb.storage.from(bucket).list(path, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' }
    })

    if (error) {
      throw new Error(`שגיאה בקריאת קבצי Storage: ${error.message}`)
    }

    for (const item of data || []) {
      const name = String(item.name || '').trim()
      if (!name) continue

      const childPath = path ? `${path}/${name}` : name

      const isFolder =
        !item.metadata &&
        !item.id

      if (isFolder) {
        await walk(childPath)
      } else {
        collected.push(childPath)
      }
    }
  }

  await walk(prefix)
  return collected
}

async function removeStorageTree(
  sb: ReturnType<typeof supabaseServiceRole>,
  bucket: string,
  eventId: string
) {
  const prefix = eventId
  const files = await listAllStoragePaths(sb, bucket, prefix)

  if (files.length === 0) {
    return { deletedCount: 0, files: [] as string[] }
  }

  const chunkSize = 100
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize)
    const { error } = await sb.storage.from(bucket).remove(chunk)
    if (error) {
      throw new Error(`שגיאה במחיקת קבצי Storage: ${error.message}`)
    }
  }

  return { deletedCount: files.length, files }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const eventId =
      String(body?.event_id || '').trim() ||
      getEventIdFromReq(req)

    const confirmEventId = String(body?.confirm_event_id || '').trim()
    const deletePassword = String(body?.delete_password || '').trim()
    const confirmChecked = body?.confirm_checked === true

    if (!eventId) {
      return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })
    }

    if (confirmEventId !== eventId) {
      return NextResponse.json(
        { error: 'יש להקליד את event_id המדויק לאישור המחיקה' },
        { status: 400 }
      )
    }

    if (!confirmChecked) {
      return NextResponse.json(
        { error: 'יש לאשר שהמחיקה תמחק גם DB וגם Storage' },
        { status: 400 }
      )
    }

    const expectedPassword = String(process.env.DELETE_EVENT_PASSWORD || '').trim()
    if (!expectedPassword) {
      return NextResponse.json(
        { error: 'DELETE_EVENT_PASSWORD is not configured' },
        { status: 500 }
      )
    }

    if (deletePassword !== expectedPassword) {
      return NextResponse.json(
        { error: 'סיסמת המחיקה שגויה' },
        { status: 403 }
      )
    }

    const sb = supabaseServiceRole()

    const { data: templatesUsingEvent, error: templateError } = await sb
      .from('site_templates')
      .select('id,name,kind,is_active,source_event_id')
      .eq('source_event_id', eventId)
      .eq('is_active', true)

    if (templateError) {
      return NextResponse.json({ error: templateError.message }, { status: 400 })
    }

    if ((templatesUsingEvent || []).length > 0) {
      return NextResponse.json(
        {
          error: 'לא ניתן למחוק אירוע שמשמש כתבנית פעילה',
          templates: templatesUsingEvent
        },
        { status: 409 }
      )
    }

    const storageResult = await removeStorageTree(sb, BUCKET, eventId)

    const deleteResults: Record<string, number> = {}

    const deleteFrom = async (table: string) => {
      const { error, count } = await sb
        .from(table)
        .delete({ count: 'exact' })
        .eq('event_id', eventId)

      if (error) {
        throw new Error(`${table}: ${error.message}`)
      }

      deleteResults[table] = Number(count || 0)
    }

    await deleteFrom('posts')
    await deleteFrom('media_items')
    await deleteFrom('content_rules')
    await deleteFrom('blocks')
    await deleteFrom('galleries')
    await deleteFrom('event_settings')

    return NextResponse.json({
      ok: true,
      deleted_event_id: eventId,
      storage_deleted_count: storageResult.deletedCount,
      db_deleted: deleteResults,
      message: `האירוע "${eventId}" נמחק בהצלחה`
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    )
  }
}
