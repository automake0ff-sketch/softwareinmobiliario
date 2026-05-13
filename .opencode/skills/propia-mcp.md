---
name: propia-mcp
description: >
  Implementa servidores MCP (Model Context Protocol) para PropIA. Usa esta skill
  SIEMPRE que necesites conectar los agentes IA con servicios externos mediante MCP:
  WhatsApp Business, Google Calendar, Supabase, Idealista, CRM data, o cualquier
  integración que los agentes necesiten acceder. También actívala cuando el usuario
  mencione "MCP", "servidor MCP", "contexto del agente", "que el agente acceda a X",
  "conectar agente con", o cuando necesites que los agentes de PropIA tengan acceso
  en tiempo real a datos del CRM, propiedades, conversaciones o calendarios.
---

# PropIA — Model Context Protocol (MCP)

PropIA implementa servidores MCP para que los agentes IA tengan acceso estructurado a todas las fuentes de datos del sistema. Cada servidor MCP expone un conjunto de recursos y herramientas tipadas.

## Arquitectura MCP de PropIA

```
Claude Agente
     │
     ├── MCP: propia-crm        → Supabase (leads, propiedades, actividades)
     ├── MCP: propia-whatsapp   → WhatsApp Business API
     ├── MCP: propia-calendar   → Google Calendar
     ├── MCP: propia-market     → Scraping Idealista/Fotocasa
     └── MCP: propia-docs       → Supabase Storage (documentos)
```

## Servidor 1: propia-crm

```typescript
// mcp-servers/propia-crm/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { supabaseAdmin } from '@/lib/supabase/admin'

const server = new Server(
  { name: 'propia-crm', version: '1.0.0' },
  { capabilities: { resources: {}, tools: {} } }
)

// RESOURCES — datos que los agentes pueden leer como contexto

server.setRequestHandler('resources/list', async () => ({
  resources: [
    {
      uri: 'crm://leads/hot',
      name: 'Leads calientes',
      description: 'Leads con score > 75 sin asignar',
      mimeType: 'application/json'
    },
    {
      uri: 'crm://pipeline/overview',
      name: 'Vista del pipeline',
      description: 'Conteo de leads por etapa',
      mimeType: 'application/json'
    },
    {
      uri: 'crm://properties/available',
      name: 'Propiedades disponibles',
      description: 'Listado de propiedades activas',
      mimeType: 'application/json'
    }
  ]
}))

server.setRequestHandler('resources/read', async (req) => {
  const { uri } = req.params

  if (uri === 'crm://leads/hot') {
    const { data } = await supabaseAdmin
      .from('leads')
      .select('id,name,phone,ia_score,pipeline_stage,zones,budget_max,assigned_to')
      .gt('ia_score', 75)
      .is('assigned_to', null)
      .order('ia_score', { ascending: false })
      .limit(20)
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] }
  }

  if (uri === 'crm://pipeline/overview') {
    const { data } = await supabaseAdmin.rpc('get_pipeline_overview')
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] }
  }

  if (uri === 'crm://properties/available') {
    const { data } = await supabaseAdmin
      .from('properties')
      .select('id,title,price,zone,bedrooms,m2_built,property_type,photos')
      .eq('status', 'disponible')
      .limit(50)
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] }
  }

  throw new Error(`URI desconocida: ${uri}`)
})

// TOOLS — acciones que los agentes pueden ejecutar

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_lead_full_context',
      description: 'Obtiene todo el contexto de un lead: datos, conversaciones, actividades y propiedades vistas',
      inputSchema: {
        type: 'object',
        properties: { lead_id: { type: 'string' } },
        required: ['lead_id']
      }
    },
    {
      name: 'update_lead_score',
      description: 'Actualiza el score IA y el resumen del lead',
      inputSchema: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          score: { type: 'number', minimum: 0, maximum: 100 },
          summary: { type: 'string' },
          insights: { type: 'array', items: { type: 'string' } }
        },
        required: ['lead_id', 'score']
      }
    },
    {
      name: 'change_pipeline_stage',
      description: 'Mueve un lead a otra etapa del pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          new_stage: {
            type: 'string',
            enum: ['nuevo','contactado','interesado','visita_agendada','negociacion','reserva','cerrado','perdido']
          },
          reason: { type: 'string' }
        },
        required: ['lead_id', 'new_stage']
      }
    },
    {
      name: 'match_properties_to_lead',
      description: 'Busca y ranquea propiedades compatibles con el perfil de un lead',
      inputSchema: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          limit: { type: 'number', default: 5 }
        },
        required: ['lead_id']
      }
    },
    {
      name: 'log_activity',
      description: 'Registra una actividad en el timeline del lead',
      inputSchema: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          agent_type: { type: 'string' }
        },
        required: ['lead_id', 'type', 'title']
      }
    }
  ]
}))

server.setRequestHandler('tools/call', async (req) => {
  const { name, arguments: args } = req.params

  switch (name) {
    case 'get_lead_full_context': {
      const [lead, messages, activities, matchings] = await Promise.all([
        supabaseAdmin.from('leads').select('*').eq('id', args.lead_id).single(),
        supabaseAdmin.from('messages').select('*')
          .eq('conversation_id', args.lead_id)
          .order('created_at', { ascending: false }).limit(20),
        supabaseAdmin.from('activities').select('*')
          .eq('lead_id', args.lead_id)
          .order('created_at', { ascending: false }).limit(10),
        supabaseAdmin.from('property_matchings').select('*, properties(*)')
          .eq('lead_id', args.lead_id).order('score', { ascending: false }).limit(5)
      ])
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ lead: lead.data, messages: messages.data, activities: activities.data, matchings: matchings.data })
        }]
      }
    }

    case 'update_lead_score': {
      await supabaseAdmin.from('leads').update({
        ia_score: args.score,
        ia_score_label: args.score > 75 ? 'caliente' : args.score > 40 ? 'templado' : 'frio',
        ia_summary: args.summary,
        ia_insights: args.insights || [],
        updated_at: new Date().toISOString()
      }).eq('id', args.lead_id)
      return { content: [{ type: 'text', text: 'Score actualizado correctamente' }] }
    }

    case 'match_properties_to_lead': {
      const { data: lead } = await supabaseAdmin.from('leads').select('*').eq('id', args.lead_id).single()
      const { data: props } = await supabaseAdmin
        .from('properties')
        .select('*')
        .eq('status', 'disponible')
        .lte('price', lead.budget_max || 999999999)
        .limit(20)

      // Calcular score de compatibilidad para cada propiedad
      const scored = (props || []).map(p => ({
        ...p,
        compatibility_score: calculateCompatibility(lead, p),
        match_reasons: getMatchReasons(lead, p)
      })).sort((a, b) => b.compatibility_score - a.compatibility_score).slice(0, args.limit || 5)

      // Guardar matchings en DB
      for (const p of scored) {
        await supabaseAdmin.from('property_matchings').upsert({
          lead_id: args.lead_id,
          property_id: p.id,
          score: p.compatibility_score,
          reasons: p.match_reasons
        })
      }

      return { content: [{ type: 'text', text: JSON.stringify(scored) }] }
    }

    default:
      throw new Error(`Tool MCP desconocida: ${name}`)
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

## Servidor 2: propia-whatsapp

```typescript
// mcp-servers/propia-whatsapp/index.ts

