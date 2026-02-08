import { supabaseAnon } from './supabase'
import { unstable_noStore as noStore } from 'next/cache'
import { getEventId } from './event-id'

export type EventSettings = {
  id?: string
  event_name: string
  start_at: string
  location_text: string | null
  waze_url: string | null
  thank_you_text: string | null

  // moderation
  require_approval: boolean

  // gift
  gift_enabled: boolean
  gift_bit_url: string | null
  gift_paybox_url: string | null
  gift_image_diameter: number
  gift_bit_image_url?: string | null
  gift_paybox_image_url?: string | null

  // archive/delete
  archive_after_days: number
  delete_after_hours: number

  // footer
  footer_enabled: boolean
  footer_label: string | null
  footer_url: string | null

  // hero
  hero_pre_text?: string | null
  hero_live_text?: string | null
  hero_post_text?: string | null
  hero_images?: string[] | null
  hero_rotate_seconds?: number | null

  // galleries config
  guest_gallery_title?: string | null
  guest_gallery_preview_limit?: number | null
  guest_gallery_show_all_button?: boolean | null

  admin_gallery_title?: string | null
  admin_gallery_preview_limit?: number | null
  admin_gallery_show_all_button?: boolean | null

  blessings_preview_limit?: number | null
  blessings_show_all_button?: boolean | null

  approval_lock_after_days?: number | null

  created_at?: string
  updated_at?: string
}

export type Block = {
  id: string
  type: string
  order_index: number
  is_visible: boolean
  config: any
}

export function getBlockTitle(blocks: Block[] | null | undefined, type: string, fallback: string) {
  const b = (blocks || []).find(x => String(x.type) === type)
  const t = String((b as any)?.config?.title || '').trim()
  return t || fallback
}

/**
 * IMPORTANT:
 * There should be only ONE row in event_settings.
 * During dev multiple rows might exist. We always pick the latest edited row.
 */
export async function fetchSettings(): Promise<EventSettings> {
  noStore()
  const sb = supabaseAnon()
  const event_id = getEventId()
  const { data, error } = await sb
    .from('event_settings')
    .select('*')
    .eq('event_id', event_id)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) throw error
  return data as any
}

export async function fetchBlocks(): Promise<Block[]> {
  noStore()
  const sb = supabaseAnon()
  const { data, error } = await sb.from('blocks').select('*').order('order_index', { ascending: true })
  if (error) throw error
  return (data || []) as any
}

/**
 * Phases:
 * pre  = from now until start_at + 30 minutes (includes first 30 min after start)
 * live = from start_at + 30 minutes until start_at + 24 hours
 * post = after that
 */
export function computeEventPhase(startAtIso: string, now = new Date()) {
  const start = new Date(startAtIso)

  const preEnd = new Date(start.getTime() + 30 * 60 * 1000) // +30 דק'
  const liveEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000) // +24 שעות

  if (now < preEnd) return 'pre'
  if (now < liveEnd) return 'live'
  return 'post'
}
