---
name: propia-orquestador
description: >
  Skill maestra de orquestación para PropIA que combina Tool Use, MCP, Frameworks,
  Memoria y RAG en un sistema unificado. Usa esta skill SIEMPRE que necesites construir
  o modificar el flujo completo de un agente IA de PropIA de extremo a extremo, implementar
  el pipeline completo desde webhook hasta respuesta al lead, depurar el sistema de agentes,
  añadir un nuevo agente al sistema, o entender cómo todas las piezas encajan juntas.
  También actívala cuando el usuario pregunte "cómo funciona todo junto", "implementa el
  agente completo", "añade el agente X", "el agente no funciona", o cuando necesite
  el flujo E2E de cualquier agente. Esta skill lee y coordina las otras 5 skills de PropIA:
  propia-tool-use, propia-mcp, propia-frameworks, propia-memoria y propia-rag.
---

# PropIA — Orquestador Maestro

Esta skill coordina todos los sistemas de PropIA. Leer primero las otras skills según lo que necesites:
- **Tool Use** → `propia-tool-use/SKILL.md` (herramientas de cada agente)
- **MCP** → `propia-mcp/SKILL.md` (servidores MCP y recursos)
- **Frameworks** → `propia-frameworks/SKILL.md` (código, patrones, convenciones)
- **Memoria** → `propia-memoria/SKILL.md` (contexto persistente del lead)
- **RAG** → `propia-rag/SKILL.md` (búsqueda semántica y knowledge base)

## El Agente Completo — Cómo se ensambla todo

```typescript
// lib/claude/full-agent-pipeline.ts
// Este es el flujo completo que se ejecuta por cada mensaje de un lead

export async function runFullAgentPipeline(jobData: AgentJob) {
  const { leadId, agencyId, agentType } = jobData

  // ═══════════════════════════════════════
  // PASO 1: CARGAR CONTEXTO (Memoria + RAG)
  // ═══════════════════════════════════════
  const [leadMemory, ragContext, agencyConfig] = await Promise.all([
    getLeadMemory(leadId),                           // Memoria de largo plazo
    buildRagContext(leadId, agencyId),               // RAG: props similares + ejemplos
    getAgencyConfig(agencyId)                        // Config de la agencia
  ])

  // ═══════════════════════════════════════
  // PASO 2: CONSTRUIR CONVERSACIÓN (Corto plazo)
  // ═══════════════════════════════════════
  const conversationHistory = await buildConversationContext(leadId, 20)
  const claudeMessages = toClaudeMessages(conversationHistory)

  // ═══════════════════════════════════════
  // PASO 3: ENSAMBLAR SYSTEM PROMPT
  // ═══════════════════════════════════════
  const systemPrompt = assembleSystemPrompt({
    agentType,
    leadMemory,       // De propia-memoria
    ragContext,       // De propia-rag
    agencyConfig
  })

  // ═══════════════════════════════════════
  // PASO 4: EJECUTAR AGENTE CON TOOLS + MCP
  // ═══════════════════════════════════════
  const agentTools = getToolsForAgent(agentType)     // De propia-tool-use
  const mcpServers = getMCPServers(agentType)         // De propia-mcp

  const result = await runAgentWithTools({
    systemPrompt,
    messages: claudeMessages,
    tools: agentTools,
    mcpServers,
    context: { agencyId, leadId }
  })

  // ═══════════════════════════════════════
  // PASO 5: ACTUALIZAR MEMORIA
  // ═══════════════════════════════════════
  await updateLeadMemory(leadId, agentType, result.agentActions, result.analysis)

  // ═══════════════════════════════════════
  // PASO 6: EJECUTAR ACCIONES DERIVADAS
  // ═══════════════════════════════════════
  await executePostAgentActions(leadId, agencyId, agentType, result)

  return result
}
```

## Ensamblado del System Prompt completo

```typescript
function assembleSystemPrompt(params: {
  agentType: AgentType
  leadMemory: LeadMemory
  ragContext: RagContextData
  agencyConfig: AgencyConfig
}): string {
  const { agentType, leadMemory, ragContext, agencyConfig } = params

  return `
${AGENT_BASE_PROMPTS[agentType]}

══════════════════════════════════════
MEMORIA DEL LEAD
══════════════════════════════════════
${memoryToContext(leadMemory)}

