import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { getPublicUploadUrl, supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const UPLOADS_BUCKET = 'uploads'

function stripRow(row: any, overrides: Record<string, any> = {}) {
  const copy: any = { ...row }
  delete copy.id
  delete copy.created_at
  delete copy.updated_at
  delete copy.inserted_at
  delete copy.user_id
  delete copy.device_id
  return { ...copy, ...overrides }
}

function remapBlockConfig(config: any, galleryMap: Map<string, string>) {
  const next =
    config && typeof config === 'object' && !Array.isArray(config)
      ? { ...config }
      : {}

  const oldGalleryId = String(next.gallery_id || '').trim()
  if (oldGalleryId && galleryMap.has(oldGalleryId)) {
    next.gallery_id = galleryMap.get(oldGalleryId)
  }

  return next
}

function replaceEventPrefix(value: string, sourceEventId: string, targetEventId: string) {
  if (!value) return value

  let next = value

  if (next.startsWith(`${sourceEventId}/`)) {
    next = `${targetEventId}/${next.slice(sourceEventId.length + 1)}`
  }

  next = next.replace(
    `/storage/v1/object/public/${UPLOADS_BUCKET}/${sourceEventId}/`,
    `/storage/v1/object/public/${UPLOADS_BUCKET}/${targetEventId}/`
  )

  next = next.replace(
    `/storage/v1/object/sign/${UPLOADS_BUCKET}/${sourceEventId}/`,
    `/storage/v1/object/sign/${UPLOADS_BUCKET}/${targetEventId}/`
  )

  next = next.replace(
    `/${UPLOADS_BUCKET}/${sourceEventId}/`,
    `/${UPLOADS_BUCKET}/${targetEventId}/`
  )

  return next
}

function deepReplaceEventRefs(input: any, sourceEventId: string, targetEventId: string): any {
  if (typeof input === 'string') {
    return replaceEventPrefix(input, sourceEventId, targetEventId)
  }

  if (Array.isArray(input)) {
    return input.map((item) => deepReplaceEventRefs(item, sourceEventId, targetEventId))
  }

  if (input && typeof input === 'object') {
    const out: Record<string, any> = {}
    for (const [key, value] of Object.entries(input)) {
      out[key] = deepReplaceEventRefs(value, sourceEventId, targetEventId)
    }
    return out
  }

  return input
}

function remapStorageFields(row: any, sourceEventId: string, targetEventId: string) {
  const next = deepReplaceEventRefs(row, sourceEventId, targetEventId)

  if (typeof next.storage_path === 'string' && next.storage_path) {
    next.storage_path = replaceEventPrefix(next.storage_path, sourceEventId, targetEventId)
  }

  if (typeof next.url === 'string' && next.url) {
    next.url = replaceEventPrefix(next.url, sourceEventId, targetEventId)
  }

  if (typeof next.public_url === 'string' && next.public_url) {
    next.public_url = replaceEventPrefix(next.public_url, sourceEventId, targetEventId)
  }

  if (typeof next.thumb_url === 'string' && next.thumb_url) {
    next.thumb_url = replaceEventPrefix(next.thumb_url, sourceEventId, targetEventId)
  }

  if (typeof next.storage_path === 'string' && next.storage_path) {
    next.public_url = getPublicUploadUrl(next.storage_path)
    if (!next.url || String(next.url).includes(`/storage/v1/object/public/${UPLOADS_BUCKET}/`)) {
      next.url = next.public_url
    }
  }

  return next
}

async function listAllStorageFiles(
  sb: ReturnType<typeof supabaseServiceRole>,
  prefix: string
): Promise<string[]> {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '')
  const found = new Set<string>()

  async function walk(path: string) {
    const { data, error } = await sb.storage.from(UPLOADS_BUCKET).list(path, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
      throw new Error(`Storage list failed for "${path}": ${error.message}`)
    }

    for (const item of data || []) {
      const name = String((item as any)?.name || '').trim()
      if (!name || name === '.' || name === '..') continue

      const fullPath = path ? `${path}/${name}` : name
      const isFolder =
        ((item as any)?.id === null && !(item as any)?.metadata) ||
        String((item as any)?.type || '').toLowerCase() === 'folder'

      if (isFolder) {
        await walk(fullPath)
      } else {
        found.add(fullPath)
      }
    }
  }

  await walk(normalizedPrefix)
  return Array.from(found)
}

