---
name: propia-memoria
description: >
  Implementa el sistema de memoria persistente y contextual para los agentes IA de PropIA.
  Usa esta skill SIEMPRE que necesites que los agentes recuerden información entre sesiones,
  mantengan el contexto de un lead a lo largo del tiempo, acumulen aprendizajes sobre
  patrones de leads, o necesiten acceder a conversaciones anteriores para personalizar
  respuestas. También actívala cuando el usuario mencione "que el agente recuerde",
  "memoria del agente", "contexto persistente", "historial del lead", "que sepa quién es",
  "conversación continua", o cuando un agente necesite saber qué ha pasado antes con un lead.
  Cubre memoria de corto plazo (conversación), largo plazo (perfil del lead) y episódica
  (patrones aprendidos por la agencia).
---

# PropIA — Sistema de Memoria para Agentes IA

Los agentes de PropIA tienen tres capas de memoria que se combinan para dar contexto rico a cada interacción.

## Arquitectura de Memoria

```
┌─────────────────────────────────────────────────────┐
│  MEMORIA DE CORTO PLAZO (conversación actual)        │
│  → Últimos 20 mensajes de la conversación activa     │
│  → Estado: en memoria del worker durante el job      │
├─────────────────────────────────────────────────────┤
│  MEMORIA DE LARGO PLAZO (perfil del lead)            │
│  → ia_summary, ia_insights, ia_score                 │
│  → Historial de propiedades vistas                   │
│  → Estado: Supabase (leads table)                    │
├─────────────────────────────────────────────────────┤
│  MEMORIA EPISÓDICA (patrones de la agencia)          │
│  → Qué objeciones son más comunes                    │
│  → Qué mensajes tienen mejor respuesta               │
│  → Estado: Supabase + embeddings en pgvector         │
└─────────────────────────────────────────────────────┘
```

## Capa 1: Memoria de Conversación (corto plazo)

```typescript
// lib/memory/conversation-memory.ts

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sender_type: 'lead' | 'user' | 'ia'
  metadata?: Record<string, unknown>
}

export async function buildConversationContext(
  leadId: string,
  maxMessages: number = 20
): Promise<ConversationMessage[]> {

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', leadId)  // asumiendo 1 conv principal por lead
    .order('created_at', { ascending: false })
    .limit(maxMessages)

  if (!messages?.length) return []

  // Invertir para orden cronológico y formatear para Claude
  return messages.reverse().map(msg => ({
    role: msg.sender_type === 'lead' ? 'user' : 'assistant',
    content: msg.content_type === 'audio'
      ? `[Audio: ${msg.media_url}]`
      : msg.content || '',
    timestamp: msg.created_at,
    sender_type: msg.sender_type,
    metadata: msg.ia_analysis
  }))
}

// Convertir a formato de mensajes de Claude (multi-turn)
export function toClaudeMessages(
  conversation: ConversationMessage[]
): { role: 'user' | 'assistant'; content: string }[] {

  // Claude requiere que los mensajes alteren user/assistant
  // Consolidar mensajes consecutivos del mismo rol
  const consolidated: { role: 'user' | 'assistant'; content: string }[] = []

  for (const msg of conversation) {
    const last = consolidated[consolidated.length - 1]
    if (last && last.role === msg.role) {
      last.content += '\n' + msg.content
    } else {
      consolidated.push({ role: msg.role, content: msg.content })
    }
  }

  // Asegurar que empiece con 'user'
  if (consolidated[0]?.role === 'assistant') {
    consolidated.unshift({ role: 'user', content: '[Inicio de conversación]' })
  }

  return consolidated
}
```

## Capa 2: Memoria de Lead (largo plazo)

