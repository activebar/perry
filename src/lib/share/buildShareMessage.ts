type Vars = {
  EVENT_NAME: string
  AUTHOR_NAME?: string
  TEXT?: string
  LINK: string
  DATE?: string
}

export function buildShareMessage(
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
