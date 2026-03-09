import { getServerEnv } from './env'

export type ModerationResult = {
  ok: boolean
  flagged: boolean
  provider: 'openai' | 'none'
  summary?: string
  raw?: any
}

function hasOpenAiKey() {
  try {
    const env = getServerEnv()
    return !!env.OPENAI_API_KEY
  } catch {
    return false
  }
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const input = String(text || '').trim()
  if (!input) return { ok: true, flagged: false, provider: 'none' }

  if (!hasOpenAiKey()) {
    // No provider configured. We do not block.
    return { ok: true, flagged: false, provider: 'none' }
  }

  const env = getServerEnv()
  const model = env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest'

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, input })
    })

    const json = await res.json().catch(() => null)
    if (!res.ok || !json) {
      return {
        ok: false,
        flagged: false,
        provider: 'openai',
        summary: 'moderation request failed',
        raw: json
      }
    }

    const flagged = !!json?.results?.[0]?.flagged
    return {
      ok: true,
      flagged,
      provider: 'openai',
      raw: json
    }
  } catch (e: any) {
    return {
      ok: false,
      flagged: false,
      provider: 'openai',
      summary: e?.message || 'moderation error'
    }
  }
}
