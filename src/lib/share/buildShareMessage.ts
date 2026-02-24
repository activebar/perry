type Vars = {
  EVENT_NAME: string
  AUTHOR_NAME?: string
  TEXT?: string
  LINK: string
  DATE?: string
}

type LegacyInput = {
  title: string
  body?: string
  url: string
}

function coreBuildShareMessage(
  template: string | null | undefined,
  vars: Vars,
  noTextFallback: string
) {
  const safeTemplate =
    (template && String(template).trim()) ||
    '🎉 {EVENT_NAME} 🎉\n\n{TEXT}\n\n📌 לצפייה בעוד ברכות ותמונות:\n{LINK}'

  const text = (vars.TEXT || '').trim() || noTextFallback

  const map: Record<string, string> = {
    '{EVENT_NAME}': vars.EVENT_NAME || '',
    '{AUTHOR_NAME}': vars.AUTHOR_NAME || '',
    '{TEXT}': text,
    '{LINK}': vars.LINK || '',
    '{DATE}': vars.DATE || ''
  }

  let out = safeTemplate
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v)
  return out.trim()
}

// Overloads for backward compatibility
export function buildShareMessage(
  template: string | null | undefined,
  vars: Vars,
  noTextFallback: string
): string
export function buildShareMessage(input: LegacyInput): string

// Implementation
export function buildShareMessage(a: any, b?: any, c?: any) {
  // Legacy call: buildShareMessage({ title, body, url })
  if (a && typeof a === 'object' && b === undefined) {
    const input = a as LegacyInput
    const title = String(input.title || '').trim()
    const body = String(input.body || '').trim()
    const url = String(input.url || '').trim()

    return coreBuildShareMessage(
      undefined,
      {
        EVENT_NAME: title,
        TEXT: body,
        LINK: url
      },
      ''
    )
  }

  // Current call: buildShareMessage(template, vars, noTextFallback)
  return coreBuildShareMessage(a, b as Vars, String(c ?? ''))
}
