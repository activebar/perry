import { supabaseServiceRole } from '@/lib/supabase'

export type ContentRule = {
  id: number
  rule_type: 'block' | 'allow'
  scope: 'event' | 'global'
  event_id: string | null
  match_type: 'exact' | 'contains'
  expression: string
  is_active: boolean
  note: string | null
}

export type ContentRuleMatch = {
  matched: boolean
  rule?: ContentRule
  matched_on?: 'author_name' | 'text' | 'link_url' | 'media_url' | 'video_url'
  matched_value?: string
}

function norm(s: unknown) {
  return String(s ?? '').trim().toLowerCase()
}

function ruleMatches(rule: ContentRule, value: string) {
  const expr = norm(rule.expression)
  const v = norm(value)
  if (!expr || !v) return false
  if (rule.match_type === 'exact') return v === expr
  return v.includes(expr)
}

export async function fetchActiveContentRules() {
  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('content_rules')
    .select('id, rule_type, scope, event_id, match_type, expression, is_active, note')
    .eq('is_active', true)
    .order('id', { ascending: false })

  if (error) throw error
  return (data || []) as ContentRule[]
}

export async function matchContentRules(input: {
  author_name?: string | null
  text?: string | null
  link_url?: string | null
  media_url?: string | null
  video_url?: string | null
}) {
  const rules = await fetchActiveContentRules()

  const fields: Array<[ContentRuleMatch['matched_on'], string]> = [
    ['author_name', input.author_name || ''],
    ['text', input.text || ''],
    ['link_url', input.link_url || ''],
    ['media_url', input.media_url || ''],
    ['video_url', input.video_url || '']
  ]

  // 1) Block rules first
  for (const r of rules) {
    if (r.rule_type !== 'block') continue
    for (const [k, v] of fields) {
      if (ruleMatches(r, v)) {
        return { matched: true, rule: r, matched_on: k, matched_value: v } as ContentRuleMatch
      }
    }
  }

  // 2) Allow rules (used to soften moderation in borderline cases)
  for (const r of rules) {
    if (r.rule_type !== 'allow') continue
    for (const [k, v] of fields) {
      if (ruleMatches(r, v)) {
        return { matched: true, rule: r, matched_on: k, matched_value: v } as ContentRuleMatch
      }
    }
  }

  return { matched: false } as ContentRuleMatch
}
