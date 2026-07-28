const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

const MODELS = {
  fast: 'openai/gpt-4o-mini',
  smart: 'openai/gpt-4o',
  reason: 'anthropic/claude-opus-4-5',
  cheap: 'google/gemini-flash-1.5',
}

export async function callOpenRouter({
  messages,
  model = 'smart',
  temperature = 0.7,
  maxTokens = 1500,
  responseFormat = 'text',
  stream = false,
}) {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no configurada. Añádela al archivo .env')
  }

  const modelName = MODELS[model] || model

  const body = {
    model: modelName,
    messages,
    temperature,
    max_tokens: maxTokens,
  }

  if (responseFormat === 'json') {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.VITE_API_URL || 'http://localhost:5173',
      'X-Title': 'PropIA',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    if (res.status === 402 && !modelName.endsWith(':free')) {
      console.warn(`[OpenRouter] Insufficient credits for model ${modelName}. Retrying with free fallback model (openrouter/free)...`)
      return callOpenRouter({
        messages,
        model: 'openrouter/free',
        temperature,
        maxTokens,
        responseFormat,
        stream,
      })
    }
    throw new Error(`OpenRouter error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export async function* streamOpenRouter({
  messages,
  model = 'smart',
  temperature = 0.7,
  maxTokens = 1500,
}) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada')

  const modelName = MODELS[model] || model

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.VITE_API_URL || 'http://localhost:5173',
      'X-Title': 'PropIA',
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  })

  if (!res.ok) {
    if (res.status === 402 && !modelName.endsWith(':free')) {
      console.warn(`[OpenRouter] Insufficient credits for stream model ${modelName}. Retrying with free fallback model (openrouter/free)...`)
      yield* streamOpenRouter({
        messages,
        model: 'openrouter/free',
        temperature,
        maxTokens,
      })
      return
    }
    throw new Error(`OpenRouter stream error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let lineBuffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      const tail = decoder.decode()
      if (tail) lineBuffer += tail
      break
    }
    lineBuffer += decoder.decode(value, { stream: true })
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const json = line.slice(6)
      if (json === '[DONE]') return
      try {
        const parsed = JSON.parse(json)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch { /* skip malformed chunks */ }
    }
  }
}

export async function askAI({
  system,
  messages = [],
  userMessage,
  model = 'smart',
  temperature = 0.7,
  maxTokens = 1500,
  json = false,
}) {
  const msgs = [
    { role: 'system', content: system },
    ...messages,
  ]
  if (userMessage) msgs.push({ role: 'user', content: userMessage })

  return callOpenRouter({
    messages: msgs,
    model,
    temperature,
    maxTokens,
    responseFormat: json ? 'json' : 'text',
  })
}

// Extrae el texto real de contenido_generado del prompt maestro (server/agents/index.js),
// que puede ser un string directo o un objeto anidado con varios textos redactados
// (ej. { whatsapp: "...", email: {...} }).
function extractGeneratedText(contenido) {
  if (!contenido) return ''
  if (typeof contenido === 'string') return contenido.trim()
  if (typeof contenido === 'object') {
    const priorityKeys = ['whatsapp', 'mensaje', 'mensaje_whatsapp', 'respuesta', 'texto', 'contenido', 'body', 'text', 'saludo', 'briefing_comercial']
    for (const k of priorityKeys) {
      if (typeof contenido[k] === 'string' && contenido[k].trim()) return contenido[k].trim()
    }
    for (const v of Object.values(contenido)) {
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return ''
}

// Limpia caracteres de reemplazo Unicode (U+FFFD) que a veces deja el modelo de
// IA cuando el límite de tokens corta la generación a mitad de un emoji — el
// síntoma visible es un '�' suelto, normalmente cerca de saludos o al final del
// mensaje. Esto no arregla la causa (truncamiento del modelo), pero evita que
// el carácter roto llegue al lead real por WhatsApp/email.
function sanitizeGeneratedText(text) {
  if (!text) return text
  return text.replace(/\uFFFD\s*/g, '').replace(/[ \t]{2,}/g, ' ').trim()
}

// Detecta respuestas que no son contenido real (p.ej. el modelo de fallback
// gratuito openrouter/free a veces no sigue las instrucciones y devuelve
// metadatos de clasificación/moderación en vez del mensaje pedido). Mejor no
// enviar nada a un lead real que enviarle esto.
function looksLikeJunkResponse(text) {
  if (!text) return true
  const t = text.trim()
  if (t.length < 15) return true
  if (/^(user safety|response safety|safety:|i cannot|i can't assist|as an ai)/i.test(t)) return true
  return false
}

export function parseAgentReply(raw) {
  const SEP = '---JSON---'
  const idx = raw.indexOf(SEP)
  if (idx === -1) {
    try {
      const data = JSON.parse(raw)
      // Formato del prompt maestro actual: el texto real vive en contenido_generado,
      // no en un campo "message" — sin esto, message queda vacío y cualquier caller
      // que haga "message || raw" termina usando el JSON completo como mensaje.
      let message = sanitizeGeneratedText(extractGeneratedText(data?.contenido_generado))
      if (looksLikeJunkResponse(message)) message = ''
      return { message, data }
    } catch { /**/ }
    const cleaned = sanitizeGeneratedText(raw)
    return { message: looksLikeJunkResponse(cleaned) ? '' : cleaned, data: null }
  }
  let message = sanitizeGeneratedText(raw.slice(0, idx).replace(/^MENSAJE:\s*/i, '').trim())
  if (looksLikeJunkResponse(message)) message = ''
  try { return { message, data: JSON.parse(raw.slice(idx + SEP.length).trim()) } }
  catch { return { message, data: null } }
}

export function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''))
}

export async function executeAgent({
  agentType,
  systemPrompt,
  userMessage,
  conversationHistory = [],
  temperature,
  maxTokens,
}) {
  const config = AGENT_MODEL_CONFIG[agentType] || {}
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10),
    { role: 'user', content: userMessage },
  ]

  return callOpenRouter({
    messages,
    model: config.model || 'smart',
    temperature: temperature ?? config.temperature ?? 0.7,
    maxTokens: maxTokens ?? config.maxTokens ?? 1500,
  })
}

export const AGENT_MODEL_CONFIG = {
  captador: { model: 'fast', temperature: 0.6, maxTokens: 800 },
  vendedor: { model: 'smart', temperature: 0.7, maxTokens: 1200 },
  coordinador: { model: 'smart', temperature: 0.3, maxTokens: 1500 },
  copywriter: { model: 'smart', temperature: 0.85, maxTokens: 2000 },
  tasador: { model: 'reason', temperature: 0.2, maxTokens: 1500 },
  analista: { model: 'reason', temperature: 0.2, maxTokens: 2000 },
  agendador: { model: 'fast', temperature: 0.4, maxTokens: 800 },
  nurturing: { model: 'fast', temperature: 0.75, maxTokens: 600 },
  documentador: { model: 'fast', temperature: 0.3, maxTokens: 1000 },
  seo: { model: 'smart', temperature: 0.6, maxTokens: 2000 },
  financiero: { model: 'fast', temperature: 0.2, maxTokens: 1000 },
  notificador: { model: 'fast', temperature: 0.5, maxTokens: 600 },
}

export default { callOpenRouter, streamOpenRouter, executeAgent }