```typescript
// lib/memory/lead-memory.ts

export interface LeadMemory {
  // Perfil básico
  name: string
  phone: string
  operationType: string
  budgetMax?: number
  zones: string[]
  propertyType?: string
  urgency: string

  // Memoria IA acumulada
  summary: string           // Resumen narrativo completo
  insights: string[]        // Facts clave descubiertos
  keyFacts: string[]        // "Tiene hijos", "trabajo nuevo", "divorcio"
  objections: string[]      // Objeciones que ha planteado
  interests: string[]       // Propiedades que le han gustado
  dislikes: string[]        // Cosas que no quiere

  // Estado del proceso
  pipelineStage: string
  score: number
  lastContactDays: number
  visitsDone: number
  propertiesSent: string[]  // IDs de propiedades ya enviadas

  // Contexto temporal
  targetMoveDate?: string   // "antes de verano", "septiembre"
  financingSituation?: string
  currentLivingSituation?: string
}

export async function getLeadMemory(leadId: string): Promise<LeadMemory> {
  const [{ data: lead }, { data: activities }, { data: matchings }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', leadId).single(),
    supabase.from('activities').select('*').eq('lead_id', leadId)
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('property_matchings').select('property_id')
      .eq('lead_id', leadId).eq('sent_to_lead', true)
  ])

  const daysSinceContact = lead.last_contact_at
    ? Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / 86400000)
    : 999

  return {
    name: lead.name,
    phone: lead.phone,
    operationType: lead.operation_type,
    budgetMax: lead.budget_max,
    zones: lead.zones || [],
    propertyType: lead.property_type,
    urgency: lead.urgency,
    summary: lead.ia_summary || 'Sin resumen disponible aún',
    insights: lead.ia_insights || [],
    keyFacts: extractKeyFacts(activities),
    objections: extractObjections(activities),
    interests: [],
    dislikes: [],
    pipelineStage: lead.pipeline_stage,
    score: lead.ia_score,
    lastContactDays: daysSinceContact,
    visitsDone: activities.filter(a => a.type === 'visit_completed').length,
    propertiesSent: matchings?.map(m => m.property_id) || []
  }
}

// Convertir memoria a string de contexto para el system prompt
export function memoryToContext(memory: LeadMemory): string {
  return `
## MEMORIA DEL LEAD: ${memory.name}

**Perfil de búsqueda:**
- Tipo de operación: ${memory.operationType}
- Presupuesto: hasta ${memory.budgetMax ? `${memory.budgetMax.toLocaleString('es-ES')}€` : 'no definido'}
- Zonas: ${memory.zones.join(', ') || 'no definidas'}
- Tipo propiedad: ${memory.propertyType || 'no definido'}
- Urgencia: ${memory.urgency}

**Estado actual:**
- Etapa: ${memory.pipelineStage}
- Score IA: ${memory.score}/100
- Último contacto: hace ${memory.lastContactDays} días
- Visitas realizadas: ${memory.visitsDone}

**Resumen IA acumulado:**
${memory.summary}

**Hechos clave conocidos:**
${memory.keyFacts.map(f => `- ${f}`).join('\n') || '- Sin hechos registrados aún'}

**Objeciones planteadas:**
${memory.objections.map(o => `- ${o}`).join('\n') || '- Ninguna registrada'}

**Propiedades ya enviadas (NO volver a enviar):**
${memory.propertiesSent.length > 0 ? memory.propertiesSent.join(', ') : '- Ninguna aún'}
`.trim()
}
```

## Capa 3: Memoria Episódica con pgvector (RAG)

Ver skill `propia-rag` para la implementación completa con embeddings.

La memoria episódica almacena:
- Conversaciones exitosas (lead cerrado) como ejemplos positivos
- Respuestas a objeciones que funcionaron
- Patrones de leads calientes vs fríos de la agencia

## Actualización de Memoria en tiempo real