async function copyStorageFile(
  sb: ReturnType<typeof supabaseServiceRole>,
  fromPath: string,
  toPath: string
) {
  const copyRes = await sb.storage.from(UPLOADS_BUCKET).copy(fromPath, toPath)

  if (!copyRes.error) {
    return
  }

  const downloadRes = await sb.storage.from(UPLOADS_BUCKET).download(fromPath)
  if (downloadRes.error || !downloadRes.data) {
    throw new Error(
      `Storage copy failed for "${fromPath}" and download fallback also failed: ${
        copyRes.error.message || downloadRes.error?.message || 'unknown error'
      }`
    )
  }

  const uploadRes = await sb.storage.from(UPLOADS_BUCKET).upload(toPath, downloadRes.data, {
    upsert: true,
    contentType: downloadRes.data.type || undefined,
  })

  if (uploadRes.error) {
    throw new Error(
      `Storage upload fallback failed for "${toPath}": ${uploadRes.error.message}`
    )
  }
}

async function cloneEventStorageTree(
  sb: ReturnType<typeof supabaseServiceRole>,
  sourceEventId: string,
  targetEventId: string
) {
  const sourcePrefix = sourceEventId.replace(/^\/+|\/+$/g, '')
  const targetPrefix = targetEventId.replace(/^\/+|\/+$/g, '')

  const sourceFiles = await listAllStorageFiles(sb, sourcePrefix)

  let copiedCount = 0
  for (const fromPath of sourceFiles) {
    const toPath = replaceEventPrefix(fromPath, sourceEventId, targetEventId)
    if (!toPath || toPath === fromPath) continue
    await copyStorageFile(sb, fromPath, toPath)
    copiedCount += 1
  }

  return {
    source_prefix: sourcePrefix,
    target_prefix: targetPrefix,
    files_copied: copiedCount,
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const targetEventId = String(body?.target_event_id || '').trim()
    const targetEventName = String(body?.target_event_name || '').trim() || null
    const templateId = String(body?.template_id || '').trim()
    const explicitSourceEventId = String(body?.source_event_id || '').trim()

    if (!targetEventId) {
      return NextResponse.json({ error: 'Missing target_event_id' }, { status: 400 })
    }

    const sb = supabaseServiceRole()

    let sourceEventId = explicitSourceEventId

    if (templateId) {
      const tplRes = await sb
        .from('site_templates')
        .select('id,source_event_id,name')
        .eq('id', templateId)
        .single()

      if (tplRes.error) {
        return NextResponse.json({ error: tplRes.error.message }, { status: 400 })
      }

      sourceEventId = String((tplRes.data as any)?.source_event_id || '').trim()

      if (!sourceEventId) {
        return NextResponse.json(
          { error: 'Missing source_event_id in site_templates. Add source_event_id to the template first.' },
          { status: 400 }
        )
      }
    }

    if (!sourceEventId) {
      return NextResponse.json({ error: 'Missing source_event_id' }, { status: 400 })
    }

    const existsRes = await sb
      .from('event_settings')
      .select('event_id')
      .eq('event_id', targetEventId)
      .limit(1)

    if (existsRes.error) {
      return NextResponse.json({ error: existsRes.error.message }, { status: 400 })
    }

    if ((existsRes.data || []).length > 0) {
      return NextResponse.json(   { error: 'כבר קיים אירוע עם event_id הזה' },   { status: 400 } )
    }

    const [settingsRes, galleriesRes, blocksRes, rulesRes, mediaRes, postsRes] =
      await Promise.all([
        sb.from('event_settings').select('*').eq('event_id', sourceEventId),
        sb.from('galleries').select('*').eq('event_id', sourceEventId),
        sb.from('blocks').select('*').eq('event_id', sourceEventId),
        sb.from('content_rules').select('*').eq('event_id', sourceEventId),
        sb.from('media_items').select('*').eq('event_id', sourceEventId),
        sb.from('posts')
          .select('*')
          .eq('event_id', sourceEventId)
          .eq('kind', 'blessing')
          .eq('status', 'approved'),
      ])

    const firstErr =
      settingsRes.error ||
      galleriesRes.error ||
      blocksRes.error ||
      rulesRes.error ||
      mediaRes.error ||
      postsRes.error

    if (firstErr) {
      return NextResponse.json({ error: firstErr.message }, { status: 400 })
    }

    const settings = settingsRes.data || []
    const galleries = galleriesRes.data || []
    const blocks = blocksRes.data || []
    const rules = rulesRes.data || []
    const mediaItems = mediaRes.data || []
    const blessingPosts = postsRes.data || []

    const storageCloneStats = await cloneEventStorageTree(sb, sourceEventId, targetEventId)

    // 1) event_settings
    const settingsRows = settings.map((row: any) => {
      const next = stripRow(row, { event_id: targetEventId })

      // key/value schema support
      if (targetEventName && (next.key === 'event_name' || next.name === 'event_name')) {
        if ('value' in next) next.value = targetEventName
        if ('val' in next) next.val = targetEventName
        if ('value_json' in next) next.value_json = targetEventName
      }

      // wide-table schema support
      if (targetEventName && 'event_name' in next) {
        next.event_name = targetEventName
      }

      return deepReplaceEventRefs(next, sourceEventId, targetEventId)
    })

    if (settingsRows.length) {
      const ins = await sb.from('event_settings').insert(settingsRows)
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    // 2) galleries first + build gallery map
    const galleryMap = new Map<string, string>()
    const sortedGalleries = galleries
      .slice()
      .sort((a: any, b: any) => Number(a?.order_index || 0) - Number(b?.order_index || 0))

    for (const row of sortedGalleries) {
      const oldId = String(row?.id || '').trim()
      const payload = deepReplaceEventRefs(
        stripRow(row, { event_id: targetEventId }),
        sourceEventId,
        targetEventId
      )

      const ins = await sb.from('galleries').insert(payload).select('*').single()
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }

      const newId = String((ins.data as any)?.id || '').trim()
      if (oldId && newId) {
        galleryMap.set(oldId, newId)
      }
    }

    // 3) blocks after galleries, with gallery_id remap
    const hasNewGalleryBlocks = blocks.some((b: any) =>
      String(b?.type || '').startsWith('gallery_')
    )

    const filteredBlocks = hasNewGalleryBlocks
      ? blocks.filter((b: any) => String(b?.type || '') !== 'gallery')
      : blocks

    const blocksRows = filteredBlocks
      .slice()
      .sort((a: any, b: any) => Number(a?.order_index || 0) - Number(b?.order_index || 0))
      .map((row: any) => {
        const next = deepReplaceEventRefs(
          stripRow(row, { event_id: targetEventId }),
          sourceEventId,
          targetEventId
        )
        next.config = remapBlockConfig(next.config, galleryMap)
        return next
      })

    if (blocksRows.length) {
      const ins = await sb.from('blocks').insert(blocksRows)
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    // HARD CLEANUP:
    // remove legacy gallery blocks only
    const cleanupLegacyRes = await sb
      .from('blocks')
      .delete()
      .eq('event_id', targetEventId)
      .eq('type', 'gallery')

    if (cleanupLegacyRes.error) {
      return NextResponse.json({ error: cleanupLegacyRes.error.message }, { status: 400 })
    }

    // 4) content rules
    const rulesRows = rules.map((row: any) =>
      deepReplaceEventRefs(stripRow(row, { event_id: targetEventId }), sourceEventId, targetEventId)
    )

    if (rulesRows.length) {
      const ins = await sb.from('content_rules').insert(rulesRows)
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    // 5) media_items with gallery remap + storage path/url remap
    const mediaRows = mediaItems.map((row: any) => {
      const next = remapStorageFields(
        stripRow(row, { event_id: targetEventId }),
        sourceEventId,
        targetEventId
      )

      const oldGalleryId = String(next.gallery_id || '').trim()

      if (oldGalleryId && galleryMap.has(oldGalleryId)) {
        next.gallery_id = galleryMap.get(oldGalleryId)
      } else if (oldGalleryId && !galleryMap.has(oldGalleryId)) {
        next.gallery_id = null
      }

      return next
    })

    if (mediaRows.length) {
      const ins = await sb.from('media_items').insert(mediaRows)
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    // 6) default blessings
    const blessingRows = blessingPosts.map((row: any) =>
      deepReplaceEventRefs(stripRow(row, { event_id: targetEventId }), sourceEventId, targetEventId)
    )

    if (blessingRows.length) {
      const ins = await sb.from('posts').insert(blessingRows)
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    return NextResponse.json({
  ok: true,
  message: `האירוע "${targetEventId}" נוצר בהצלחה`,
  source_event_id: sourceEventId,
  target_event_id: targetEventId,
  stats: {
    event_settings: settingsRows.length,
    galleries: sortedGalleries.length,
    blocks: blocksRows.length,
    content_rules: rulesRows.length,
    media_items: mediaRows.length,
    blessing_posts: blessingRows.length,
    storage_files_copied: storageCloneStats.files_copied
  },
  summary: [
    `הגדרות אירוע: ${settingsRows.length}`,
    `גלריות: ${sortedGalleries.length}`,
    `בלוקים: ${blocksRows.length}`,
    `חוקי תוכן: ${rulesRows.length}`,
    `מדיה: ${mediaRows.length}`,
    `ברכות: ${blessingRows.length}`,
    `קבצי Storage: ${storageCloneStats.files_copied}`
  ]
})
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
