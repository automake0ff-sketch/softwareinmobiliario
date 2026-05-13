---
name: propia-tool-use
description: >
  Implementa tool use (function calling) en los agentes IA de PropIA.
  Usa esta skill SIEMPRE que necesites que un agente IA pueda ejecutar acciones reales:
  buscar propiedades en la base de datos, actualizar el score de un lead, enviar mensajes
  por WhatsApp, consultar disponibilidad en Google Calendar, calcular hipotecas, hacer
  scraping de Idealista, o cualquier acción que requiera que el agente interactúe con
  sistemas externos. También actívala cuando el usuario mencione "que el agente haga X",
  "tool use", "function calling", "que la IA tome acciones", o "herramientas para agentes".
---

# PropIA — Tool Use para Agentes IA

Los agentes de PropIA usan tool use de Claude para ejecutar acciones reales sobre el CRM, WhatsApp, calendario y base de datos. Cada agente tiene acceso a un conjunto específico de herramientas según su función.

## Arquitectura de Tool Use

```
Agente IA (Claude) → decide qué tool usar → ejecuta tool → procesa resultado → responde/actúa
```

Las tools se implementan en `lib/claude/tools/` y se pasan al agente en el array `tools` de la llamada a la API.

## Herramientas por Agente

### CAPTADOR IA — tools disponibles
```typescript
// lib/claude/tools/captador-tools.ts

export const captadorTools: Tool[] = [
  {
    name: "buscar_propiedades_compatibles",
    description: "Busca propiedades en el CRM que coincidan con los criterios del lead",
    input_schema: {
      type: "object",
      properties: {
        budget_max: { type: "number", description: "Presupuesto máximo en euros" },
        zones: { type: "array", items: { type: "string" }, description: "Zonas de interés" },
        property_type: { type: "string", enum: ["piso", "casa", "chalet", "local"] },
        bedrooms_min: { type: "number" },
        operation_type: { type: "string", enum: ["compra", "alquiler"] }
      },
      required: ["budget_max", "operation_type"]
    }
  },
  {
    name: "crear_lead",
    description: "Crea o actualiza un lead en la base de datos del CRM",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        budget_max: { type: "number" },
        zones: { type: "array", items: { type: "string" } },
        property_type: { type: "string" },
        operation_type: { type: "string" },
        urgency: { type: "string", enum: ["alta", "media", "baja"] },
        source: { type: "string" },
        ia_score: { type: "number", minimum: 0, maximum: 100 },
        ia_summary: { type: "string" }
      },
      required: ["phone", "ia_score"]
    }
  },
  {
    name: "detectar_duplicado",
    description: "Verifica si ya existe un lead con ese teléfono o email",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string" },
        email: { type: "string" }
      }
    }
  },
  {
    name: "enviar_whatsapp",
    description: "Envía un mensaje de WhatsApp al lead",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string" },
        message: { type: "string", description: "Mensaje de texto plano" },
        template: { type: "string", description: "Nombre de plantilla aprobada (opcional)" },
        template_params: { type: "array", items: { type: "string" } }
      },
      required: ["phone", "message"]
    }
  }
]
```

