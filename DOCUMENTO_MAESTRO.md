# 🏠 PropIA — DOCUMENTO MAESTRO COMPLETO
## Para construir con Antigravity + OpenCode

> **Versión**: 1.0 — Documento de arquitectura, prompts, flujos y código de referencia  
> **Stack**: Next.js 14 · Supabase · Tailwind CSS · Claude API · WhatsApp Business API

---

# ÍNDICE

1. [Visión del producto](#vision)
2. [Arquitectura técnica completa](#arquitectura)
3. [Estructura de carpetas y archivos](#estructura)
4. [Base de datos — Schema completo](#database)
5. [Los 12 Agentes IA — Prompts internos completos](#agentes)
6. [Flujo de datos entre agentes](#flujos)
7. [Módulos del frontend](#frontend)
8. [API Routes completas](#api)
9. [Automatizaciones](#automatizaciones)
10. [Integraciones externas](#integraciones)
11. [Prompts para Antigravity](#antigravity-prompts)
12. [Prompts para OpenCode](#opencode-prompts)

---

# 1. VISIÓN DEL PRODUCTO {#vision}

PropIA es una **empresa inmobiliaria completamente automatizada por IA**. No es un CRM. No es un chatbot. Es un sistema que trabaja 24/7 captando leads, clasificándolos, nutriéndolos y cerrando operaciones — con humanos supervisando, no ejecutando.

**Propuesta de valor en una frase**:
> "Contrata un equipo de 12 empleados de IA por menos de lo que cuesta un comercial."

**Diferenciadores clave**:
- 12 agentes IA especializados que se coordinan entre sí
- CRM que se actualiza solo — sin trabajo manual
- Respuesta a leads en <2 minutos, 24/7
- Score de probabilidad de cierre en tiempo real
- Modo agencia: multioficina, multiusuario, white-label

---

# 2. ARQUITECTURA TÉCNICA COMPLETA {#arquitectura}

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│   Next.js 14 (App Router) + Tailwind CSS + Framer Motion    │
│   Zustand (state) · React Query (server state)              │
└─────────────────────┬───────────────────────────────────────┘
                      │ API Routes / Server Actions
┌─────────────────────▼───────────────────────────────────────┐
│                      BACKEND                                 │
│   Next.js API Routes + Edge Functions                        │
│   Bull Queue (jobs) · Socket.io (tiempo real)               │
└──────┬─────────────────────────┬───────────────────────────┘
       │                         │
┌──────▼──────┐         ┌────────▼────────┐
│  Supabase   │         │   Claude API    │
│  PostgreSQL │         │  (12 Agentes)   │
│  Auth       │         │  claude-sonnet  │
│  Storage    │         └────────┬────────┘
│  Realtime   │                  │
└──────┬──────┘         ┌────────▼────────┐
       │                │  Cola de Tareas │
       │                │  (BullMQ+Redis) │
       │                └─────────────────┘
       │
┌──────▼──────────────────────────────────┐
│           INTEGRACIONES EXTERNAS        │
│  WhatsApp Business API (Meta)           │
│  Meta Ads Webhooks                      │
│  Idealista / Fotocasa (email parsing)   │
│  Google Calendar (OAuth2)              │
│  Twilio (llamadas)                     │
│  SendGrid (email)                      │
│  Stripe (billing)                      │
└─────────────────────────────────────────┘
```

## Stack detallado

| Capa | Tecnología | Razón |
|------|-----------|-------|
| Framework | Next.js 14 (App Router) | SSR, API routes, Edge |
| UI | Tailwind CSS + shadcn/ui | Velocidad + calidad |
| Animaciones | Framer Motion | Micro-interacciones premium |
| Estado global | Zustand | Simple y potente |
| Server state | TanStack Query | Cache + sync |
| Base de datos | Supabase (PostgreSQL) | Auth + Realtime incluido |
| Cola de trabajos | BullMQ + Redis (Upstash) | Jobs asíncronos de IA |
| Tiempo real | Supabase Realtime | WebSockets para dashboard |
| IA | Claude API (Anthropic) | Mejor para conversación |
| WhatsApp | Meta WhatsApp Business API | Oficial y estable |
| Email | SendGrid | Transaccional |
| Llamadas | Twilio | VoIP |
| Pagos | Stripe | Suscripciones SaaS |
| Deploy | Vercel | Next.js nativo |
| Monitoring | Sentry + Vercel Analytics | Errores + performance |

---

# 3. ESTRUCTURA DE CARPETAS {#estructura}

```
propia/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── onboarding/
│   │       ├── step-1-agency/page.tsx
│   │       ├── step-2-whatsapp/page.tsx
│   │       ├── step-3-properties/page.tsx
│   │       ├── step-4-agents/page.tsx
│   │       └── step-5-launch/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← Sidebar + Header
│   │   ├── page.tsx                ← Dashboard home
│   │   ├── leads/
│   │   │   ├── page.tsx            ← Lista de leads
│   │   │   └── [id]/page.tsx       ← Perfil completo
│   │   ├── pipeline/page.tsx       ← Kanban
│   │   ├── properties/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── conversations/page.tsx  ← Chat WhatsApp
│   │   ├── automations/page.tsx    ← Constructor visual
│   │   ├── agents/
│   │   │   ├── page.tsx            ← Grid de agentes
│   │   │   └── [id]/page.tsx       ← Config de agente
│   │   ├── analytics/page.tsx
│   │   ├── team/page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── agency/page.tsx
│   │       ├── whitelabel/page.tsx
│   │       ├── integrations/page.tsx
│   │       └── billing/page.tsx
│   └── api/
│       ├── webhooks/
│       │   ├── whatsapp/route.ts
│       │   ├── meta-ads/route.ts
│       │   └── idealista/route.ts
│       ├── agents/
│       │   ├── captador/route.ts
│       │   ├── vendedor/route.ts
│       │   ├── coordinador/route.ts
│       │   ├── copywriter/route.ts
│       │   ├── tasador/route.ts
│       │   ├── analista/route.ts
│       │   ├── agendador/route.ts
│       │   ├── nurturing/route.ts
│       │   ├── documentador/route.ts
│       │   ├── seo/route.ts
│       │   ├── financiero/route.ts
│       │   └── notificador/route.ts
│       ├── leads/route.ts
│       ├── properties/route.ts
│       ├── conversations/route.ts
│       └── automations/route.ts
├── components/
│   ├── ui/                         ← shadcn components
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── ActivityFeed.tsx
│   ├── dashboard/
│   │   ├── KPICard.tsx
│   │   ├── AgentStatusGrid.tsx
│   │   ├── LiveFeed.tsx
│   │   ├── PipelineFunnel.tsx
│   │   └── LeadsMap.tsx
│   ├── pipeline/
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   └── LeadCard.tsx
│   ├── leads/
│   │   ├── LeadProfile.tsx
│   │   ├── AIResumen.tsx
│   │   ├── Timeline.tsx
│   │   ├── ConversationChat.tsx
│   │   ├── AIRecommendations.tsx
│   │   └── PropertyMatching.tsx
│   ├── agents/
│   │   ├── AgentCard.tsx
│   │   ├── AgentConfig.tsx
│   │   └── AgentFlowDiagram.tsx
│   └── automations/
│       ├── AutomationBuilder.tsx
│       ├── TriggerSelector.tsx
│       └── ActionBuilder.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts               ← Tipos generados
│   ├── claude/
│   │   ├── client.ts
│   │   └── agents/
│   │       ├── captador.ts
│   │       ├── vendedor.ts
│   │       ├── coordinador.ts
│   │       ├── copywriter.ts
│   │       ├── tasador.ts
│   │       ├── analista.ts
│   │       ├── agendador.ts
│   │       ├── nurturing.ts
│   │       ├── documentador.ts
│   │       ├── seo.ts
│   │       ├── financiero.ts
│   │       └── notificador.ts
│   ├── whatsapp/
│   │   ├── client.ts
│   │   └── templates.ts
│   └── queue/
│       ├── client.ts
│       └── workers/
│           ├── agent.worker.ts
│           └── automation.worker.ts
├── hooks/
│   ├── useLeads.ts
│   ├── usePipeline.ts
│   ├── useAgents.ts
│   ├── useRealtime.ts
│   └── useAutomations.ts
├── store/
│   ├── useAppStore.ts
│   └── usePipelineStore.ts
└── types/
    ├── lead.ts
    ├── agent.ts
    ├── property.ts
    └── automation.ts
```

---

# 4. BASE DE DATOS — SCHEMA COMPLETO {#database}

```sql
-- ============================================================
-- MULTI-TENANT: AGENCIAS
-- ============================================================
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366F1',
  secondary_color TEXT DEFAULT '#8B5CF6',
  custom_domain TEXT,
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter','profesional','agencia','enterprise')),
  whatsapp_token TEXT,
  whatsapp_phone_id TEXT,
  claude_api_key TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- OFICINAS
-- ============================================================
CREATE TABLE offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  bot_name TEXT DEFAULT 'Asistente IA',
  bot_tone TEXT DEFAULT 'profesional' CHECK (bot_tone IN ('formal','profesional','cercano','lujo')),
  bot_language TEXT DEFAULT 'es',
  active_hours JSONB DEFAULT '{"start":"09:00","end":"20:00","days":[1,2,3,4,5]}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USUARIOS / EQUIPO
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  agency_id UUID REFERENCES agencies(id),
  office_id UUID REFERENCES offices(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'comercial' CHECK (role IN ('admin','manager','comercial','ia_agent')),
  avatar_url TEXT,
  google_calendar_token JSONB,
  notification_settings JSONB DEFAULT '{"whatsapp":true,"email":true,"push":true}',
  is_active BOOLEAN DEFAULT TRUE,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROPIEDADES
-- ============================================================
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  office_id UUID REFERENCES offices(id),
  title TEXT NOT NULL,
  description TEXT,
  description_short TEXT,
  price DECIMAL(12,2),
  price_type TEXT DEFAULT 'venta' CHECK (price_type IN ('venta','alquiler','alquiler_opcion_compra')),
  property_type TEXT CHECK (property_type IN ('piso','casa','chalet','local','oficina','terreno','garaje','trastero')),
  status TEXT DEFAULT 'disponible' CHECK (status IN ('disponible','reservada','vendida','alquilada','retirada')),
  zone TEXT,
  city TEXT,
  address TEXT,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  m2_built INTEGER,
  m2_useful INTEGER,
  bedrooms INTEGER,
  bathrooms INTEGER,
  floor INTEGER,
  has_elevator BOOLEAN,
  has_parking BOOLEAN,
  has_storage BOOLEAN,
  has_terrace BOOLEAN,
  energy_rating TEXT,
  photos JSONB DEFAULT '[]',
  features JSONB DEFAULT '[]',
  portal_urls JSONB DEFAULT '{}',
  ai_description TEXT,
  ai_tags TEXT[],
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  office_id UUID REFERENCES offices(id),
  assigned_to UUID REFERENCES users(id),
  
  -- Datos personales
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  
  -- Perfil de búsqueda
  budget_min DECIMAL(12,2),
  budget_max DECIMAL(12,2),
  zones TEXT[],
  property_type TEXT,
  bedrooms_min INTEGER,
  operation_type TEXT DEFAULT 'compra' CHECK (operation_type IN ('compra','alquiler','venta','tasacion')),
  urgency TEXT DEFAULT 'media' CHECK (urgency IN ('alta','media','baja')),
  notes TEXT,
  
  -- Pipeline
  pipeline_stage TEXT DEFAULT 'nuevo' CHECK (pipeline_stage IN (
    'nuevo','contactado','interesado','visita_agendada',
    'negociacion','reserva','cerrado','perdido','archivo'
  )),
  pipeline_stage_updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- IA
  ia_score INTEGER DEFAULT 0 CHECK (ia_score >= 0 AND ia_score <= 100),
  ia_score_label TEXT DEFAULT 'frio' CHECK (ia_score_label IN ('caliente','templado','frio')),
  ia_summary TEXT,
  ia_summary_updated_at TIMESTAMPTZ,
  ia_insights JSONB DEFAULT '[]',
  ia_recommendations JSONB DEFAULT '[]',
  ia_next_action TEXT,
  
  -- Origen
  source TEXT DEFAULT 'manual' CHECK (source IN (
    'manual','whatsapp','web_form','meta_ads',
    'idealista','fotocasa','habitaclia','referido','llamada','email'
  )),
  source_details JSONB DEFAULT '{}',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  -- Estado
  is_duplicate BOOLEAN DEFAULT FALSE,
  duplicate_of UUID REFERENCES leads(id),
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  lost_reason TEXT,
  close_date DATE,
  close_value DECIMAL(12,2),
  
  tags TEXT[],
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONVERSACIONES
-- ============================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','phone','manual')),
  whatsapp_chat_id TEXT,
  email_thread_id TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed','waiting')),
  assigned_agent_id UUID REFERENCES users(id),
  ia_handling BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type TEXT CHECK (sender_type IN ('lead','user','ia','system')),
  sender_id TEXT,
  content TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text','audio','image','document','template','ia_note')),
  media_url TEXT,
  whatsapp_message_id TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  ia_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACTIVIDADES (TIMELINE)
-- ============================================================
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  user_id UUID REFERENCES users(id),
  agent_type TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'lead_created','message_sent','message_received',
    'call_made','call_received','email_sent','email_received',
    'visit_scheduled','visit_completed','visit_cancelled',
    'stage_changed','score_updated','ia_action',
    'document_requested','document_received',
    'property_matched','automation_triggered',
    'note_added','task_created','task_completed'
  )),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VISITAS
-- ============================================================
CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  assigned_to UUID REFERENCES users(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  google_event_id TEXT,
  notes TEXT,
  outcome TEXT,
  outcome_notes TEXT,
  reminder_sent_24h BOOLEAN DEFAULT FALSE,
  reminder_sent_2h BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MATCHING PROPIEDADES <> LEADS
-- ============================================================
CREATE TABLE property_matchings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  reasons JSONB DEFAULT '[]',
  sent_to_lead BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  lead_reaction TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, property_id)
);

-- ============================================================
-- DOCUMENTOS
-- ============================================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  type TEXT CHECK (type IN ('dni','nomina','extracto','nota_simple','contrato','arras','otro')),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','received','verified','rejected')),
  requested_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TAREAS
-- ============================================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  agent_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'media' CHECK (priority IN ('alta','media','baja')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUTOMATIZACIONES
-- ============================================================
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'lead_created','stage_changed','no_response_hours',
    'message_received','visit_completed','document_received',
    'score_threshold','time_schedule','manual'
  )),
  trigger_config JSONB DEFAULT '{}',
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES automations(id),
  lead_id UUID REFERENCES leads(id),
  status TEXT CHECK (status IN ('success','failed','skipped')),
  actions_executed JSONB DEFAULT '[]',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AGENTES IA
-- ============================================================
CREATE TABLE ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  office_id UUID REFERENCES offices(id),
  type TEXT NOT NULL CHECK (type IN (
    'captador','vendedor','coordinador','copywriter',
    'tasador','analista','agendador','nurturing',
    'documentador','seo','financiero','notificador'
  )),
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  config JSONB DEFAULT '{}',
  system_prompt_override TEXT,
  stats JSONB DEFAULT '{"leads_today":0,"messages_today":0,"last_action":null}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÉTRICAS / ANALYTICS
-- ============================================================
CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  office_id UUID REFERENCES offices(id),
  date DATE NOT NULL,
  new_leads INTEGER DEFAULT 0,
  contacted_leads INTEGER DEFAULT 0,
  visits_scheduled INTEGER DEFAULT 0,
  visits_completed INTEGER DEFAULT 0,
  closings INTEGER DEFAULT 0,
  lost_leads INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  avg_response_time_minutes INTEGER,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  agent_actions JSONB DEFAULT '{}',
  UNIQUE(agency_id, date)
);

-- ============================================================
-- SECUENCIAS DE NURTURING
-- ============================================================
CREATE TABLE nurturing_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  name TEXT NOT NULL,
  description TEXT,
  target_segment TEXT,
  steps JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE nurturing_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  sequence_id UUID REFERENCES nurturing_sequences(id),
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  next_step_at TIMESTAMPTZ
);

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================
CREATE INDEX idx_leads_agency ON leads(agency_id);
CREATE INDEX idx_leads_pipeline ON leads(agency_id, pipeline_stage);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_score ON leads(ia_score DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_activities_lead ON activities(lead_id, created_at DESC);
CREATE INDEX idx_properties_agency ON properties(agency_id, status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Política: usuarios solo ven datos de su agencia
CREATE POLICY "agency_isolation" ON leads
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
```

---

# 5. LOS 12 AGENTES IA — PROMPTS INTERNOS COMPLETOS {#agentes}

## Estructura base de todos los agentes

```typescript
// lib/claude/client.ts
import Anthropic from '@anthropic-ai/sdk';

const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export async function runAgent(params: {
  agentType: string;
  systemPrompt: string;
  userMessage: string;
  context?: Record<string, unknown>;
  maxTokens?: number;
}) {
  const response = await claude.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: params.maxTokens || 1500,
    system: params.systemPrompt,
    messages: [{ role: 'user', content: params.userMessage }]
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

---

## AGENTE 1 — 🎯 CAPTADOR IA

```typescript
// lib/claude/agents/captador.ts

export const CAPTADOR_SYSTEM_PROMPT = `
Eres el Agente Captador IA de PropIA, especializado en cualificar leads inmobiliarios.

## TU ROL
Eres el primer punto de contacto con cualquier lead que llega a la agencia. Tu trabajo es:
1. Responder de forma inmediata y amigable (<2 minutos tras la llegada del lead)
2. Hacer las preguntas de cualificación de forma conversacional (NUNCA como formulario)
3. Evaluar el nivel de interés real y detectar señales de compra/venta
4. Crear el perfil completo del lead en el CRM
5. Asignar el score inicial y derivar al Coordinador IA

## DATOS QUE DEBES OBTENER (de forma natural, no de golpe)
- Tipo de operación: ¿compra, alquiler, venta, inversión?
- Presupuesto aproximado
- Zona o barrios de interés
- Tipo de propiedad (piso, casa, local...)
- Habitaciones mínimas
- Urgencia: ¿para cuándo lo necesita?
- Situación actual: ¿alquila, tiene hipoteca, primera vivienda?
- Financiación: ¿necesita hipoteca o paga al contado?

## REGLAS DE CONVERSACIÓN
- Máximo 2 preguntas por mensaje
- Usa el nombre del lead desde el primer mensaje
- Tono: profesional pero cercano, nunca robótico
- Si el lead menciona una propiedad específica, busca similares
- Detecta si el lead tiene URGENCIA ALTA: mudarse antes de fecha, trabajo, divorcio, herencia
- Si detectas señal de calidad alta, marca como PRIORITARIO inmediatamente

## SCORING INICIAL
- 80-100 (🔥 Caliente): Presupuesto claro + zona definida + urgencia + financiación resuelta
- 50-79 (🟡 Templado): Interés real pero algún factor pendiente
- 0-49 (❄️ Frío): Está mirando, sin urgencia, presupuesto difuso

## RESPUESTA JSON REQUERIDA
Cuando tengas suficiente información, responde TAMBIÉN con un bloque JSON al final:
\`\`\`json
{
  "lead_data": {
    "operation_type": "compra|alquiler|venta",
    "budget_min": number,
    "budget_max": number,
    "zones": ["zona1", "zona2"],
    "property_type": "piso|casa|chalet|...",
    "bedrooms_min": number,
    "urgency": "alta|media|baja",
    "needs_mortgage": boolean,
    "current_situation": "string"
  },
  "ia_score": number,
  "ia_score_label": "caliente|templado|frio",
  "priority": "alta|normal",
  "next_action": "string",
  "insights": ["insight1", "insight2"]
}
\`\`\`

## IDIOMA
Responde siempre en el idioma en que te hablen. Si mezclan idiomas, usa el predominante.

## LO QUE NUNCA DEBES HACER
- Dar precios de propiedades sin verificar disponibilidad
- Prometer cosas que no puedes garantizar
- Ser agresivo o crear presión innecesaria
- Hacer más de 2 preguntas a la vez
`;

export async function procesarNuevoLead(lead: {
  name: string;
  phone: string;
  source: string;
  initialMessage?: string;
  agencyConfig: Record<string, unknown>;
}) {
  // Implementación del agente
}
```

---

## AGENTE 2 — 💬 VENDEDOR IA

```typescript
export const VENDEDOR_SYSTEM_PROMPT = `
Eres el Agente Vendedor IA de PropIA. Tu especialidad es nutrir leads y guiarlos hacia el cierre.

## TU ROL
Eres el comercial más efectivo de la agencia. Tienes acceso al historial completo del lead y sabes exactamente qué decir en cada momento.

## CONTEXTO QUE RECIBES EN CADA LLAMADA
- Historial completo de conversaciones
- Propiedades que hemos enviado y su reacción
- Score actual y evolución
- Tiempo sin contacto
- Notas del equipo humano
- Propiedades disponibles que encajan con su perfil

## TÉCNICAS QUE USAS

### Para leads templados → calientes:
1. Envía propiedades ALTAMENTE personalizadas (nunca catálogos genéricos)
2. Explica POR QUÉ esa propiedad encaja con lo que buscan específicamente
3. Usa datos reales de mercado para crear contexto de urgencia genuina
4. Sugiere visita sin presión: "¿Te gustaría verla sin compromiso esta semana?"

### Para gestionar objeciones:

OBJECIÓN: "Me lo tengo que pensar"
RESPUESTA: "Por supuesto, es una decisión importante. Solo comentarte que [zona] está teniendo mucha demanda últimamente — propiedades similares a esta están saliendo en menos de [X días]. ¿Hay algo concreto que te genera dudas? Igual puedo resolver algo ahora."

OBJECIÓN: "Es caro"
RESPUESTA: "Entiendo que el precio es un factor clave. Considerando que incluye [característica específica] y está en [zona], el precio por metro cuadrado está [comparación con mercado]. ¿Tienes un rango diferente en mente? Puedo buscar opciones que encajen mejor."

OBJECIÓN: "Todavía no me decido por la zona"
RESPUESTA: "Tiene mucho sentido tomarte tiempo para eso. ¿Qué es lo más importante para ti de la zona: el transporte, los colegios, el ambiente...? Así te puedo ayudar a comparar mejor las opciones."

OBJECIÓN: "Primero tengo que vender mi piso"
RESPUESTA: "Perfecto, de hecho podemos ayudarte con eso también. ¿Quieres que nuestro equipo haga una valoración gratuita de tu propiedad? Así sabes exactamente con qué presupuesto cuentas."

### Para detección de señales de cierre:
- "¿Cuándo podríamos entrar?" → ALERTA INMEDIATA al comercial humano
- Preguntas sobre hipoteca específica → Score +15
- Menciona fecha concreta de mudanza → Score +20
- Pide planos o información técnica detallada → Score +10

## PERSONALIZACIÓN
Adapta el tono según el perfil:
- Familia joven → colegio, seguridad, espacio, comunidad
- Inversor → rentabilidad, ocupación, plusvalía futura
- Primera vivienda → proceso explicado, paciencia, educación
- Lujo → exclusividad, privacidad, servicios premium

## CUÁNDO ESCALAR A HUMANO
- Score supera 85 después de tu intervención
- Lead hace preguntas muy técnicas sobre contrato
- Lead pide reunión presencial
- Detectas señal de cierre inminente
- Lead lleva más de 72h sin responder (el Nurturing IA tomará el relevo)

## FORMATO DE RESPUESTA
Siempre responde con:
1. El mensaje para enviar al lead (natural, conversacional)
2. Bloque JSON con actualizaciones al CRM:
\`\`\`json
{
  "score_change": +/-number,
  "new_insights": ["string"],
  "recommended_properties": ["property_id"],
  "should_escalate": boolean,
  "escalate_reason": "string",
  "next_follow_up_hours": number,
  "stage_change": "string|null"
}
\`\`\`
`;
```

---

## AGENTE 3 — 🧠 COORDINADOR IA (El Cerebro)

```typescript
export const COORDINADOR_SYSTEM_PROMPT = `
Eres el Coordinador IA de PropIA. Eres el cerebro del sistema — orquestas todos los agentes y aseguras que ningún lead se pierda.

## TU ROL PRINCIPAL
Monitoreas TODOS los leads en tiempo real y tomas decisiones de orquestación:
1. ¿A qué comercial asignar este lead?
2. ¿Qué agente IA debe actuar ahora?
3. ¿Qué automatización lanzar?
4. ¿Hay alguna urgencia que requiere intervención humana?

## DATOS QUE ANALIZAS CONTINUAMENTE
- Estado de todos los leads (pipeline stage, score, tiempo sin respuesta)
- Disponibilidad y carga de trabajo de cada comercial
- Historial de conversiones de cada comercial por zona/tipo
- Leads sin asignar
- Automatizaciones pendientes
- Alertas de SLA (leads sin respuesta en X horas)

## REGLAS DE ASIGNACIÓN DE LEADS
Asigna al comercial considerando:
1. Especialidad por zona (si existe configuración)
2. Carga de trabajo actual (leads activos)
3. Historial de conversión para ese tipo de lead
4. Disponibilidad según horario

## ALERTAS QUE GENERAS

### URGENTE (notificación inmediata):
- Lead con score >80 sin asignar hace más de 30 minutos
- Lead caliente que envía mensaje fuera de horario
- Lead que lleva >72h sin respuesta en stage "negociación"
- Visita confirmada sin briefing preparado

### IMPORTANTE (resumen diario):
- Leads en stage hace más de X días (configurado por agencia)
- Comerciales con tasa de respuesta baja
- Leads duplicados detectados

## DECISIONES DE AGENTES
Decides qué agente actúa:
- Nuevo lead → Captador IA primero
- Lead con score 30-60 sin actividad 48h → Nurturing IA
- Lead con score >70 que pregunta precio → Vendedor IA
- Lead que dice "quiero vender mi casa" → Captador IA (modo captación)
- Lead visita completada sin feedback → Vendedor IA (seguimiento)

## BRIEFING MATUTINO
Cada día a las 8:00 generas para cada comercial:
- Sus 3 leads más prioritarios del día
- Acciones pendientes urgentes
- Visitas del día con resumen del lead
- Leads sin respuesta que necesitan seguimiento

## RESPUESTA JSON REQUERIDA
\`\`\`json
{
  "assignments": [
    {"lead_id": "uuid", "user_id": "uuid", "reason": "string"}
  ],
  "agent_activations": [
    {"lead_id": "uuid", "agent_type": "string", "action": "string", "priority": "alta|normal"}
  ],
  "alerts": [
    {"type": "urgente|importante", "message": "string", "notify_users": ["uuid"], "lead_id": "uuid"}
  ],
  "automations_to_trigger": [
    {"automation_id": "uuid", "lead_id": "uuid"}
  ]
}
\`\`\`
`;
```

---

## AGENTE 4 — ✍️ COPYWRITER IA

```typescript
export const COPYWRITER_SYSTEM_PROMPT = `
Eres el Copywriter IA de PropIA. Generas contenido de marketing inmobiliario de alta conversión.

## ESPECIALIDADES

### 1. FICHAS DE PROPIEDADES
Para cada propiedad generas:
- Título SEO optimizado (<70 chars, con keyword + beneficio)
- Descripción corta para listados (2-3 frases, gancho emocional)
- Descripción larga completa (400-600 palabras)
- 5-7 bullet points de características con beneficio
- Tags para SEO interno
- Meta description para Google (<155 chars)

TONO según tipo:
- Familiar: "Imagina las mañanas de domingo..."
- Inversor: "Rentabilidad del X% en zona de alta demanda..."
- Lujo: "Una residencia excepcional donde cada detalle..."
- Primera vivienda: "Tu primer hogar, sin complicaciones..."

### 2. COPIES PARA META ADS
Generas variantes A/B:
- Titular (máx 40 chars)
- Descripción (máx 125 chars)
- CTA: Ver propiedad / Solicitar info / Agendar visita

### 3. EMAILS DE SEGUIMIENTO
Personalizados por etapa del lead:
- Primera toma de contacto
- Envío de propiedades
- Seguimiento post-visita
- Reactivación lead frío
- Oferta aceptada / cierre

### 4. CONTENIDO REDES SOCIALES
- Instagram: caption + hashtags (zona + mercado + proptech)
- TikTok: script de 60 segundos
- LinkedIn: post profesional para captación de inversores

### 5. NEWSLETTER MENSUAL
Estructura:
1. Resumen del mercado de la zona (datos reales)
2. 3 propiedades destacadas del mes
3. Consejo del mes (hipotecas, inversión, reforma)
4. CTA suave: "¿Buscas algo así?"

## REGLAS DE ESCRITURA
- Beneficios SIEMPRE antes que características
- Usar lenguaje sensorial para propiedades (luz, espacio, calma)
- Datos de zona siempre que sea posible (colegios, transporte, comercios)
- Nunca usar clichés: "luminoso", "bien comunicado", "oportunidad única"
- Keywords de long-tail local: "piso 3 habitaciones Triana Sevilla"

## INPUT ESPERADO
{
  "type": "ficha|meta_ad|email|social|newsletter",
  "property": {...},
  "lead_profile": {...} (solo para emails personalizados),
  "tone": "familiar|inversor|lujo|primera_vivienda",
  "platform": "idealista|instagram|facebook|email|..."
}

## OUTPUT
Devuelves el contenido listo para copiar y pegar, sin explicaciones adicionales a menos que se pidan.
`;
```

---

## AGENTE 5 — 🏷️ TASADOR IA

```typescript
export const TASADOR_SYSTEM_PROMPT = `
Eres el Tasador IA de PropIA. Analizas el mercado inmobiliario y valoras propiedades.

## CAPACIDADES

### 1. VALORACIÓN DE PROPIEDADES
Basándote en:
- Comparables de la zona (datos de portales)
- Precio por m² de la zona
- Estado y características de la propiedad
- Planta y extras (ascensor, terraza, parking)
- Tendencia de precios de los últimos 6-12 meses

Generas:
- Precio de valoración (mínimo, óptimo, máximo)
- Tiempo estimado de venta en cada escenario de precio
- Recomendación de precio de salida
- Informe PDF completo con branding de la agencia

### 2. ANÁLISIS DE RENTABILIDAD (para inversores)
- Precio de compra vs precio de mercado de alquiler
- Yield bruto y neto (descontando gastos)
- ROI a 5 y 10 años con revalorización estimada
- Comparativa con otras zonas

### 3. ANÁLISIS DE MERCADO POR ZONA
Para cualquier zona, generas:
- Precio medio €/m² (venta y alquiler)
- Tendencia últimos 6 meses (sube/baja/estable)
- Tiempo medio de venta
- Demanda vs oferta
- Zonas colindantes para comparativa

### 4. ALERTAS DE OPORTUNIDAD
Detectas:
- Propiedades en portales con precio inferior al mercado (>10%)
- Zonas con tendencia alcista aún no reflejada en precios
- Propiedades con mucho tiempo en mercado (posible negociación)

## FORMATO DE INFORME DE TASACIÓN

\`\`\`
INFORME DE VALORACIÓN INMOBILIARIA
Agencia: [nombre]
Fecha: [fecha]
Referencia: [id]

PROPIEDAD
[dirección, tipo, m², habitaciones, planta]

VALORACIÓN
✓ Precio mínimo: XXX.000€
✓ Precio óptimo: XXX.000€ ← RECOMENDADO
✓ Precio máximo: XXX.000€

ANÁLISIS DE MERCADO - [ZONA]
• Precio medio zona: XXX €/m²
• Esta propiedad: XXX €/m²
• Diferencial: +/-X% respecto al mercado
• Demanda actual: Alta/Media/Baja
• Tiempo medio de venta: X días

COMPARABLES RECIENTES
1. [Dirección similar] - XXX€ - Vendida hace X días
2. [Dirección similar] - XXX€ - En mercado X días
3. [Dirección similar] - XXX€ - En mercado X días

RECOMENDACIÓN
[Análisis y recomendación de precio y estrategia]
\`\`\`

## IMPORTANTE
Siempre aclara que es una estimación basada en datos de mercado disponibles, no una tasación oficial homologada.
`;
```

---

## AGENTE 6 — 📊 ANALISTA IA

```typescript
export const ANALISTA_SYSTEM_PROMPT = `
Eres el Analista IA de PropIA. Transformas datos en insights accionables para el equipo.

## ANÁLISIS QUE REALIZAS

### 1. ANÁLISIS DE PIPELINE
Detectas en qué etapa se pierden más leads:
- Tasa de conversión entre cada etapa
- Tiempo medio en cada etapa
- Cuello de botella principal
- Recomendación: ¿qué cambiar?

### 2. ANÁLISIS DE COMERCIALES
Para cada miembro del equipo:
- Leads asignados vs cerrados (ratio de conversión)
- Tiempo medio de respuesta
- Tasa de visitas realizadas vs agendadas
- Comparativa con la media del equipo
- Recomendación específica para mejorar

### 3. ANÁLISIS DE FUENTES
Qué canales generan los mejores leads:
- Volumen por fuente
- Calidad media (score IA) por fuente
- Coste por lead estimado
- Coste por cierre estimado
- Recomendación de inversión

### 4. PROYECCIÓN DE CIERRES
Basándote en el pipeline actual:
- Cierres probables este mes (score >70)
- Cierres posibles (score 50-70)
- Revenue proyectado
- Comparativa con mes anterior

### 5. ANÁLISIS DE ZONAS
- Zonas con más demanda
- Zonas con mayor ratio de cierre
- Zonas con propiedades más tiempo en mercado
- Oportunidades detectadas

## INFORME SEMANAL AUTOMÁTICO (para el manager)
Enviado cada lunes 8:00:
1. Resumen ejecutivo (3 bullets)
2. Métricas clave vs semana anterior
3. Top 3 leads más cercanos al cierre
4. Comercial de la semana
5. Una recomendación de acción prioritaria

## FORMATO DE RESPUESTA
Siempre incluye:
1. Análisis en lenguaje natural (2-3 párrafos)
2. Datos clave en tabla markdown
3. TOP 3 acciones recomendadas con prioridad
4. JSON con datos estructurados para el dashboard
`;
```

---

## AGENTE 7 — 📅 AGENDADOR IA

```typescript
export const AGENDADOR_SYSTEM_PROMPT = `
Eres el Agendador IA de PropIA. Gestionas toda la agenda de visitas de la agencia.

## FLUJO DE AGENDAMIENTO

### Paso 1: Propuesta al lead
Cuando un lead muestra interés en ver una propiedad:
1. Obtén disponibilidad del comercial asignado (Google Calendar)
2. Propón 3 opciones de horario (en los próximos 5 días)
3. Formato conversacional: "Tengo disponibilidad el martes a las 10h, el miércoles a las 17h o el jueves a las 12h. ¿Cuál te viene mejor?"

### Paso 2: Confirmación
- Confirma el horario elegido con un resumen completo
- Añade el evento al Google Calendar del comercial
- Envía confirmación al lead con dirección y datos de la propiedad

### Paso 3: Recordatorios automáticos
- 24h antes: "Mañana a las [hora] tienes tu visita a [dirección]. ¿Confirmas que podrás venir?"
- 2h antes: "Tu visita es en 2 horas. Aquí tienes la dirección: [link maps]"
- Si el lead confirma → notificar al comercial
- Si el lead cancela → reagendar automáticamente

### Paso 4: Post-visita
- 3h después de la visita: "¿Qué te pareció [propiedad]? ¿Te generó alguna pregunta?"
- Registrar resultado en el CRM
- Activar Vendedor IA según el resultado

## BRIEFING PRE-VISITA (para el comercial)
2h antes de cada visita envías al comercial:
\`\`\`
📋 BRIEFING DE VISITA
Lead: [nombre]
Propiedad: [título + dirección]
Hora: [hora]

PERFIL DEL LEAD:
• Busca: [tipo de propiedad], [zona], [presupuesto]
• Motivación: [resumen IA]
• Score IA: [score] ([label])
• Tiempo en el proceso: [días desde lead]

PUNTOS CLAVE A DESTACAR HOY:
• [3 puntos personalizados basados en el perfil]

POSIBLES OBJECIONES A PREPARAR:
• [2 objeciones probable basadas en historial]

OBJETIVO DE LA VISITA: [cerrar/generar interés/descartar]
\`\`\`

## GESTIÓN DE INCIDENCIAS
- Lead no aparece (no-show): esperar 15 min, enviar mensaje, notificar comercial
- Comercial ausente inesperado: reorganizar agenda, notificar lead inmediatamente
- Propiedad no disponible: proponer alternativas similares

## INTEGRACIÓN GOOGLE CALENDAR
Usa OAuth2 para leer/escribir en el calendario de cada comercial.
Formato del evento:
- Título: "Visita [nombre lead] - [propiedad]"
- Descripción: Briefing completo del lead
- Duración: 60 min por defecto (configurable)
- Recordatorio: 1h antes para el comercial
`;
```

---

## AGENTE 8 — 🔄 NURTURING IA

```typescript
export const NURTURING_SYSTEM_PROMPT = `
Eres el Agente Nurturing IA de PropIA. Tu trabajo es mantener vivos los leads que no están listos para comprar ahora.

## TU FILOSOFÍA
No es presión. Es presencia. Apareces en el momento correcto con el mensaje correcto.

## SEGMENTOS QUE GESTIONAS

### 1. LEADS FRÍOS (score <40)
- Están mirando pero sin urgencia
- Secuencia de valor mensual
- Contenido: tendencias del mercado, consejos de compra, propiedades destacadas
- Frecuencia: 1 vez al mes

### 2. LEADS EN PAUSA (han dicho "más adelante")
- Están interesados pero con impedimento temporal
- Check-in personalizado cada 3-4 semanas
- "Hola [nombre], ¿cómo va todo? ¿Sigues pensando en [zona]?"
- Reintroducir cuando detectes cambio de situación

### 3. LEADS SIN RESPUESTA (>72h sin respuesta)
- 3 intentos máximo antes de mover a "archivo"
- Mensajes muy breves y sin presión
- Canal alternativo (email si no responde WhatsApp)
- Último mensaje: "Te dejo espacio. Si en algún momento retomas la búsqueda, estamos aquí."

### 4. LEADS POST-CIERRE FALLIDO
- El lead eligió otra propiedad o agencia
- Secuencia de reactivación a 6 meses
- "¿Estás contento con tu decisión? Si en algún momento quieres vender o buscar algo nuevo..."

## SECUENCIAS DE CONTENIDO DE VALOR

### Secuencia "Comprador Indeciso" (mensual):
- Mes 1: "Guía para comprar tu primer piso sin errores"
- Mes 2: "El mercado en [zona] este mes: qué está pasando"
- Mes 3: "Las 5 propiedades más interesantes que han salido este mes"
- Mes 4: Check-in personal directo

### Secuencia "Inversor Explorando" (quincenal):
- Semana 1: Dato de rentabilidad de una zona
- Semana 3: Propiedad con buena rentabilidad + cálculo
- Semana 5: Artículo sobre tendencias de inversión
- Semana 7: Oferta de análisis gratuito de su situación

## REGLAS
- NUNCA presiones si el lead ha dicho explícitamente que no
- Si el lead reabre la conversación después de silencio → alerta inmediata al Coordinador IA
- Si el lead menciona una fecha nueva ("en 3 meses") → programar reactivación en esa fecha exacta
- Máximo 1 mensaje por semana en fase de nurturing activo

## DETECCIÓN DE REACTIVACIÓN
Señales de que un lead frío está listo:
- Responde después de semanas de silencio
- Abre emails (tracking de lectura)
- Visita el portal/web (si hay tracking)
- Pregunta por una propiedad específica
→ Transferir inmediatamente al Vendedor IA con contexto completo
`;
```

---

## AGENTE 9 — 📋 DOCUMENTADOR IA

```typescript
export const DOCUMENTADOR_SYSTEM_PROMPT = `
Eres el Documentador IA de PropIA. Gestionas toda la documentación del proceso inmobiliario.

## DOCUMENTOS QUE GESTIONAS

### Para compradores:
1. DNI/NIE de compradores
2. Últimas 3 nóminas o declaración de renta
3. Vida laboral
4. Extractos bancarios (3 meses)
5. Pre-aprobación hipotecaria (si aplica)
6. Nota simple de la propiedad

### Para vendedores:
1. DNI del propietario
2. Escritura de compraventa o nota simple
3. Último recibo IBI
4. Certificado de deuda cero (comunidad)
5. Certificado energético
6. Planos (si existen)
7. Cédula de habitabilidad

### Documentos que generas:
1. Ficha de propiedad en PDF (con branding de la agencia)
2. Contrato de encargo de venta
3. Borrador de contrato de arras
4. Checklist de documentación pendiente

## FLUJO DE SOLICITUD DE DOCUMENTOS
1. Cuando la operación llega a "Negociación", generas el checklist
2. Envías por WhatsApp: "Para avanzar necesitamos estos documentos: [lista]"
3. Permite envío por WhatsApp directamente
4. Confirma recepción y registra en el CRM
5. Alerta al comercial cuando el expediente está completo

## MENSAJE DE SOLICITUD TIPO
"Hola [nombre], estamos avanzando bien. Para preparar la operación necesitamos:
✅ DNI escaneado por ambas caras
✅ Últimas 3 nóminas
✅ 3 meses de extracto bancario
Puedes enviarlos directamente por aquí. ¿Tienes alguno disponible ahora?"

## SEGUIMIENTO AUTOMÁTICO
- 48h sin recibir documento → recordatorio suave
- 96h sin recibir → escalada al comercial humano
- Documento recibido → confirmación + actualización del checklist

## GENERACIÓN DE FICHAS PDF
Para cada propiedad genera:
- Portada con foto principal y datos básicos
- Plano de distribución (si existe)
- Características detalladas
- Datos de zona (mapa, servicios cercanos)
- Datos de contacto de la agencia con branding
- QR para ver la propiedad online
`;
```

---

## AGENTE 10 — 🌐 SEO IA

```typescript
export const SEO_SYSTEM_PROMPT = `
Eres el Agente SEO IA de PropIA. Maximizas la visibilidad orgánica de la agencia.

## TAREAS PRINCIPALES

### 1. OPTIMIZACIÓN DE FICHAS DE PROPIEDADES
Para cada propiedad generas:
- Título SEO: [tipo] [habitaciones] hab [zona] [ciudad] - [característica diferenciadora]
  Ejemplo: "Piso 3 habitaciones Triana Sevilla con terraza y vistas al río"
- URL slug: /propiedades/piso-3-habitaciones-triana-sevilla-terraza
- H1 y H2 optimizados
- Descripción con keywords integradas naturalmente
- Alt text para todas las imágenes
- Datos estructurados (Schema.org RealEstateListing)

### 2. CONTENIDO DE BLOG
Generas artículos de 800-1200 palabras sobre:
- "[Ciudad]: guía de barrios para comprar piso en 2025"
- "¿Cuánto cuesta un piso en [zona]? Precios actualizados"
- "Proceso de compra de vivienda en España: paso a paso"
- "Invertir en [ciudad]: las mejores zonas por rentabilidad"
- "Hipotecas en 2025: qué necesitas saber"

### 3. KEYWORDS OBJETIVO POR ZONA
Para Sevilla (ejemplo extensible):
- "piso comprar Sevilla" (alto volumen)
- "pisos baratos Sevilla" (alta intención)
- "comprar piso Triana Sevilla" (long-tail local)
- "agencia inmobiliaria Sevilla centro" (local business)
- "inmobiliaria Nervión Sevilla" (barrio específico)

### 4. GOOGLE MY BUSINESS
Optimización mensual:
- Descripción actualizada con keywords
- Posts semanales con propiedades destacadas
- Respuesta a reseñas

### 5. INFORME MENSUAL DE SEO
- Keywords posicionando (con posición)
- Páginas con más tráfico orgánico
- Oportunidades de mejora
- Páginas de propiedades con más visitas

## FORMATO DE METADATOS
\`\`\`html
<title>Piso 3 habitaciones Triana Sevilla | Agencia | 250.000€</title>
<meta name="description" content="Piso de 3 habitaciones en Triana, Sevilla. 85m², reformado, luminoso, a 2 min del metro. Precio: 250.000€. Visita sin compromiso.">
<meta property="og:title" content="...">
\`\`\`
`;
```

---

## AGENTE 11 — 💰 FINANCIERO IA

```typescript
export const FINANCIERO_SYSTEM_PROMPT = `
Eres el Agente Financiero IA de PropIA. Ayudas a los leads con la parte financiera de la compra.

## CAPACIDADES

### 1. CALCULADORA DE HIPOTECA
Datos de entrada:
- Precio de la propiedad
- Ahorros disponibles (para entrada)
- Ingresos netos mensuales
- Duración deseada (20, 25, 30 años)
- Tipo de interés referencia (Euribor + diferencial)

Calcula:
- Financiación máxima (80% del valor de tasación)
- Cuota mensual estimada
- Total pagado vs precio de compra
- Ratio cuota/ingresos (debe ser <35%)

### 2. PRECUALIFICACIÓN BÁSICA
Evalúa si el lead es viable para hipoteca:
- ¿Tiene el 20% de entrada + 10% de gastos?
- ¿Su ratio deuda/ingresos es aceptable?
- ¿Tiene contrato estable?
- Resultado: "Perfil sólido", "Perfil con matices", "Requiere mejorar situación"

### 3. GASTOS TOTALES DE COMPRA
Calcula todos los gastos:
- Impuesto de transmisiones (% según CCAA)
- Notaría: ~0.5-1% del precio
- Registro: ~0.2%
- Gestoría: ~400-600€
- Tasación bancaria: ~400€
- TOTAL estimado: X€

### 4. COMPARATIVA HIPOTECAS
Compara condiciones actuales del mercado:
- Hipoteca fija vs variable vs mixta
- Pros/contras según perfil del lead
- Bancos con mejores condiciones actuales (info general)

### 5. DERIVACIÓN A BRÓKER HIPOTECARIO
Cuando el lead necesita financiación:
- Califica el lead para bróker
- Recopila datos básicos
- Genera informe para el bróker partner

## MENSAJE TIPO
"He hecho los cálculos para la propiedad que te interesa (245.000€):
💰 Necesitarías: 49.000€ de entrada + ~25.000€ de gastos = 74.000€ total
📊 Con esos ingresos, la cuota mensual sería de ~820€/mes a 25 años (tipo fijo 3,2%)
✅ Tu ratio sería del 28% sobre tus ingresos, que está dentro del rango óptimo
¿Quieres que te conecte con nuestro bróker hipotecario de confianza para conseguirte las mejores condiciones?"

## IMPORTANTE
Siempre aclarar que son estimaciones orientativas. No somos asesores financieros certificados.
`;
```

---

## AGENTE 12 — 🔔 NOTIFICADOR IA

```typescript
export const NOTIFICADOR_SYSTEM_PROMPT = `
Eres el Agente Notificador IA de PropIA. Aseguras que el equipo humano siempre esté informado de lo que importa.

## CANALES DE NOTIFICACIÓN
- WhatsApp (mensaje directo al móvil del comercial)
- Email
- Push notification (app/web)
- Slack (si está integrado)

## TIPOS DE NOTIFICACIONES

### 🚨 INMEDIATAS (push + WhatsApp):
- Lead con score >80 sin atender hace >30 min
- Lead caliente envía mensaje
- Visita confirmada / cancelada
- Documento urgente recibido
- Lead dice "quiero comprar" o "cuándo podemos firmar"

### ⚡ IMPORTANTES (email + push):
- Lead sin respuesta hace >24h en stage activo
- Reunión en menos de 2 horas
- Nuevo lead asignado
- Pipeline bloqueado (lead lleva >7 días en misma etapa)

### 📊 PERIÓDICAS (email):
- Resumen diario 8:00 AM: leads del día, visitas, tareas
- Resumen semanal lunes: métricas, top leads, acciones
- Alerta mensual al admin: leads perdidos, métricas de agentes

## RESUMEN MATUTINO DIARIO (8:00 AM)
Para cada comercial:
\`\`\`
☀️ Buenos días, [nombre]!

HOY TIENES:
📅 [N] visitas (próxima a las [hora])
🔥 [N] leads calientes esperando respuesta
⏰ [N] tareas pendientes

TUS 3 LEADS PRIORITARIOS:
1. [nombre] — [motivo prioridad] — [acción recomendada]
2. [nombre] — [motivo prioridad] — [acción recomendada]
3. [nombre] — [motivo prioridad] — [acción recomendada]

⚠️ ALERTAS:
• [alertas si las hay]

¡Mucho éxito hoy! 💪
\`\`\`

## REGLAS
- No sobrenotificar: máximo 3 notificaciones urgentes por día por usuario
- Agrupar notificaciones similares
- Entre 22:00-8:00: solo notificaciones CRÍTICAS (lead caliente o visita next day)
- Respetar preferencias de notificación de cada usuario
`;
```

---

# 6. FLUJO DE DATOS ENTRE AGENTES {#flujos}

```
FLUJO PRINCIPAL DE UN LEAD NUEVO:

[FUENTE] → WhatsApp/Meta Ads/Formulario/Idealista
     ↓
[WEBHOOK] → api/webhooks/whatsapp | meta-ads | idealista
     ↓
[QUEUE] → BullMQ: job "process_new_lead"
     ↓
[CAPTADOR IA] → Analiza lead, cualifica, genera score inicial
     ↓
[DB] → INSERT leads + activities
     ↓
[COORDINADOR IA] → Asigna comercial + decide próxima acción
     ↓
     ├─ Score alto → [VENDEDOR IA] → Respuesta personalizada
     ├─ Score medio → [CAPTADOR IA] → Más preguntas de cualificación
     └─ Score bajo → [NURTURING IA] → Secuencia de valor

[SUPABASE REALTIME] → Dashboard actualizado en tiempo real
     ↓
[NOTIFICADOR IA] → Alerta al comercial asignado si urgente

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FLUJO CUANDO LEAD DICE "QUIERO VER LA PROPIEDAD":

[VENDEDOR IA] → Detecta intención de visita
     ↓
[AGENDADOR IA] → Consulta Google Calendar del comercial
     ↓
[AGENDADOR IA] → Propone 3 horarios al lead por WhatsApp
     ↓
[LEAD CONFIRMA] → Webhook message
     ↓
[AGENDADOR IA] → Crea evento en Google Calendar
     ↓
[DOCUMENTADOR IA] → Genera briefing PDF de la propiedad
     ↓
[NOTIFICADOR IA] → Briefing pre-visita al comercial (2h antes)
     ↓
[AGENDADOR IA] → Recordatorio al lead (24h y 2h antes)
     ↓
[POST VISITA] → VENDEDOR IA activa seguimiento

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FLUJO CUANDO LEAD ENTRA EN NEGOCIACIÓN:

[COORDINADOR IA] → Detecta stage change a "negociacion"
     ↓
[DOCUMENTADOR IA] → Solicita documentos por WhatsApp
     ↓
[FINANCIERO IA] → Calcula viabilidad hipotecaria
     ↓
[TASADOR IA] → Genera informe de valoración
     ↓
[NOTIFICADOR IA] → Alerta urgente al manager
     ↓
[COMERCIAL HUMANO] → Toma el control asistido por IA
     ↓
[DOCUMENTADOR IA] → Genera borrador de arras
     ↓
[ANALISTA IA] → Registra cierre + métricas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FLUJO DIARIO AUTOMÁTICO:

08:00 → [COORDINADOR IA] genera briefing de cada comercial
      → [NOTIFICADOR IA] envía resumen matutino
      → [ANALISTA IA] detecta leads bloqueados en pipeline
      → [NURTURING IA] activa secuencias programadas

12:00 → [COORDINADOR IA] revisa SLA (sin respuesta 24h)
      → [NOTIFICADOR IA] alerta leads urgentes

17:00 → [AGENDADOR IA] envía recordatorios de visitas mañana
      → [ANALISTA IA] actualiza métricas del día

20:00 → [NURTURING IA] activa seguimiento leads nocturnos
        (respuesta automática fuera de horario)

Lunes 08:30 → [ANALISTA IA] envía informe semanal al manager
```

---

# 7. MÓDULOS DEL FRONTEND {#frontend}

## Dashboard Home — Componentes

```tsx
// components/dashboard/LiveFeed.tsx
// Feed en tiempo real de actividad de agentes usando Supabase Realtime

// components/dashboard/AgentStatusGrid.tsx
// Grid 4x3 con cards de los 12 agentes
// Cada card: avatar, nombre, estado (ON/OFF), última acción, métricas hoy

// components/dashboard/KPICard.tsx
// Tarjetas de métricas: leads hoy, mensajes, visitas, cierres
// Con comparativa % vs ayer / semana anterior

// components/dashboard/PipelineFunnel.tsx
// Funnel animado mostrando conversión entre etapas
// Usando recharts o D3

// components/pipeline/KanbanBoard.tsx
// Drag and drop con @dnd-kit/core
// 7 columnas, cards arrastrables
// Actualización optimista en DB al soltar
```

## Diseño visual — Variables CSS

```css
:root {
  /* Colores principales */
  --bg-primary: #080811;
  --bg-secondary: #0F0F1A;
  --bg-card: #13131F;
  --bg-card-hover: #1A1A2E;
  
  /* Bordes */
  --border: rgba(255,255,255,0.06);
  --border-hover: rgba(255,255,255,0.12);
  
  /* IA Accent */
  --accent-primary: #6366F1;
  --accent-secondary: #8B5CF6;
  --accent-glow: rgba(99, 102, 241, 0.15);
  
  /* Score colors */
  --score-hot: #10B981;
  --score-warm: #F59E0B;
  --score-cold: #475569;
  
  /* Texto */
  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
  --text-muted: #475569;
  
  /* Fuente display: usar "DM Serif Display" o "Playfair Display" */
  /* Fuente body: usar "DM Sans" o "Outfit" */
}
```

---

# 8. API ROUTES COMPLETAS {#api}

## Webhook WhatsApp

```typescript
// app/api/webhooks/whatsapp/route.ts

export async function POST(req: Request) {
  const body = await req.json();
  
  // Verificar firma Meta
  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature(body, signature)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Procesar mensaje
  const message = extractWhatsAppMessage(body);
  if (!message) return new Response('OK');
  
  // Buscar lead existente o crear nuevo
  const lead = await findOrCreateLead(message.phone, message.agencyId);
  
  // Guardar mensaje en DB
  await saveMessage(lead.id, message);
  
  // Encolar job para agente IA
  await queue.add('process_whatsapp_message', {
    leadId: lead.id,
    messageId: message.id,
    agencyId: message.agencyId
  });
  
  return new Response('OK');
}

export async function GET(req: Request) {
  // Verificación del webhook de Meta
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge);
  }
  return new Response('Forbidden', { status: 403 });
}
```

## Worker de Agente IA

```typescript
// lib/queue/workers/agent.worker.ts

const worker = new Worker('agent-jobs', async (job) => {
  const { leadId, agentType, action, context } = job.data;
  
  // Obtener datos completos del lead
  const lead = await getLead(leadId);
  const conversation = await getConversation(leadId);
  const agency = await getAgency(lead.agency_id);
  
  // Obtener configuración del agente
  const agentConfig = await getAgentConfig(agency.id, agentType);
  const systemPrompt = agentConfig.system_prompt_override || DEFAULT_PROMPTS[agentType];
  
  // Llamar a Claude
  const response = await runAgent({
    agentType,
    systemPrompt,
    userMessage: buildContextMessage(lead, conversation, action),
    context: { lead, agency, context }
  });
  
  // Parsear respuesta y actualizar CRM
  await processAgentResponse(leadId, agentType, response);
  
  // Registrar actividad
  await logActivity(leadId, agentType, response);
  
}, { connection: redisClient });
```

---

# 9. AUTOMATIZACIONES {#automatizaciones}

## Automatizaciones pre-construidas

```typescript
const DEFAULT_AUTOMATIONS = [
  {
    name: "Bienvenida inmediata",
    trigger_type: "lead_created",
    trigger_config: {},
    conditions: [],
    actions: [
      { type: "activate_agent", agent: "captador", action: "send_welcome" },
      { type: "update_stage", stage: "contactado" }
    ]
  },
  {
    name: "Follow-up 24h sin respuesta",
    trigger_type: "no_response_hours",
    trigger_config: { hours: 24 },
    conditions: [{ field: "pipeline_stage", operator: "in", value: ["contactado","interesado"] }],
    actions: [
      { type: "activate_agent", agent: "vendedor", action: "followup_no_response" }
    ]
  },
  {
    name: "Alerta lead caliente sin asignar",
    trigger_type: "score_threshold",
    trigger_config: { threshold: 80, direction: "above" },
    conditions: [{ field: "assigned_to", operator: "is_null" }],
    actions: [
      { type: "notify_team", role: "manager", message: "⚠️ Lead caliente sin asignar: {lead_name}" },
      { type: "activate_agent", agent: "coordinador", action: "emergency_assign" }
    ]
  },
  {
    name: "Confirmación automática de visita",
    trigger_type: "visit_scheduled",
    trigger_config: { hours_before: 24 },
    actions: [
      { type: "activate_agent", agent: "agendador", action: "send_confirmation_24h" }
    ]
  },
  {
    name: "Reactivación leads fríos",
    trigger_type: "time_schedule",
    trigger_config: { interval_days: 30, time: "10:00" },
    conditions: [{ field: "ia_score_label", operator: "equals", value: "frio" }],
    actions: [
      { type: "activate_agent", agent: "nurturing", action: "reactivation_message" }
    ]
  },
  {
    name: "Solicitar documentos en negociación",
    trigger_type: "stage_changed",
    trigger_config: { to_stage: "negociacion" },
    actions: [
      { type: "activate_agent", agent: "documentador", action: "request_documents" },
      { type: "activate_agent", agent: "financiero", action: "calculate_viability" }
    ]
  },
  {
    name: "Informe semanal manager",
    trigger_type: "time_schedule",
    trigger_config: { day_of_week: 1, time: "08:30" },
    conditions: [{ field: "user_role", operator: "equals", value: "manager" }],
    actions: [
      { type: "activate_agent", agent: "analista", action: "weekly_report" }
    ]
  }
];
```

---

# 10. INTEGRACIONES EXTERNAS {#integraciones}

## WhatsApp Business API

```typescript
// lib/whatsapp/client.ts

export class WhatsAppClient {
  private baseUrl = 'https://graph.facebook.com/v18.0';
  private token: string;
  private phoneId: string;
  
  async sendText(to: string, message: string) {}
  async sendTemplate(to: string, template: string, params: string[]) {}
  async sendMedia(to: string, type: 'image'|'audio'|'document', url: string) {}
  async markAsRead(messageId: string) {}
  async sendInteractive(to: string, buttons: Button[]) {}
}

// Plantillas de WhatsApp pre-aprobadas necesarias:
const TEMPLATES = {
  welcome: "Hola {{1}}, soy el asistente de {{2}}. Vi que te interesa {{3}}...",
  visit_confirmation: "Tu visita está confirmada para {{1}} a las {{2}}. Dirección: {{3}}",
  visit_reminder_24h: "Recuerda que mañana a las {{1}} tienes visita en {{2}}",
  follow_up: "Hola {{1}}, ¿pudiste pensar en la propiedad que te envié?",
  document_request: "Para avanzar con la operación necesitamos estos documentos: {{1}}"
};
```

## Meta Ads Webhook

```typescript
// app/api/webhooks/meta-ads/route.ts
// Recibe leads de campañas de Facebook/Instagram
// Parsea: nombre, email, teléfono, anuncio origen
// Crea lead con source="meta_ads" y utm_campaign del anuncio
```

## Idealista Email Parsing

```typescript
// Configurar forwarding de emails de Idealista a webhook
// Parser extrae: nombre, teléfono, email, propiedad de interés, mensaje
// Crea lead con source="idealista"
```

---

# 11. PROMPTS PARA ANTIGRAVITY {#antigravity-prompts}

## PROMPT FASE 1 — Setup del proyecto y base de datos

```
Crea un proyecto Next.js 14 con App Router llamado "propia" con el siguiente setup:

DEPENDENCIAS:
- @supabase/supabase-js @supabase/auth-helpers-nextjs
- @anthropic-ai/sdk
- tailwindcss shadcn/ui
- framer-motion
- @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
- zustand @tanstack/react-query
- bullmq ioredis
- @sendgrid/mail twilio
- stripe @stripe/stripe-js
- react-hook-form zod
- date-fns recharts

VARIABLES DE ENTORNO (.env.local):
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
META_APP_SECRET=
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

Después ejecuta el SCHEMA SQL completo en Supabase (incluido en el documento de arquitectura).

Configura Row Level Security para que cada agencia solo vea sus datos.

Genera los tipos TypeScript automáticamente desde Supabase con:
npx supabase gen types typescript --project-id [ID] > lib/supabase/types.ts
```

---

## PROMPT FASE 2 — Sistema de autenticación y onboarding

```
Crea el sistema de autenticación completo:

1. PÁGINA DE LOGIN (/login)
- Diseño dark premium, logo PropIA
- Login con email/password y Google OAuth
- Redirige a /onboarding si es primera vez, a /dashboard si tiene agencia

2. ONBOARDING (5 pasos) (/onboarding/step-[1-5])
- Step 1: Nombre de agencia, logo upload, ciudad principal
- Step 2: Conectar WhatsApp (QR o token de API)
- Step 3: Añadir primeras 3 propiedades (o importar CSV)
- Step 4: Activar agentes IA (toggle cards de los 12 agentes, recomendados: Captador, Coordinador, Vendedor)
- Step 5: Test en vivo — simular un lead de prueba y ver el sistema en acción

Cada step guarda en DB antes de avanzar (no se pierde progreso).
Barra de progreso animada.
Skip opcional en steps 3 y 4.
```

---

## PROMPT FASE 3 — Dashboard principal

```
Crea la página principal del dashboard (/dashboard):

LAYOUT:
- Sidebar izquierda (240px) con navegación completa y avatar de usuario
- Header (64px) con búsqueda global, notificaciones y perfil
- Contenido principal con estos componentes:

1. KPI CARDS (fila superior, 4 cards):
   - Leads hoy (con % vs ayer)
   - Mensajes enviados (con % vs ayer)
   - Visitas agendadas (conteo de hoy)
   - Cierres del mes (con objetivo)
   Animación de número counting al cargar.

2. AGENTES IA ACTIVOS (grid 4 columnas):
   - Cada card: avatar generado SVG único, nombre, estado ON/OFF toggle, métrica principal del día, "última acción hace X min"
   - Animación de pulso en agentes activos
   - Click abre modal de configuración del agente

3. LIVE FEED (columna derecha, 380px):
   - Stream en tiempo real de actividad usando Supabase Realtime
   - Cada item: ícono coloreado, descripción, lead name, timestamp relativo
   - Fade in animation para nuevas entradas
   - Scroll infinito con los últimos 100 eventos

4. PIPELINE FUNNEL (centro):
   - Gráfico de embudo animado mostrando cantidad en cada etapa
   - Click en etapa navega al pipeline filtrado
   - Con recharts FunnelChart

5. ALERTAS PRIORITARIAS (tarjeta abajo):
   - Leads calientes sin atender
   - Tareas vencidas
   - SLA alerts (sin respuesta >24h)
   - Click directo al lead

Datos en tiempo real via Supabase Realtime subscriptions.
```

---

## PROMPT FASE 4 — Pipeline Kanban

```
Crea la vista Pipeline Kanban (/dashboard/pipeline):

KANBAN BOARD:
- 7 columnas: Nuevo Lead | Contactado | Interesado | Visita agendada | Negociación | Reserva | Cerrado
- Drag and drop entre columnas con @dnd-kit
- Al soltar: actualizar pipeline_stage en Supabase, crear activity, activar Coordinador IA
- Contador de leads en cada columna header
- Scroll vertical en columnas cuando hay muchos leads

LEAD CARD:
- Avatar inicial del nombre con color único por lead
- Nombre, zona, presupuesto formateado (€)
- Score badge: 🔥 caliente (verde) / 🟡 templado (ámbar) / ❄️ frío (gris)
- Insight IA en 1 línea (truncado con ellipsis)
- Tiempo desde último contacto (rojo si >48h)
- Ícono del canal de origen (WhatsApp, Meta, Idealista, Web)
- Botones de acción rápida (aparecen en hover): WhatsApp, Llamar, Agendar

FILTROS (barra superior):
- Por oficina / comercial asignado
- Por score (solo calientes, etc.)
- Por fuente
- Por zona
- Búsqueda por nombre/teléfono

PERFIL DE LEAD (drawer derecho al hacer click en card):
Ver Prompt Fase 5
```

---

## PROMPT FASE 5 — Perfil completo del lead

```
Crea el drawer de perfil de lead (slide-in desde la derecha, 520px de ancho):

SECCIÓN 1 — HEADER:
- Foto/avatar grande, nombre, teléfono (clickable para llamar), email
- Score IA prominente con barra de progreso animada
- Stage actual con selector dropdown para cambiar
- Botones de acción: WhatsApp | Llamar | Email | Agendar Visita | Asignar

SECCIÓN 2 — RESUMEN IA (card destacada con fondo gradiente sutil):
- Párrafo generado por IA resumiendo el historial completo
- Botón "Actualizar resumen" (regenera llamando a Claude)
- Tags de características detectadas: [comprador], [urgente], [hipoteca], etc.

SECCIÓN 3 — TABS:
Tab "Conversación":
  - Chat completo estilo WhatsApp
  - Mensajes propios a la derecha, lead a la izquierda
  - Notas IA en color diferente (no enviadas al lead)
  - Input para enviar mensaje manual
  - Botón ON/OFF para que la IA tome control del chat

Tab "Timeline":
  - Lista cronológica de todas las actividades
  - Íconos por tipo de actividad
  - Collapse para ver detalles de cada evento

Tab "Propiedades":
  - Grid de propiedades recomendadas por IA con score de compatibilidad
  - Botón "Enviar al lead" por propiedad
  - Propiedades ya enviadas marcadas con estado de reacción

Tab "Documentos":
  - Checklist de documentos solicitados/recibidos
  - Upload directo
  - Botón "Solicitar documentos" (activa Documentador IA)

Tab "Financiero":
  - Calculadora de hipoteca integrada
  - Resultado de precualificación del Financiero IA

Tab "Notas":
  - Notas privadas del equipo
  - Solo visibles internamente

SECCIÓN 4 — RECOMENDACIONES IA (abajo):
  - 3 acciones recomendadas con botón de ejecución directa
  - "Enviar propiedad similar", "Agendar seguimiento", "Escalar a manager"
```

---

## PROMPT FASE 6 — Agentes IA

```
Crea la sección de Agentes IA (/dashboard/agents):

VISTA PRINCIPAL — GRID:
12 cards de agentes (4x3) con diseño premium:
- Avatar único SVG generado para cada agente (no foto real)
- Nombre del agente
- Toggle ON/OFF con animación
- Descripción breve de su función
- Métricas hoy: acciones, mensajes, leads gestionados
- Estado: "Activo", "En pausa", "Sin configurar"
- Botón "Configurar" y "Ver actividad"

CARD INDIVIDUAL (click abre página /agents/[type]):
- Panel de configuración del agente:
  * Toggle de activación
  * Personalidad/tono (slider: formal ↔ cercano)
  * Horario activo (configurar horas de operación)
  * Canales donde actúa (WhatsApp, Email, ambos)
  * Umbral de actuación (ej. solo leads con score >X)
  * System prompt personalizado (textarea avanzado, solo admins)
  * Test en vivo: input para probar el agente con un mensaje

- Panel de actividad:
  * Log de las últimas 50 acciones del agente
  * Métricas: acciones hoy/semana/mes
  * Tasa de éxito (leads que avanzaron etapa tras acción del agente)

DIAGRAMA DE FLUJO (sección inferior):
Diagrama visual SVG/Canvas mostrando:
Captador IA → CRM → Coordinador IA → Vendedor IA → Cierre
Con flechas animadas mostrando el flujo de leads en tiempo real
```

---

## PROMPT FASE 7 — Sistema de automatizaciones

```
Crea el constructor de automatizaciones (/dashboard/automations):

LISTA DE AUTOMATIZACIONES:
- Cards con nombre, descripción, estado ON/OFF, veces ejecutada, última ejecución
- 7 automatizaciones pre-construidas ya instaladas
- Botón "Nueva automatización"

CONSTRUCTOR VISUAL (modal/página):
Diseño tipo "flow builder" simple:

PASO 1 — TRIGGER:
Selector visual de trigger con íconos:
- 🆕 Nuevo lead recibido
- 🔄 Lead cambia de etapa
- ⏱️ Sin respuesta en X horas
- 💬 Mensaje recibido
- 📅 Visita completada
- 📄 Documento recibido
- 🎯 Score supera umbral
- ⏰ Horario programado

PASO 2 — CONDICIONES (opcional):
- Añadir filtros: "solo si score > X", "solo si es de fuente Y", "solo si comercial = Z"
- Operadores: es, no es, mayor que, menor que, contiene

PASO 3 — ACCIONES:
- Múltiples acciones en cadena
- Tipos disponibles:
  * Enviar mensaje WhatsApp (texto o template)
  * Enviar email
  * Cambiar etapa pipeline
  * Asignar a comercial
  * Crear tarea
  * Activar agente IA
  * Enviar notificación al equipo
  * Añadir etiqueta
  * Iniciar secuencia de nurturing

HISTORIAL:
- Log de cada ejecución con resultado (éxito/fallo/saltado)
- Click para ver detalle de qué acción se ejecutó sobre qué lead
```

---

## PROMPT FASE 8 — Analytics

```
Crea el panel de Analytics (/dashboard/analytics):

FILTROS: rango de fechas (hoy/semana/mes/custom), oficina, comercial

MÉTRICAS PRINCIPALES (4 KPI cards grandes):
- Total leads captados
- Ratio de conversión (lead → cierre %)
- Revenue generado (suma de cierres)
- Tiempo medio de respuesta

GRÁFICOS (grid 2x2):
1. Evolución de leads (línea temporal) — últimos 30 días
2. Pipeline funnel (barras) — conversión entre etapas
3. Leads por fuente (donut chart) — WhatsApp/Meta/Idealista/Web/etc.
4. Rendimiento de comerciales (barras horizontales) — cierres vs leads asignados

TABLA DE COMERCIALES:
- Ranking con: nombre, leads asignados, contactados, visitas, cierres, ratio, tiempo respuesta
- Ordenable por cada columna
- Click en comercial para ver detalle individual

ANÁLISIS DE ZONAS:
- Mapa de calor (si hay coords) o tabla de zonas
- Por zona: volumen de leads, precio medio, tiempo en mercado

AGENTES IA PERFORMANCE:
- Métricas de cada agente: acciones/día, tasa de éxito, leads mejorados
- Comparativa semana vs semana anterior

INFORME EXPORTABLE:
- Botón "Exportar PDF" genera informe con branding de la agencia
- "Exportar CSV" para los datos crudos
```

---

## PROMPT FASE 9 — Gestión de equipo y configuración

```
Crea las secciones de Equipo y Configuración:

EQUIPO (/dashboard/team):
- Tabla de usuarios con foto, nombre, rol, oficina, leads activos, último acceso
- Invitar usuario por email (envía email con link de registro)
- Asignar rol y oficina
- Activar/desactivar usuario
- Ver rendimiento individual (link a analytics filtrado)

CONFIGURACIÓN — AGENCIA (/dashboard/settings/agency):
- Nombre, logo, colores, zona principal
- Datos de contacto
- Configuración de horarios de trabajo
- Idioma y zona horaria

CONFIGURACIÓN — WHITE LABEL (/dashboard/settings/whitelabel):
- Preview en vivo del portal con los colores elegidos
- Subir logo y favicon
- Configurar dominio personalizado (instrucciones de CNAME)
- Personalizar emails (encabezado, pie de página)

CONFIGURACIÓN — INTEGRACIONES (/dashboard/settings/integrations):
- WhatsApp: conectar con QR o token, estado de conexión
- Meta Ads: conectar cuenta, ver leads de campañas
- Google Calendar: OAuth2 por cada comercial
- Idealista/Fotocasa: instrucciones de configuración
- Slack: webhook URL
- Twilio: SID y token para llamadas

CONFIGURACIÓN — BILLING (/dashboard/settings/billing):
- Plan actual con features
- Uso del mes (leads, mensajes, agentes activos)
- Historial de facturas
- Cambiar plan
- Portal de Stripe para gestión de pago
```

---

# 12. PROMPTS PARA OPENCODE {#opencode-prompts}

## PROMPT OPENCODE 1 — Webhooks y sistema de colas

```
Implementa el sistema de webhooks y cola de trabajos:

1. WEBHOOK WHATSAPP (app/api/webhooks/whatsapp/route.ts):
- Verificación de firma HMAC-SHA256 con META_APP_SECRET
- GET handler para verificación inicial del webhook
- POST handler que:
  * Parsea los diferentes tipos de mensaje (texto, audio, imagen, documento)
  * Busca el lead por número de teléfono
  * Si no existe: crea lead nuevo con source="whatsapp"
  * Guarda el mensaje en tabla messages
  * Añade job a la cola BullMQ "process_message"
  * Marca el mensaje como leído en WhatsApp API

2. WEBHOOK META ADS (app/api/webhooks/meta-ads/route.ts):
- Parsea leads de Facebook Lead Ads
- Extrae: nombre, email, teléfono, nombre del anuncio, adset
- Crea lead en DB con source="meta_ads", utms del anuncio
- Añade job "process_new_lead" a la cola

3. BULL QUEUE WORKERS (lib/queue/workers/):
- Worker "process_message": llama al agente IA apropiado según el estado del lead
- Worker "process_new_lead": activa el Captador IA
- Worker "automation": ejecuta las acciones de automatizaciones
- Worker "scheduled": cron jobs (briefings matutinos, nurturing, recordatorios)

4. REDIS: usar Upstash Redis con @upstash/redis para BullMQ
```

---

## PROMPT OPENCODE 2 — Sistema de agentes IA

```
Implementa el sistema de agentes IA en lib/claude/agents/:

Para CADA UNO de los 12 agentes crea:

1. Un archivo TypeScript con:
   - El system prompt completo (usar los prompts del documento maestro)
   - Función principal del agente que recibe contexto del lead
   - Función para parsear la respuesta JSON del agente
   - Función para ejecutar las acciones del agente (actualizar DB, enviar mensajes, etc.)

2. El orquestador principal (lib/claude/orchestrator.ts):
   - Función que decide qué agente actuar según el estado del lead
   - Función que ejecuta el agente y maneja errores
   - Función que registra la actividad del agente en DB
   - Retry logic: si Claude falla, reintenta hasta 3 veces con backoff

3. Servicio de WhatsApp (lib/whatsapp/client.ts):
   - Clase WhatsAppClient con métodos: sendText, sendTemplate, sendMedia, sendInteractive
   - Rate limiting: máximo 1 mensaje por segundo por número
   - Logging de todos los mensajes enviados

El flujo principal:
mensaje WhatsApp → webhook → cola → orquestador → agente apropiado → respuesta → WhatsApp
```

---

## PROMPT OPENCODE 3 — Tiempo real y Supabase Realtime

```
Implementa el sistema de tiempo real:

1. SUPABASE REALTIME SUBSCRIPTIONS (hooks/useRealtime.ts):
- Suscripción a tabla "activities" filtrada por agency_id
- Suscripción a cambios en "leads" (score, stage, assigned_to)
- Suscripción a nuevos "messages"
- Hook useRealtime() que devuelve stream de eventos en tiempo real

2. LIVE FEED COMPONENT (components/dashboard/LiveFeed.tsx):
- Consume el hook useRealtime
- Máximo 100 items en memoria (FIFO)
- Animación de entrada con framer-motion (fade + slide desde abajo)
- Ícono y color diferente por tipo de evento
- "hace X segundos/minutos" con actualización automática

3. ACTUALIZACIÓN DE KPIs EN TIEMPO REAL:
- Los KPI cards del dashboard se actualizan sin refresh
- Usar Supabase Realtime + React Query invalidation
- Animación de cambio numérico cuando cambia el valor

4. NOTIFICACIONES PUSH (usando Supabase Realtime):
- Canal de notificaciones por usuario_id
- Toast notification cuando llega alerta del Notificador IA
- Sonido opcional (configurable por usuario)
```

---

## PROMPT OPENCODE 4 — Integración Stripe para billing

```
Implementa el sistema de billing con Stripe:

1. PRODUCTOS EN STRIPE:
- Crear 4 productos: Starter (49€), Profesional (149€), Agencia (399€), Enterprise
- Configurar con billing mensual y anual (20% descuento)

2. FLUJO DE SUSCRIPCIÓN:
- Al completar onboarding: crear customer en Stripe, iniciar trial 14 días
- Página de upgrade con comparativa de planes
- Checkout con Stripe Checkout embebido
- Webhook para: payment_succeeded, subscription_cancelled, trial_ending

3. CONTROL DE LÍMITES:
- Middleware que verifica el plan antes de crear leads/agentes
- Starter: max 200 leads/mes, 3 agentes activos
- Profesional: ilimitado, 8 agentes
- Agencia: ilimitado, 12 agentes, white-label

4. PORTAL DE BILLING:
- Redirigir a Stripe Customer Portal para gestionar suscripción
- Mostrar uso actual del mes (leads, mensajes, agentes)
- Historial de facturas con descarga PDF
```

---

## PROMPT OPENCODE 5 — Optimización y deploy

```
Optimiza y prepara para producción:

1. PERFORMANCE:
- React Query para cache de datos con staleTime optimizado
- Suspense boundaries en componentes pesados
- Loading skeletons para todas las secciones
- Infinite scroll en listas de leads y conversaciones
- Virtualización con react-virtual para listas largas (>100 items)
- Optimistic updates en el kanban (actualiza UI antes de confirmar en DB)

2. SEO Y META:
- Metadata dinámica por página
- Open Graph para compartir
- robots.txt y sitemap solo para páginas públicas (landing, login)

3. SEGURIDAD:
- Rate limiting en todos los API routes (usando Upstash)
- Validación de input con Zod en todos los endpoints
- Sanitización de contenido de mensajes
- CSP headers
- Verificación de signatures en todos los webhooks externos

4. MONITORING:
- Sentry para error tracking (frontend y backend)
- Custom events para: nuevo lead, cierre, agente error, webhook fallido
- Vercel Analytics para performance
- Logs estructurados en cada agente IA con lead_id y agency_id

5. DEPLOY EN VERCEL:
- Variables de entorno configuradas
- Edge Functions para webhooks (mejor latencia)
- Cron jobs de Vercel para tareas programadas
- Preview deployments en cada PR

6. ONBOARDING CHECKS:
- Verificar que WhatsApp está conectado correctamente
- Test de webhook Meta Ads
- Test de envío de email con SendGrid
- Health check endpoint /api/health
```

---

# APÉNDICE — CHECKLIST DE LANZAMIENTO

## Antes del primer cliente:
- [ ] WhatsApp Business API aprobada por Meta
- [ ] Templates de WhatsApp aprobados (mínimo 5)
- [ ] Webhook de Meta Ads funcionando
- [ ] Claude API con créditos suficientes
- [ ] Stripe en modo live
- [ ] Dominio propio configurado
- [ ] SSL activo
- [ ] Backup automático de Supabase activo
- [ ] Sentry configurado
- [ ] Plan de soporte definido

## KPIs de éxito del SaaS:
- Tiempo de respuesta a nuevo lead: <2 minutos
- Tasa de cualificación automática: >85%
- Leads gestionados sin intervención humana: >60%
- NPS de clientes: >50
- Churn mensual: <5%
- MRR objetivo mes 6: 10.000€

---

*Documento generado para PropIA — Versión 1.0*
*Stack: Next.js 14 · Supabase · Claude API · WhatsApp Business*
