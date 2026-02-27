import { supabaseServiceRole } from '@/lib/supabase'
import { getEventId } from '@/lib/event-id'

export type ContentRule = {
  id: number
  rule_type: 'block' | 'allow'
  scope: 'event' | 'global'
  event_id: string | null
  match_type: 'exact' | 'contains' | 'word'
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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Whole word match for Hebrew and mixed text.
// We consider "word boundaries" as start/end OR whitespace OR common punctuation.
function includesWholeWord(haystack: string, needle: string) {
  const h = norm(haystack)
  const n = norm(needle)
  if (!h || !n) return false
  const pat = `(^|[\s\u00A0\t\n\r\.,!\?;:"'()\[\]{}<>/\\|+=~` + '`' + `@#\$%\^&\*-])${escapeRegExp(n)}($|[\s\u00A0\t\n\r\.,!\?;:"'()\[\]{}<>/\\|+=~` + '`' + `@#\$%\^&\*-])`
  try {
    const re = new RegExp(pat, 'i')
    return re.test(h)
  } catch {
    // fallback
    return h.split(/\s+/).includes(n)
  }
}

function norm(s: unknown) {
  return String(s ?? '').trim().toLowerCase()
}

function ruleMatches(rule: ContentRule, value: string) {
  const expr = norm(rule.expression)
  const v = norm(value)
  if (!expr || !v) return false
  if (rule.match_type === 'exact') return v === expr
  if (rule.match_type === 'word') return includesWholeWord(v, expr)
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
  const rulesAll = await fetchActiveContentRules()
  const eventId = getEventId()
  // Legacy support: some older rows may have scope='event' but event_id NULL.
  // Treat NULL as "current event" so existing rules still work.
  const rules = rulesAll.filter(
    r => r.scope === 'global' || (r.scope === 'event' && ((r.event_id || '') === eventId || !r.event_id))
  )

  const fields: Array<[ContentRuleMatch['matched_on'], string]> = [
    ['author_name', input.author_name || ''],
    ['text', input.text || ''],
    ['link_url', input.link_url || ''],
    ['media_url', input.media_url || ''],
    ['video_url', input.video_url || '']
  ]

    // 1) Allow rules (exceptions) FIRST.
  // If an allow rule matches, it overrides any block rule.
  for (const r of rules) {
    if (r.rule_type !== 'allow') continue
    for (const [k, v] of fields) {
      if (ruleMatches(r, v)) {
        return { matched: true, rule: r, matched_on: k, matched_value: v } as ContentRuleMatch
      }
    }
  }

  // 2) Block rules (send to moderation / pending)
  for (const r of rules) {
    if (r.rule_type !== 'block') continue
    for (const [k, v] of fields) {
      if (ruleMatches(r, v)) {
        return { matched: true, rule: r, matched_on: k, matched_value: v } as ContentRuleMatch
      }
    }
  }

  return { matched: false } as ContentRuleMatch
}