### COORDINADOR IA — tools disponibles
```typescript
export const coordinadorTools: Tool[] = [
  {
    name: "obtener_leads_sin_asignar",
    description: "Lista leads que no tienen comercial asignado ordenados por score",
    input_schema: {
      type: "object",
      properties: {
        agency_id: { type: "string" },
        min_score: { type: "number", default: 0 },
        limit: { type: "number", default: 10 }
      },
      required: ["agency_id"]
    }
  },
  {
    name: "obtener_comerciales_disponibles",
    description: "Obtiene comerciales activos con su carga de trabajo actual",
    input_schema: {
      type: "object",
      properties: {
        agency_id: { type: "string" },
        office_id: { type: "string" }
      },
      required: ["agency_id"]
    }
  },
  {
    name: "asignar_lead",
    description: "Asigna un lead a un comercial específico",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        user_id: { type: "string" },
        reason: { type: "string" }
      },
      required: ["lead_id", "user_id"]
    }
  },
  {
    name: "activar_agente",
    description: "Activa otro agente IA para que ejecute una acción sobre un lead",
    input_schema: {
      type: "object",
      properties: {
        agent_type: {
          type: "string",
          enum: ["captador","vendedor","nurturing","agendador","documentador","notificador"]
        },
        lead_id: { type: "string" },
        action: { type: "string" },
        priority: { type: "string", enum: ["alta", "normal"] }
      },
      required: ["agent_type", "lead_id", "action"]
    }
  },
  {
    name: "detectar_leads_bloqueados",
    description: "Detecta leads sin actividad en las últimas N horas",
    input_schema: {
      type: "object",
      properties: {
        agency_id: { type: "string" },
        hours_threshold: { type: "number", default: 48 },
        pipeline_stages: { type: "array", items: { type: "string" } }
      },
      required: ["agency_id"]
    }
  },
  {
    name: "enviar_alerta_equipo",
    description: "Envía una notificación urgente a uno o varios miembros del equipo",
    input_schema: {
      type: "object",
      properties: {
        user_ids: { type: "array", items: { type: "string" } },
        role: { type: "string", enum: ["admin","manager","comercial"] },
        channel: { type: "string", enum: ["whatsapp","email","push"] },
        message: { type: "string" },
        lead_id: { type: "string" }
      },
      required: ["message"]
    }
  }
]
```

### AGENDADOR IA — tools disponibles
```typescript
export const agendadorTools: Tool[] = [
  {
    name: "consultar_disponibilidad_comercial",
    description: "Obtiene los huecos libres del Google Calendar de un comercial",
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        days_ahead: { type: "number", default: 5 },
        duration_minutes: { type: "number", default: 60 }
      },
      required: ["user_id"]
    }
  },
  {
    name: "crear_visita",
    description: "Crea la visita en el CRM y en Google Calendar del comercial",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        property_id: { type: "string" },
        user_id: { type: "string" },
        scheduled_at: { type: "string", description: "ISO 8601 datetime" },
        duration_minutes: { type: "number", default: 60 },
        notes: { type: "string" }
      },
      required: ["lead_id", "user_id", "scheduled_at"]
    }
  },
  {
    name: "reagendar_visita",
    description: "Cancela la visita actual y crea una nueva con otro horario",
    input_schema: {
      type: "object",
      properties: {
        visit_id: { type: "string" },
        new_scheduled_at: { type: "string" },
        reason: { type: "string" }
      },
      required: ["visit_id", "new_scheduled_at"]
    }
  }
]
```

### TASADOR IA — tools disponibles
```typescript
export const tasadorTools: Tool[] = [
  {
    name: "obtener_comparables_zona",
    description: "Obtiene propiedades similares vendidas o en venta en la zona",
    input_schema: {
      type: "object",
      properties: {
        zone: { type: "string" },
        city: { type: "string" },
        property_type: { type: "string" },
        m2_min: { type: "number" },
        m2_max: { type: "number" },
        limit: { type: "number", default: 5 }
      },
      required: ["zone", "city", "property_type"]
    }
  },
  {
    name: "calcular_precio_mercado",
    description: "Calcula el precio medio por m² en una zona según datos históricos",
    input_schema: {
      type: "object",
      properties: {
        zone: { type: "string" },
        city: { type: "string" },
        property_type: { type: "string" },
        operation_type: { type: "string", enum: ["venta","alquiler"] }
      },
      required: ["zone", "city"]
    }
  },
  {
    name: "generar_informe_tasacion_pdf",
    description: "Genera un PDF de tasación con branding de la agencia",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string" },
        agency_id: { type: "string" },
        valuation_min: { type: "number" },
        valuation_optimal: { type: "number" },
        valuation_max: { type: "number" },
        market_analysis: { type: "string" },
        comparables: { type: "array" }
      },
      required: ["property_id", "agency_id", "valuation_optimal"]
    }
  }
]
```

