const DEFAULT_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'mistralai/mistral-small-3.2-24b-instruct'
const QUALITY_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'mistralai/mistral-medium-3'
const TIMEOUT_MS = 15000

function getAuthHeaders() {
  try {
    const store = JSON.parse(localStorage.getItem('crm-inmobiliario-store') || '{}');
    const token = store?.state?.user?.token;
    const userId = store?.state?.user?.id;
    
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-auth-token'] = token;
    }
    if (userId) {
      headers['x-auth-user'] = userId;
    }
    return headers;
  } catch (e) {
    return {};
  }
}

async function callOpenRouter(model, systemPrompt, userMessage, maxTokens = 800) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch('/api/tools/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        model,
        maxTokens,
        temperature: 0.7,
        systemPrompt,
        userMessage,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || `Error del servidor: ${res.status}`)
    }

    const data = await res.json()
    return data.response || ''
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') throw new Error('La peticion supero el tiempo limite (15s). Intenta de nuevo.')
    throw err
  }
}

function parseJSON(text) {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const match = clean.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No se pudo parsear la respuesta de la IA.')
  return JSON.parse(match[0])
}

async function runAnalyzerAgent(data, onProgress) {
  onProgress?.('Agente 1/4: Analizando titulo, descripcion y fotos...')

  const system = `Eres un consultor experto en marketing inmobiliario para portales como Idealista, Fotocasa y Habitaclia.
Analizas anuncios con precision para detectar los fallos que reducen la conversion.
Responde SOLO con JSON valido, sin texto adicional.`

  const user = `Analiza este anuncio inmobiliario:

TITULO: ${data.titulo}
DESCRIPCION: ${data.descripcion.substring(0, 1500)}
PRECIO: ${data.precio}
NUMERO DE FOTOS: ${data.fotos}
UBICACION: ${data.ubicacion || 'No especificada'}
TIPO INMUEBLE: ${data.tipo || 'No especificado'}
METROS: ${data.metros || 'No especificado'}
HABITACIONES: ${data.habitaciones || 'No especificadas'}

Devuelve SOLO este JSON:
{
  "scores": {
    "titulo": numero 0-25,
    "descripcion": numero 0-35,
    "fotos": numero 0-20,
    "completitud": numero 0-20
  },
  "analisis": {
    "titulo": "diagnostico directo en 2 frases maximo",
    "descripcion": "diagnostico directo en 2 frases maximo",
    "precio": "diagnostico directo en 2 frases maximo",
    "fotos": "diagnostico directo en 2 frases maximo"
  },
  "errores_clave": [
    "error especifico que esta perdiendo leads ahora mismo",
    "error especifico 2",
    "error especifico 3",
    "error especifico 4"
  ],
  "fortalezas": [
    "punto fuerte real del anuncio",
    "punto fuerte 2"
  ]
}`

  const raw = await callOpenRouter(DEFAULT_MODEL, system, user, 700)
  return parseJSON(raw)
}

async function runCopywriterAgent(data, analyzerResult, onProgress) {
  onProgress?.('Agente 2/4: Generando descripcion optimizada...')

  const system = `Eres el mejor copywriter inmobiliario de Espana. Escribes textos que VENDEN.
Tu estilo: directo, emocional, orientado a beneficios. Sin cliches.
Responde SOLO con JSON valido.`

  const user = `Crea una descripcion optimizada para este inmueble:

DATOS ORIGINALES:
- Titulo: ${data.titulo}
- Descripcion original: ${data.descripcion.substring(0, 800)}
- Precio: ${data.precio}
- Fotos: ${data.fotos}
- Ubicacion: ${data.ubicacion || 'No especificada'}
- Tipo: ${data.tipo || 'No especificado'}
- Metros: ${data.metros || 'No especificados'}
- Habitaciones: ${data.habitaciones || 'No especificadas'}

ERRORES DETECTADOS: ${analyzerResult.errores_clave?.join('; ')}

INSTRUCCIONES:
1. Primer parrafo: gancho emocional que conecte con el comprador ideal
2. Segundo parrafo: las 3-4 caracteristicas mas vendedoras con beneficios reales
3. Tercer parrafo: entorno, comunicaciones, servicios cercanos
4. Cierre: llamada a la accion directa y concreta
5. Maximo 220 palabras. Sin bullet points. Sin mayusculas exageradas.
6. Incluye tambien un titulo optimizado de maximo 80 caracteres.

Devuelve SOLO este JSON:
{
  "titulo_optimizado": "nuevo titulo de maximo 80 caracteres",
  "descripcion_optimizada": "descripcion completa lista para copiar y pegar",
  "palabras_clave": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`

  const raw = await callOpenRouter(QUALITY_MODEL, system, user, 900)
  return parseJSON(raw)
}