```typescript
// lib/memory/memory-updater.ts

// Se llama después de cada respuesta del agente
export async function updateLeadMemory(
  leadId: string,
  agentType: string,
  newMessage: string,
  leadResponse: string,
  agentAnalysis: AgentAnalysis
) {
  const updates: Partial<Lead> = {
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Actualizar score si el agente lo calculó
  if (agentAnalysis.scoreChange) {
    const { data: current } = await supabase
      .from('leads').select('ia_score').eq('id', leadId).single()
    const newScore = Math.max(0, Math.min(100,
      (current?.ia_score || 50) + agentAnalysis.scoreChange
    ))
    updates.ia_score = newScore
    updates.ia_score_label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio'
  }

  // Añadir nuevos insights
  if (agentAnalysis.newInsights?.length) {
    const { data: current } = await supabase
      .from('leads').select('ia_insights').eq('id', leadId).single()
    const existing = current?.ia_insights || []
    updates.ia_insights = [...new Set([...existing, ...agentAnalysis.newInsights])].slice(-20)
  }

  // Regenerar summary si hay cambios significativos
  if (agentAnalysis.shouldUpdateSummary) {
    updates.ia_summary = await regenerateSummary(leadId)
    updates.ia_summary_updated_at = new Date().toISOString()
  }

  await supabase.from('leads').update(updates).eq('id', leadId)
}

// Regenerar el resumen narrativo del lead
async function regenerateSummary(leadId: string): Promise<string> {
  const memory = await getLeadMemory(leadId)
  const conversations = await buildConversationContext(leadId, 30)

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',  // Usar Haiku para tareas simples = más barato
    max_tokens: 300,
    system: 'Eres un asistente que resume el perfil de leads inmobiliarios en UN párrafo conciso y útil para comerciales.',
    messages: [{
      role: 'user',
      content: `Resume este lead en 2-3 frases para que un comercial entienda rápido quién es, qué busca y qué importa ahora mismo:\n\nPerfil: ${JSON.stringify(memory)}\n\nÚltimas interacciones: ${conversations.slice(-5).map(m => m.content).join(' | ')}`
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
```

## Gestión de Contexto en el System Prompt

```typescript
// lib/memory/context-builder.ts

export async function buildAgentContext(
  leadId: string,
  agentType: string,
  agencyConfig: AgencyConfig
): Promise<{
  systemPrompt: string,
  messages: ClaudeMessage[]
}> {
  const [memory, conversation] = await Promise.all([
    getLeadMemory(leadId),
    buildConversationContext(leadId)
  ])

  const systemPrompt = `
${AGENT_BASE_PROMPTS[agentType]}

---
${memoryToContext(memory)}

---
## CONFIGURACIÓN DE AGENCIA
- Nombre: ${agencyConfig.name}
- Tono del bot: ${agencyConfig.botTone}
- Ciudad principal: ${agencyConfig.city}
- Hora actual: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
`

  const messages = conversation.length > 0
    ? toClaudeMessages(conversation)
    : [{ role: 'user' as const, content: 'Iniciando nueva conversación con lead.' }]

  return { systemPrompt, messages }
}
```

## Límites y Gestión de la Ventana de Contexto

```typescript
// Estimaciones de tokens:
// - System prompt base del agente: ~800 tokens
// - Memoria del lead (memoryToContext): ~400 tokens
// - Conversación (20 msgs): ~2000 tokens
// - TOTAL: ~3200 tokens → muy por debajo del límite de 200k

// Para leads con historial muy largo (>6 meses), truncar a:
// - Summary regenerado (más reciente)
// - Últimos 15 mensajes de conversación
// - Solo los 5 insights más recientes

const MAX_CONVERSATION_MESSAGES = 20
const MAX_INSIGHTS = 10
const MAX_CONTEXT_TOKENS = 8000  // Reservar espacio para respuesta
```

## Helpers de extracción

```typescript
function extractKeyFacts(activities: Activity[]): string[] {
  // Extraer hechos clave de notas y actividades
  return activities
    .filter(a => a.type === 'note_added' || a.type === 'ia_action')
    .flatMap(a => a.metadata?.key_facts || [])
    .filter(Boolean)
    .slice(0, 10)
}

function extractObjections(activities: Activity[]): string[] {
  return activities
    .filter(a => a.metadata?.objection)
    .map(a => a.metadata.objection)
    .slice(0, 5)
}
```