## Implementación del ejecutor de tools

```typescript
// lib/claude/tool-executor.ts

import { supabase } from '@/lib/supabase/server'
import { WhatsAppClient } from '@/lib/whatsapp/client'
import { googleCalendar } from '@/lib/google/calendar'

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: { agencyId: string; userId?: string }
): Promise<unknown> {

  switch (toolName) {

    case "buscar_propiedades_compatibles": {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .eq('agency_id', context.agencyId)
        .eq('status', 'disponible')
        .lte('price', toolInput.budget_max)
        .contains('zones', toolInput.zones || [])
        .limit(5)
      return data
    }

    case "crear_lead": {
      const { data } = await supabase
        .from('leads')
        .upsert({
          ...toolInput,
          agency_id: context.agencyId,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
      return data
    }

    case "enviar_whatsapp": {
      const wa = new WhatsAppClient()
      return await wa.sendText(toolInput.phone as string, toolInput.message as string)
    }

    case "asignar_lead": {
      const { data } = await supabase
        .from('leads')
        .update({ assigned_to: toolInput.user_id })
        .eq('id', toolInput.lead_id)
        .select().single()

      // Registrar actividad
      await supabase.from('activities').insert({
        lead_id: toolInput.lead_id,
        agency_id: context.agencyId,
        type: 'ia_action',
        title: `Lead asignado por Coordinador IA`,
        description: toolInput.reason,
        agent_type: 'coordinador'
      })
      return data
    }

    case "consultar_disponibilidad_comercial": {
      return await googleCalendar.getFreeSlots(
        toolInput.user_id as string,
        toolInput.days_ahead as number,
        toolInput.duration_minutes as number
      )
    }

    case "crear_visita": {
      const { data } = await supabase.from('visits').insert(toolInput).select().single()
      await googleCalendar.createEvent(toolInput.user_id as string, {
        title: `Visita lead - ${toolInput.lead_id}`,
        start: toolInput.scheduled_at as string,
        duration: toolInput.duration_minutes as number
      })
      return data
    }

    // ... resto de tools

    default:
      throw new Error(`Tool desconocida: ${toolName}`)
  }
}
```

## Loop de ejecución con tools

```typescript
// lib/claude/agent-runner.ts

export async function runAgentWithTools(params: {
  systemPrompt: string
  userMessage: string
  tools: Tool[]
  context: { agencyId: string }
  maxIterations?: number
}) {
  const { systemPrompt, userMessage, tools, context } = params
  const maxIter = params.maxIterations || 10
  const messages: Message[] = [{ role: 'user', content: userMessage }]

  for (let i = 0; i < maxIter; i++) {
    const response = await claude.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      system: systemPrompt,
      tools,
      messages
    })

    // Si terminó, retornar respuesta final
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text')
      return textBlock?.text || ''
    }

    // Si usó tools, ejecutarlas
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
      const toolResults = []

      for (const toolUse of toolUseBlocks) {
        try {
          const result = await executeTool(toolUse.name, toolUse.input, context)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          })
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            is_error: true,
            content: String(err)
          })
        }
      }

      // Añadir respuesta del agente y resultados al historial
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })
    }
  }

  throw new Error('Agente excedió el máximo de iteraciones')
}
```

## Reglas de Tool Use para PropIA

1. **Seguridad**: Siempre validar que `agency_id` pertenece al usuario autenticado antes de ejecutar cualquier tool
2. **Logging**: Cada tool ejecutada genera una entrada en `activities` con el agente que la llamó
3. **Rate limiting**: Máximo 10 calls a WhatsApp por lead por día
4. **Idempotencia**: Tools de escritura deben ser idempotentes (usar upsert, no insert)
5. **Timeout**: Todas las tools tienen timeout de 10s. Si falla, el agente recibe error y puede reintentar

## Cuándo leer referencias adicionales
- Para implementar una tool nueva → ver `references/tool-patterns.md`
- Para el schema completo de cada tool → ver `references/tool-schemas.md`
