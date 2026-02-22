import { getServerEnv } from './env'

type ResponsesCreateBody = {
  model: string
  instructions?: string
  input: any
  max_output_tokens?: number
  temperature?: number
  store?: boolean
}

export async function openaiGenerateText(args: {
  instructions: string
  input: string
  model?: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<string> {
  const env = getServerEnv()
  if (!env.OPENAI_API_KEY) throw new Error('missing OPENAI_API_KEY')

  const body: ResponsesCreateBody = {
    model: (args.model || env.OPENAI_WRITING_MODEL || 'gpt-4o-mini') as string,
    instructions: args.instructions,
    input: args.input,
    max_output_tokens: args.maxOutputTokens ?? 450,
    temperature: args.temperature ?? 0.7,
    store: false
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message || 'OpenAI error'
    throw new Error(msg)
  }

  // Prefer SDK helper if present, otherwise parse output items
  const direct = String(json?.output_text || '').trim()
  if (direct) return direct

  const out = json?.output
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text
          if (typeof t === 'string' && t.trim()) return t.trim()
          if (typeof t?.value === 'string' && t.value.trim()) return t.value.trim()
        }
      }
    }
  }

  throw new Error('OpenAI empty response')
}