// Resources disponibles:
// - whatsapp://conversations/active → conversaciones abiertas
// - whatsapp://templates/approved  → plantillas aprobadas por Meta

// Tools disponibles:
// - send_message(phone, text)
// - send_template(phone, template_name, params[])
// - send_property_card(phone, property_id)  → mensaje enriquecido con foto y datos
// - get_conversation_history(phone, limit)
// - mark_conversation_resolved(phone)
```

## Servidor 3: propia-calendar

```typescript
// mcp-servers/propia-calendar/index.ts

// Resources:
// - calendar://agents/availability → huecos libres de todos los comerciales hoy

// Tools:
// - get_free_slots(user_id, days_ahead, duration_minutes)
// - create_visit_event(user_id, lead_name, property_address, start_iso, duration)
// - cancel_event(event_id, user_id)
// - get_today_agenda(user_id)
```

## Servidor 4: propia-market (scraping)

```typescript
// mcp-servers/propia-market/index.ts
// Usa Playwright o Puppeteer para scraping de portales

// Tools:
// - search_idealista(zone, property_type, price_max, bedrooms_min)
// - get_price_per_sqm(zone, city, property_type)
// - get_recent_sales(zone, city, months_back)
```

## Configuración de MCP en los agentes

```typescript
// lib/claude/mcp-config.ts

export function getMCPServers(agentType: string): MCPServerConfig[] {
  const base = [
    { name: 'propia-crm', command: 'node', args: ['./mcp-servers/propia-crm/index.js'] }
  ]

  const byAgent: Record<string, MCPServerConfig[]> = {
    captador:     [...base, { name: 'propia-whatsapp', ... }],
    vendedor:     [...base, { name: 'propia-whatsapp', ... }, { name: 'propia-market', ... }],
    coordinador:  [...base, { name: 'propia-calendar', ... }],
    agendador:    [...base, { name: 'propia-calendar', ... }, { name: 'propia-whatsapp', ... }],
    tasador:      [...base, { name: 'propia-market', ... }],
    analista:     [...base],
    documentador: [...base, { name: 'propia-docs', ... }, { name: 'propia-whatsapp', ... }],
    financiero:   [...base],
    notificador:  [...base, { name: 'propia-whatsapp', ... }],
  }

  return byAgent[agentType] || base
}
```

## Llamada a Claude con MCP

```typescript
// Cuando se usa la API de Claude directamente con MCP:
const response = await claude.beta.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 2000,
  system: systemPrompt,
  messages,
  betas: ['mcp-client-2025-04-04'],
  mcp_servers: getMCPServers(agentType).map(s => ({
    type: 'stdio',
    name: s.name,
    command: s.command,
    args: s.args
  }))
})
```

## Función de compatibilidad de propiedades

```typescript
function calculateCompatibility(lead: Lead, property: Property): number {
  let score = 0
  if (property.price <= (lead.budget_max || Infinity)) score += 30
  if (lead.zones?.includes(property.zone)) score += 25
  if (property.property_type === lead.property_type) score += 20
  if (property.bedrooms >= (lead.bedrooms_min || 0)) score += 15
  if (lead.operation_type === property.price_type) score += 10
  return Math.min(score, 100)
}
```

## Reglas importantes

- Los servidores MCP se levantan como procesos hijo del worker de BullMQ
- Cada agente obtiene solo los servidores que necesita (principio de mínimo privilegio)
- Todos los servidores autentican con `agency_id` del contexto del job
- Timeout de 30s por llamada a servidor MCP
- En desarrollo: usar `--inspect` para debug del proceso MCP
