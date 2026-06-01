const BASE = 'https://openrouter.ai/api/v1'

export interface ORMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function askAI(p: {
  system: string
  messages?: ORMessage[]
  userMessage?: string
  model?: string
  temperature?: number
  maxTokens?: number
  json?: boolean
}): Promise<string> {
  const msgs: ORMessage[] = [{ role: 'system', content: p.system }]
  if (p.messages?.length) msgs.push(...p.messages)
  if (p.userMessage) msgs.push({ role: 'user', content: p.userMessage })

  const body: Record<string, unknown> = {
    model: p.model ?? 'openai/gpt-4o',
    messages: msgs,
    temperature: p.temperature ?? 0.7,
    max_tokens: p.maxTokens ?? 1500,
  }
  if (p.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'PropIA',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export async function* streamAI(p: {
  system: string
  messages?: ORMessage[]
  userMessage?: string
  model?: string
  temperature?: number
  maxTokens?: number
}): AsyncGenerator<string> {
  const msgs: ORMessage[] = [{ role: 'system', content: p.system }]
  if (p.messages?.length) msgs.push(...p.messages)
  if (p.userMessage) msgs.push({ role: 'user', content: p.userMessage })

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'PropIA',
    },
    body: JSON.stringify({
      model: p.model ?? 'openai/gpt-4o',
      messages: msgs,
      temperature: p.temperature ?? 0.7,
      max_tokens: p.maxTokens ?? 1500,
      stream: true,
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter stream ${res.status}`)

  const reader = res.body!.getReader()
  const dec = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value).split('\n')) {
      if (!line.startsWith('data: ')) continue
      const json = line.slice(6)
      if (json === '[DONE]') return
      try {
        const d = JSON.parse(json)
        const chunk = d.choices?.[0]?.delta?.content
        if (chunk) yield chunk
      } catch { /* skip */ }
    }
  }
}

export function parseAgentReply(raw: string): {
  message: string
  data: Record<string, unknown> | null
} {
  const SEP = '---JSON---'
  const idx = raw.indexOf(SEP)
  if (idx === -1) {
    try { return { message: '', data: JSON.parse(raw) } }
    catch { return { message: raw, data: null } }
  }
  const message = raw.slice(0, idx).replace(/^MENSAJE:\s*/i, '').trim()
  try {
    return { message, data: JSON.parse(raw.slice(idx + SEP.length).trim()) }
  } catch {
    return { message, data: null }
  }
}
