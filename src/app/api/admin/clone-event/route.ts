import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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
      return NextResponse.json({ error: 'Target event_id already exists' }, { status: 400 })
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

      return next
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
      const payload = stripRow(row, { event_id: targetEventId })

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
        const next = stripRow(row, { event_id: targetEventId })
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
      stripRow(row, { event_id: targetEventId })
    )

    if (rulesRows.length) {
      const ins = await sb.from('content_rules').insert(rulesRows)
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    // 5) media_items with gallery remap
    const mediaRows = mediaItems.map((row: any) => {
      const next = stripRow(row, { event_id: targetEventId })
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
      stripRow(row, { event_id: targetEventId })
    )

    if (blessingRows.length) {
      const ins = await sb.from('posts').insert(blessingRows)
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'השכפול הושלם בהצלחה',
      source_event_id: sourceEventId,
      target_event_id: targetEventId,
      stats: {
        event_settings: settingsRows.length,
        galleries: sortedGalleries.length,
        blocks: blocksRows.length,
        content_rules: rulesRows.length,
        media_items: mediaRows.length,
        blessing_posts: blessingRows.length,
        skipped_legacy_gallery_blocks: hasNewGalleryBlocks
          ? blocks.filter((b: any) => String(b?.type || '') === 'gallery').length
          : 0,
        cleanup_deleted_gallery_blocks: 'legacy type=gallery removed',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
                                                                }