══════════════════════════════════════
PROPIEDADES RELEVANTES (RAG)
══════════════════════════════════════
${ragContext.propertiesSection || 'Sin propiedades coincidentes disponibles ahora.'}

══════════════════════════════════════
EJEMPLOS QUE HAN FUNCIONADO (RAG)
══════════════════════════════════════
${ragContext.examplesSection || 'Sin ejemplos previos similares en la base de conocimiento.'}

══════════════════════════════════════
DATOS DE MERCADO (RAG)
══════════════════════════════════════
${ragContext.marketSection || 'Sin datos de mercado adicionales.'}

══════════════════════════════════════
CONFIGURACIÓN DE LA AGENCIA
══════════════════════════════════════
Agencia: ${agencyConfig.name}
Bot tone: ${agencyConfig.botTone}
Ciudad: ${agencyConfig.city}
Hora: ${new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' })}
Horario activo: ${agencyConfig.activeHours.start} - ${agencyConfig.activeHours.end}
`.trim()
}
```

## Flujos E2E por tipo de evento

### Flujo 1: Mensaje de WhatsApp entrante
```
WhatsApp webhook
  └→ api/webhooks/whatsapp/route.ts
       ├→ Verificar firma Meta
       ├→ Guardar mensaje en DB (messages table)
       ├→ Buscar/crear lead por phone
       └→ enqueueAgentJob('process_message', { leadId, messageId, agencyId })
            └→ BullMQ Worker
                 └→ runFullAgentPipeline('vendedor' | 'captador')
                      ├→ [MEMORIA] getLeadMemory(leadId)
                      ├→ [RAG] buildRagContext(leadId)
                      ├→ [CONV] buildConversationContext(leadId)
                      ├→ [CLAUDE] Agente decide qué hacer
                      ├→ [TOOL] enviar_whatsapp(phone, response)
                      └→ [MEMORIA] updateLeadMemory(...)
```

### Flujo 2: Nuevo lead de Meta Ads
```
Meta Ads webhook
  └→ api/webhooks/meta-ads/route.ts
       ├→ Parsear datos del lead (nombre, phone, email, campaña)
       ├→ Crear lead en DB con source='meta_ads'
       └→ enqueueAgentJob('process_new_lead', ...)
            └→ BullMQ Worker
                 └→ runFullAgentPipeline('captador')
                      ├→ [MEMORIA] No hay historial → perfil vacío
                      ├→ [RAG] buscar propiedades que encajen con la campaña
                      ├→ [CLAUDE] Captador genera mensaje de bienvenida
                      ├→ [TOOL] enviar_whatsapp(phone, welcomeMessage)
                      ├→ [TOOL] crear_lead(data) → actualizar con ia_score inicial
                      └→ [COORD] notificar al Coordinador si score > 70
```

### Flujo 3: Cron job diario (8:00 AM)
```
Vercel Cron → api/cron/daily-briefing/route.ts
  └→ Para cada agencia activa:
       └→ Para cada comercial:
            └→ enqueueAgentJob('daily_briefing', { agencyId, userId })
                 └→ BullMQ Worker
                      └→ runFullAgentPipeline('notificador')
                           ├→ [ANALISTA] getPriorityLeads(userId)
                           ├→ [AGENDADOR] getTodayVisits(userId)
                           ├→ [CLAUDE] Notificador genera briefing personalizado
                           └→ [TOOL] enviar_whatsapp(userPhone, briefingMessage)
```

### Flujo 4: Automatización disparada
```
Lead cambia de etapa a 'negociacion'
  └→ Supabase Realtime trigger
       └→ api/automations/trigger/route.ts
            └→ Buscar automatizaciones con trigger='stage_changed' to='negociacion'
            └→ Para cada automatización que cumple condiciones:
                 └→ Ejecutar acciones en secuencia:
                      ├→ activate_agent('documentador') → solicitar documentos
                      ├→ activate_agent('financiero') → calcular viabilidad
                      └→ notify_team(managers) → alerta urgente
```

## Registro de decisiones del Orquestador

```typescript
// Cada vez que el Coordinador IA toma una decisión, se registra:
interface OrchestratorDecision {
  leadId: string
  agencyId: string
  timestamp: string
  triggerEvent: string          // qué lo activó
  agentActivated: AgentType     // qué agente se activó
  reason: string                // por qué
  leadScoreBefore: number
  leadScoreAfter?: number
  outcome?: string              // resultado después de X horas
}

// Esto permite al Analista IA aprender qué decisiones funcionan mejor
```

## Manejo de Errores y Fallbacks

```typescript
export async function runFullAgentPipelineWithFallback(jobData: AgentJob) {
  try {
    return await runFullAgentPipeline(jobData)
  } catch (err) {
    console.error(`[Agent Pipeline Error] ${jobData.agentType}:`, err)

    // Fallback: notificar al equipo humano
    await supabase.from('activities').insert({
      lead_id: jobData.leadId,
      agency_id: jobData.agencyId,
      type: 'ia_action',
      title: `⚠️ Agente ${jobData.agentType} falló`,
      description: String(err),
      agent_type: jobData.agentType
    })

    // Si era un mensaje entrante, al menos marcar que está pendiente
    if (jobData.type === 'process_message') {
      await supabase.from('leads').update({
        ia_next_action: 'Requiere revisión manual — agente falló'
      }).eq('id', jobData.leadId)
    }

    throw err  // BullMQ reintentará según la config del job
  }
}
```

## Métricas del Sistema

```typescript
// Instrumentación para monitorear el pipeline
export async function trackAgentExecution(params: {
  agentType: string
  leadId: string
  agencyId: string
  durationMs: number
  toolsUsed: string[]
  mcpCallsCount: number
  ragQueriesCount: number
  tokensUsed: number
  success: boolean
  scoreChange?: number
}) {
  // Guardar métricas en daily_metrics.agent_actions
  const key = params.agentType
  const { data: metrics } = await supabase
    .from('daily_metrics')
    .select('agent_actions')
    .eq('agency_id', params.agencyId)
    .eq('date', new Date().toISOString().split('T')[0])
    .single()

  const current = metrics?.agent_actions || {}
  const agentMetrics = current[key] || { count: 0, tokens: 0, errors: 0 }

  await supabase.from('daily_metrics').upsert({
    agency_id: params.agencyId,
    date: new Date().toISOString().split('T')[0],
    agent_actions: {
      ...current,
      [key]: {
        count: agentMetrics.count + 1,
        tokens: agentMetrics.tokens + params.tokensUsed,
        errors: agentMetrics.errors + (params.success ? 0 : 1),
        avg_duration_ms: Math.round(
          (agentMetrics.avg_duration_ms || params.durationMs + params.durationMs) / 2
        )
      }
    }
  })
}
```

## Checklist de implementación de un nuevo agente

Cuando se añade un nuevo agente a PropIA, seguir este orden:

1. ☐ Definir el `SYSTEM_PROMPT` en `lib/claude/agents/[nombre].ts`
2. ☐ Definir sus `tools` en `lib/claude/tools/[nombre]-tools.ts`
3. ☐ Añadir el caso en `executeTool()` en `lib/claude/tool-executor.ts`
4. ☐ Configurar qué `mcpServers` necesita en `lib/claude/mcp-config.ts`
5. ☐ Añadir el tipo en `AgentType` en `types/agent.ts`
6. ☐ Crear la card visual en `components/agents/AgentCard.tsx`
7. ☐ Añadir al switch del worker en `lib/queue/workers/agent.worker.ts`
8. ☐ Añadir a la tabla `ai_agents` con `INSERT` en el seed de la agencia
9. ☐ Documentar en `PropIA_MASTER_COMPLETO.md`
10. ☐ Añadir test básico en `__tests__/agents/[nombre].test.ts`

## Costes estimados por agente (Claude Sonnet)

| Agente | Tokens/llamada aprox | Freq/día | Coste/mes (100 leads) |
|--------|---------------------|----------|----------------------|
| Captador | ~2.000 | 50 | ~$15 |
| Vendedor | ~3.000 | 80 | ~$36 |
| Coordinador | ~1.500 | 100 | ~$22 |
| Nurturing | ~1.000 | 30 | ~$4.5 |
| Notificador | ~500 | 200 | ~$15 |
| Resto (7) | ~1.500 | 20 | ~$31 |
| **TOTAL** | | | **~$125/mes/agencia** |

Optimización: usar `claude-haiku-4-5-20251001` para tareas simples (resúmenes, nurturing, notificaciones) y `claude-sonnet-4-6` solo para vendedor y coordinador.