async function runPricerAgent(data, onProgress) {
  onProgress?.('Agente 3/4: Evaluando estrategia de precio...')

  const system = `Eres un tasador inmobiliario y estratega de pricing con 15 anos en el mercado espanol.
Conoces los precios por zona, la psicologia del comprador y las tacticas de pricing que funcionan.
Responde SOLO con JSON valido.`

  const user = `Evalua la estrategia de precio de este anuncio:

PRECIO PUBLICADO: ${data.precio}
TIPO INMUEBLE: ${data.tipo || 'No especificado'}
METROS: ${data.metros || 'No especificado'}
HABITACIONES: ${data.habitaciones || 'No especificadas'}
UBICACION: ${data.ubicacion || 'No especificada'}
FOTOS: ${data.fotos}

Analiza: El precio es competitivo? Esta bien posicionado psicologicamente? Genera urgencia o espanta?

Devuelve SOLO este JSON:
{
  "evaluacion_precio": "critica directa del precio actual en 2-3 frases",
  "posicionamiento": "bajo_mercado | correcto | alto_mercado | muy_alto",
  "rango_recomendado": "rango exacto en euros ej: 285.000EUR - 295.000EUR",
  "estrategia": "tactica concreta de pricing para este caso especifico",
  "precio_psicologico": "precio exacto recomendado con explicacion del efecto psicologico",
  "tiempo_venta_estimado": "estimacion en semanas/meses segun precio actual"
}`

  const raw = await callOpenRouter(DEFAULT_MODEL, system, user, 500)
  return parseJSON(raw)
}

async function runOrchestratorAgent(data, results, onProgress) {
  onProgress?.('Agente 4/4: Consolidando analisis y generando plan de accion...')

  const { analyzer, pricer } = results

  const totalScore = Math.min(100, Math.round(
    (analyzer.scores?.titulo || 0) +
    (analyzer.scores?.descripcion || 0) +
    (analyzer.scores?.fotos || 0) +
    (analyzer.scores?.completitud || 0)
  ))

  const system = `Eres el director de marketing de una agencia inmobiliaria premium.
Sintetizas analisis de multiples expertos en un plan de accion claro y ejecutable.
Responde SOLO con JSON valido.`

  const user = `Consolida estos analisis en un informe ejecutivo:

SCORE CALCULADO: ${totalScore}/100
ERRORES: ${analyzer.errores_clave?.join('; ')}
FORTALEZAS: ${analyzer.fortalezas?.join('; ')}
POSICIONAMIENTO PRECIO: ${pricer.posicionamiento}
TIEMPO ESTIMADO VENTA: ${pricer.tiempo_venta_estimado}

Genera el plan de mejoras y recomendaciones de fotos:

Devuelve SOLO este JSON:
{
  "mejoras_prioritarias": [
    "accion concreta #1 que puedes implementar HOY",
    "accion concreta #2",
    "accion concreta #3",
    "accion concreta #4"
  ],
  "recomendaciones_fotos": [
    "foto especifica a anadir: descripcion del angulo/momento/luz",
    "foto especifica 2",
    "foto especifica 3",
    "foto especifica 4",
    "foto especifica 5"
  ],
  "fotos_minimas_recomendadas": numero,
  "resumen_ejecutivo": "1 parrafo directo: estado actual del anuncio y que impacto tendran las mejoras",
  "impacto_estimado": "estimacion del aumento de contactos con las mejoras aplicadas"
}`

  const raw = await callOpenRouter(DEFAULT_MODEL, system, user, 700)
  return { ...parseJSON(raw), score_general: totalScore }
}

export async function runAuditAgents(formData, onProgress) {

  onProgress?.('Iniciando sistema multi-agente...')

  const maxRetries = 1
  let retryCount = 0

  async function execute() {
    try {
      const [analyzer, pricer] = await Promise.all([
        runAnalyzerAgent(formData, onProgress),
        runPricerAgent(formData, onProgress),
      ])

      const copywriter = await runCopywriterAgent(formData, analyzer, onProgress)
      const orchestrator = await runOrchestratorAgent(
        formData, { analyzer, copywriter, pricer }, onProgress
      )

      onProgress?.('Analisis completado!')

      return {
        analisis: analyzer.analisis,
        errores_clave: analyzer.errores_clave,
        fortalezas: analyzer.fortalezas,
        scores: analyzer.scores,
        titulo_optimizado: copywriter.titulo_optimizado,
        descripcion_optimizada: copywriter.descripcion_optimizada,
        palabras_clave: copywriter.palabras_clave,
        evaluacion_precio: pricer.evaluacion_precio,
        posicionamiento: pricer.posicionamiento,
        rango_recomendado: pricer.rango_recomendado,
        estrategia_precio: pricer.estrategia,
        precio_psicologico: pricer.precio_psicologico,
        tiempo_venta_estimado: pricer.tiempo_venta_estimado,
        score_general: orchestrator.score_general,
        mejoras_prioritarias: orchestrator.mejoras_prioritarias,
        recomendaciones_fotos: orchestrator.recomendaciones_fotos,
        fotos_minimas: orchestrator.fotos_minimas_recomendadas,
        resumen_ejecutivo: orchestrator.resumen_ejecutivo,
        impacto_estimado: orchestrator.impacto_estimado,
        fecha: new Date().toISOString(),
        input: formData,
      }
    } catch (err) {
      if (retryCount < maxRetries && (err.message.includes('parsear') || err.message.includes('JSON'))) {
        retryCount++
        onProgress?.('JSON malformado. Reintentando automaticamente...')
        return execute()
      }
      throw err
    }
  }

  return execute()
}
