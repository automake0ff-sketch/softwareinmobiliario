# PROMPT DEFINITIVO — PROPIA ES UN SAAS MULTI-TENANT
# Cada inmobiliaria tiene su espacio, datos y configuración independiente
# =====================================================================
#
# CONCEPTO CENTRAL:
# PropIA no es para UNA inmobiliaria. Es como HubSpot o Pipedrive:
# - Cualquier inmobiliaria se registra y tiene su propio espacio
# - Sus leads, propiedades, conversaciones y agentes son SUYOS
# - Sus credenciales (WhatsApp, email, Slack...) son privadas
# - Nunca ven datos de otras inmobiliarias
# - Cada una paga su suscripción y tiene su plan
# - El admin de PropIA (tú) ves las métricas globales del SaaS
#
# PROBLEMA ACTUAL DEL CÓDIGO:
# El código actual tiene agency_id hardcodeado o usa siempre
# la primera agencia. Hay que asegurar que CADA función obtiene
# el agency_id del usuario autenticado y NUNCA cruza datos.
# =====================================================================

---

## PARTE 1 — ARQUITECTURA MULTI-TENANT CORRECTA

### Regla de oro: UN usuario → UNA agencia → TODOS sus datos

```
Usuario se registra
  ↓
Crea su agencia (o se une a una existente con invite)
  ↓
Todos sus leads, propiedades, conversaciones
tienen agency_id = su agencia
  ↓
Row Level Security en Supabase garantiza
que NUNCA ve datos de otra agencia
  ↓
Sus credenciales (WhatsApp token, email API key)
están en su row de agencies — cifradas
  ↓
Sus automatizaciones son suyas
Sus agentes son suyos
Su pipeline es suyo
```

### Lo que NO debe pasar (bugs actuales a corregir):
```typescript
// ❌ MAL — usa siempre la primera agencia
const ag = (SELECT id FROM agencies LIMIT 1)

// ❌ MAL — hardcodea agency
const agencyId = 'uuid-fijo'

// ❌ MAL — no filtra por agency
supabase.from('leads').select('*')

// ✅ BIEN — siempre del usuario autenticado
const { data: me } = await supabase
  .from('users')
  .select('agency_id')
  .eq('id', user.id)
  .single()
// Luego SIEMPRE: .eq('agency_id', me.agency_id)
```

---

## PARTE 2 — FLUJO COMPLETO DE REGISTRO Y ONBOARDING

### 2.1 Página de registro `/register`

```tsx
// app/(auth)/register/page.tsx

// Paso 1: datos personales
// - Nombre completo
// - Email
// - Contraseña
// - Teléfono (para recibir notificaciones)

// Paso 2: datos de la inmobiliaria (se crea la agencia)
// - Nombre de la agencia
// - Ciudad principal
// - Número de agentes en el equipo (1, 2-5, 6-15, +15)
// - Teléfono de la agencia
// - Email de contacto de la agencia
// - Web (opcional)

// Paso 3: plan seleccionado (Starter 79€, Profesional 199€, Agencia 499€)
// → redirige a Stripe/PayPal

// Tras pago exitoso → onboarding en 4 pasos
```

### 2.2 Qué pasa cuando alguien se registra

```typescript
// app/api/auth/register/route.ts

export async function POST(req: NextRequest) {
  const { email, password, name, phone, agencyName, agencyCity, agencyPhone, agencyEmail, plan } = await req.json()

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email, password,
    email_confirm: true,
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  // 2. Crear la agencia (espacio propio de esta inmobiliaria)
  const { data: agency } = await supabaseAdmin.from('agencies').insert({
    name: agencyName,
    city: agencyCity,
    phone: agencyPhone,
    email: agencyEmail,
    slug: slugify(agencyName), // ej: "inmobiliaria-garcia-sevilla"
    plan: plan ?? 'starter',
    onboarding_step: 0,
    onboarding_completed: false,
  }).select().single()

  // 3. Crear perfil del usuario ligado a la agencia
  await supabaseAdmin.from('users').insert({
    id: authData.user.id,
    agency_id: agency.id,
    name,
    email,
    phone,
    role: 'admin', // el que crea la agencia es el admin
  })

  // 4. Crear los 3 agentes IA básicos del plan Starter
  await supabaseAdmin.from('ai_agents').insert([
    { agency_id: agency.id, type: 'captador',    name: 'Captador IA',    is_active: false },
    { agency_id: agency.id, type: 'vendedor',     name: 'Vendedor IA',    is_active: false },
    { agency_id: agency.id, type: 'coordinador',  name: 'Coordinador IA', is_active: false },
  ])

  // 5. Crear trial de 14 días
  await supabaseAdmin.from('subscriptions').insert({
    agency_id: agency.id,
    plan_id: plan ?? 'starter',
    status: 'trialing',
    trial_end: new Date(Date.now() + 14 * 86400000).toISOString(),
  })

  // 6. Inicializar contadores de uso
  await supabaseAdmin.from('usage_counters').insert({
    agency_id: agency.id,
    period_start: new Date().toISOString().slice(0, 7) + '-01',
  })

  return NextResponse.json({ agency_id: agency.id, user_id: authData.user.id })
}
```

### 2.3 Onboarding de 4 pasos (tras registro)

```
PASO 1 — Conectar WhatsApp
  → La inmobiliaria introduce su token de WhatsApp Business
  → Número de teléfono de la agencia (+34 xxx)
  → Phone Number ID de Meta
  → Botón "Probar conexión" → verifica que funciona
  → Si no tienen WhatsApp Business API: link a guía de Meta
  → Pueden saltar y conectar después

PASO 2 — Conectar email
  → SendGrid API key (recomendado) O SMTP propio
  → Email remitente: "Inmobiliaria García <hola@inmogarcía.com>"
  → Botón "Enviar email de prueba" → se mandan un email a sí mismos
  → Pueden saltar

PASO 3 — Añadir primera propiedad
  → Formulario rápido: tipo, zona, precio, habitaciones, descripción
  → O importar desde CSV
  → Mínimo 1 para que los agentes tengan algo con qué trabajar
  → Pueden saltar

PASO 4 — Activar agentes
  → Muestra los agentes disponibles según su plan
  → Toggle para activar Captador IA (recomendado)
  → Toggle para activar Vendedor IA (recomendado)
  → Botón "Lanzar PropIA" → redirige al dashboard
```

---

## PARTE 3 — SCHEMA DE BASE DE DATOS MULTI-TENANT COMPLETO

```sql
-- ═══════════════════════════════════════════════════════
-- TABLA CENTRAL: AGENCIES
-- Cada inmobiliaria registrada = 1 row en esta tabla
-- ═══════════════════════════════════════════════════════
CREATE TABLE agencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  
  -- Datos de contacto de la inmobiliaria
  email         TEXT,
  phone         TEXT,
  whatsapp_number TEXT,
  address       TEXT,
  city          TEXT,
  province      TEXT,
  country       TEXT DEFAULT 'ES',
  website       TEXT,
  
  -- Redes sociales
  instagram     TEXT,
  facebook      TEXT,
  linkedin      TEXT,
  tiktok        TEXT,
  
  -- Branding (para white-label)
  logo_url      TEXT,
  primary_color TEXT DEFAULT '#6366f1',
  secondary_color TEXT DEFAULT '#8b5cf6',
  custom_domain TEXT,
  
  -- Credenciales de WhatsApp Business (PRIVADAS de esta agencia)
  wa_token      TEXT,              -- Token de acceso Meta
  wa_phone_id   TEXT,              -- Phone Number ID
  wa_verify_token TEXT,            -- Para verificar webhook
  
  -- Credenciales de email (PRIVADAS)
  email_provider TEXT DEFAULT 'sendgrid' CHECK (email_provider IN ('sendgrid','smtp','none')),
  sendgrid_key  TEXT,
  sendgrid_from_email TEXT,
  sendgrid_from_name TEXT,
  smtp_host     TEXT,
  smtp_port     INTEGER,
  smtp_user     TEXT,
  smtp_pass     TEXT,              -- cifrado en la aplicación
  
  -- Notificaciones del equipo (PRIVADAS)
  slack_webhook TEXT,
  telegram_token TEXT,
  telegram_chat  TEXT,
  
  -- Bases de datos externas (PRIVADAS)
  notion_key    TEXT,
  notion_db     TEXT,
  airtable_key  TEXT,
  airtable_base TEXT,
  airtable_table TEXT DEFAULT 'Leads',
  sheets_id     TEXT,
  sheets_credentials JSONB,        -- Service account JSON
  
  -- Webhooks (PRIVADOS)
  webhook_zapier TEXT,
  webhook_make   TEXT,
  webhook_n8n    TEXT,
  webhook_custom TEXT,
  
  -- Suscripción y plan
  plan          TEXT DEFAULT 'starter' CHECK (plan IN ('starter','profesional','agencia','enterprise')),
  plan_status   TEXT DEFAULT 'trialing' CHECK (plan_status IN ('trialing','active','past_due','canceled','expired')),
  
  -- Configuración general
  timezone      TEXT DEFAULT 'Europe/Madrid',
  language      TEXT DEFAULT 'es',
  bot_name      TEXT DEFAULT 'Asistente IA',
  bot_tone      TEXT DEFAULT 'profesional' CHECK (bot_tone IN ('formal','profesional','cercano','lujo')),
  working_hours JSONB DEFAULT '{"start":"09:00","end":"20:00","days":[1,2,3,4,5]}',
  
  -- Estado del onboarding
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0,
  
  -- Metadatos
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — El corazón del multi-tenant
-- Cada tabla tiene políticas que garantizan aislamiento
-- ═══════════════════════════════════════════════════════

-- Función helper: obtener agency_id del usuario autenticado
CREATE OR REPLACE FUNCTION auth.agency_id()
RETURNS UUID
LANGUAGE SQL STABLE
AS $$
  SELECT agency_id FROM users WHERE id = auth.uid()
$$;

-- Aplicar RLS a todas las tablas principales
ALTER TABLE leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs   ENABLE ROW LEVEL SECURITY;

-- Política universal: solo ves datos de tu agencia
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads','properties','conversations','messages','activities',
    'automations','ai_agents','visits','tasks','notifications',
    'documents','automation_logs'
  ] LOOP
    EXECUTE format('
      CREATE POLICY "tenant_isolation" ON %I
      USING (agency_id = auth.agency_id())', t);
  END LOOP;
END $$;

-- Política especial para users (pueden verse a sí mismos y a su equipo)
CREATE POLICY "users_own_agency" ON users
  USING (agency_id = auth.agency_id() OR id = auth.uid());

-- Política para agencies (solo el admin de esa agencia)
CREATE POLICY "agency_own_data" ON agencies
  USING (id = auth.agency_id());

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN: obtener contexto completo para automatizaciones
-- Usa los datos REALES de la agencia del usuario actual
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_automation_context(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_agency_id UUID;
  v_lead      leads%ROWTYPE;
  v_agency    agencies%ROWTYPE;
  v_assigned  TEXT;
BEGIN
  v_agency_id := auth.agency_id();
  
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND agency_id = v_agency_id;
  SELECT * INTO v_agency FROM agencies WHERE id = v_agency_id;
  SELECT name INTO v_assigned FROM users WHERE id = v_lead.assigned_to;
  
  RETURN jsonb_build_object(
    -- Lead
    'lead_id',          v_lead.id,
    'lead_name',        v_lead.name,
    'lead_first_name',  split_part(v_lead.name, ' ', 1),
    'phone',            COALESCE(v_lead.phone, ''),
    'email',            COALESCE(v_lead.email, ''),
    'score',            COALESCE(v_lead.ia_score, 0),
    'score_label',      COALESCE(v_lead.ia_score_label, 'frio'),
    'score_emoji',      CASE WHEN v_lead.ia_score > 75 THEN '🔥' WHEN v_lead.ia_score > 40 THEN '🟡' ELSE '❄️' END,
    'stage',            COALESCE(v_lead.pipeline_stage, 'nuevo'),
    'zone',             COALESCE(v_lead.zones[1], ''),
    'budget_max',       COALESCE(v_lead.budget_max, 0),
    'operation_type',   COALESCE(v_lead.operation_type, 'compra'),
    'source',           COALESCE(v_lead.source, 'manual'),
    'lead_summary',     COALESCE(v_lead.ia_summary, ''),
    'tags',             COALESCE(array_to_string(v_lead.tags, ', '), ''),
    'assigned_to_name', COALESCE(v_assigned, 'tu asesor'),
    -- Agencia (datos REALES de esta inmobiliaria)
    'agency_id',        v_agency.id,
    'agency_name',      COALESCE(v_agency.name, 'Mi Agencia'),
    'agency_city',      COALESCE(v_agency.city, ''),
    'agency_email',     COALESCE(v_agency.email, ''),
    'agency_phone',     COALESCE(v_agency.phone, ''),
    'agency_whatsapp',  COALESCE(v_agency.whatsapp_number, ''),
    'agency_website',   COALESCE(v_agency.website, ''),
    'agency_address',   COALESCE(v_agency.address, ''),
    'agency_instagram', COALESCE(v_agency.instagram, ''),
    -- Credenciales (para el engine, no van en prompts)
    'wa_token',         COALESCE(v_agency.wa_token, ''),
    'wa_phone_id',      COALESCE(v_agency.wa_phone_id, ''),
    'sg_key',           COALESCE(v_agency.sendgrid_key, ''),
    'sg_from_email',    COALESCE(v_agency.sendgrid_from_email, ''),
    'sg_from_name',     COALESCE(v_agency.sendgrid_from_name, v_agency.name),
    'slack_webhook',    COALESCE(v_agency.slack_webhook, ''),
    'telegram_token',   COALESCE(v_agency.telegram_token, ''),
    'telegram_chat',    COALESCE(v_agency.telegram_chat, ''),
    'notion_key',       COALESCE(v_agency.notion_key, ''),
    'notion_db',        COALESCE(v_agency.notion_db, ''),
    'airtable_key',     COALESCE(v_agency.airtable_key, ''),
    'airtable_base',    COALESCE(v_agency.airtable_base, ''),
    'airtable_table',   COALESCE(v_agency.airtable_table, 'Leads'),
    'sheets_id',        COALESCE(v_agency.sheets_id, ''),
    'webhook_zapier',   COALESCE(v_agency.webhook_zapier, ''),
    'webhook_make',     COALESCE(v_agency.webhook_make, ''),
    'webhook_n8n',      COALESCE(v_agency.webhook_n8n, ''),
    -- Tiempo
    'date',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'DD/MM/YYYY'),
    'time',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'HH24:MI'),
    'datetime',to_char(NOW() AT TIME ZONE v_agency.timezone, 'DD/MM/YYYY HH24:MI'),
    'month',   to_char(NOW() AT TIME ZONE v_agency.timezone, 'Month'),
    'year',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'YYYY')
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- AUTOMATIZACIONES: son de la agencia, no globales
-- El seed NO inserta en una agencia hardcodeada.
-- Las plantillas se crean cuando la agencia las activa.
-- ═══════════════════════════════════════════════════════

-- Tabla de plantillas GLOBALES (del SaaS, no de una agencia)
-- Son las plantillas que cualquier inmobiliaria puede instalar
CREATE TABLE automation_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT CHECK (category IN (
    'captacion', 'seguimiento', 'visitas', 'pipeline',
    'marketing', 'reportes', 'integraciones', 'n8n'
  )),
  difficulty  TEXT DEFAULT 'basica' CHECK (difficulty IN ('basica','intermedia','avanzada')),
  
  -- La plantilla en sí (igual que automations pero sin agency_id)
  trigger_type   TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  conditions     JSONB DEFAULT '[]',
  actions        JSONB DEFAULT '[]',
  
  -- Qué plan mínimo necesita
  min_plan    TEXT DEFAULT 'starter',
  
  -- Qué integraciones necesita para funcionar
  requires    TEXT[] DEFAULT '{}',  -- ['whatsapp', 'email', 'slack', ...]
  
  -- Métricas de uso
  installs    INTEGER DEFAULT 0,
  rating      DECIMAL(3,2) DEFAULT 0,
  
  is_active   BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Cuando una agencia instala una plantilla, se crea en su espacio
CREATE OR REPLACE FUNCTION install_template(p_template_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agency_id   UUID;
  v_template    automation_templates%ROWTYPE;
  v_automation_id UUID;
BEGIN
  v_agency_id := auth.agency_id();
  SELECT * INTO v_template FROM automation_templates WHERE id = p_template_id AND is_active = TRUE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plantilla no encontrada';
  END IF;
  
  -- Crear la automatización en el espacio de la agencia
  INSERT INTO automations (
    agency_id, name, description, is_active,
    trigger_type, trigger_config, conditions, actions
  ) VALUES (
    v_agency_id,
    v_template.name,
    v_template.description,
    FALSE, -- inactiva por defecto, el usuario la activa cuando quiera
    v_template.trigger_type,
    v_template.trigger_config,
    v_template.conditions,
    v_template.actions
  ) RETURNING id INTO v_automation_id;
  
  -- Incrementar contador de instalaciones
  UPDATE automation_templates SET installs = installs + 1 WHERE id = p_template_id;
  
  RETURN v_automation_id;
END;
$$;
```

---

## PARTE 4 — API ROUTES CORRECTAS (MULTI-TENANT)

### Patrón que TODOS los endpoints deben seguir:

```typescript
// lib/auth/get-agency.ts
// Helper que todos los endpoints usan para obtener el agency_id seguro

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function getAuthContext() {
  const supabase = createRouteHandlerClient({ cookies })
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }
  
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('agency_id, role, name, email')
    .eq('id', user.id)
    .single()
    
  if (userError || !userData?.agency_id) {
    return { error: NextResponse.json({ error: 'Agencia no encontrada' }, { status: 404 }) }
  }
  
  return {
    supabase,
    user,
    agencyId: userData.agency_id,
    userRole: userData.role,
    userName: userData.name,
  }
}

// ─────────────────────────────────────────────────────
// EJEMPLO: endpoint de leads CORRECTO
// app/api/leads/route.ts
// ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { supabase, agencyId } = auth

  // RLS ya filtra, pero añadimos .eq() como doble seguridad
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('agency_id', agencyId)  // ← SIEMPRE filtrar por agency_id
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

// ─────────────────────────────────────────────────────
// ENDPOINT: plantillas disponibles para instalar
// app/api/templates/route.ts
// ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { supabase, agencyId } = auth
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  // Obtener plan de la agencia para filtrar plantillas disponibles
  const { data: agency } = await supabase
    .from('agencies')
    .select('plan')
    .eq('id', agencyId)
    .single()

  const planOrder = { starter: 1, profesional: 2, agencia: 3, enterprise: 4 }
  const agencyPlanLevel = planOrder[agency?.plan as keyof typeof planOrder] ?? 1

  let query = supabase
    .from('automation_templates')
    .select('*')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('installs', { ascending: false })

  if (category) query = query.eq('category', category)

  const { data: templates } = await query

  // Marcar cuáles puede usar según su plan
  const templatesWithAccess = (templates ?? []).map(t => ({
    ...t,
    can_install: planOrder[t.min_plan as keyof typeof planOrder] <= agencyPlanLevel,
    // Marcar si ya la tiene instalada
  }))

  return NextResponse.json(templatesWithAccess)
}

// ─────────────────────────────────────────────────────
// ENDPOINT: instalar plantilla en la agencia del usuario
// app/api/templates/[id]/install/route.ts
// ─────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { supabase } = auth

  const { data, error } = await supabase
    .rpc('install_template', { p_template_id: params.id })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ automation_id: data })
}
```

---

## PARTE 5 — PÁGINA "MARKETPLACE DE PLANTILLAS"

### Cada inmobiliaria entra, ve el catálogo y con 1 click instala en su espacio

```tsx
// app/(dashboard)/automations/templates/page.tsx

'use client'

import { useState, useEffect } from 'react'

const CATEGORIES = [
  { id: 'all',          label: 'Todas',           icon: '⚡' },
  { id: 'captacion',    label: 'Captación',        icon: '🎯' },
  { id: 'seguimiento',  label: 'Seguimiento',      icon: '📱' },
  { id: 'visitas',      label: 'Visitas',           icon: '🏠' },
  { id: 'pipeline',     label: 'Pipeline',          icon: '🔄' },
  { id: 'marketing',    label: 'Marketing',         icon: '📣' },
  { id: 'reportes',     label: 'Reportes',          icon: '📊' },
  { id: 'n8n',          label: 'Estilo n8n',        icon: '🔗' },
  { id: 'integraciones',label: 'Integraciones',     icon: '🌐' },
]

interface Template {
  id: string; name: string; description: string
  category: string; difficulty: string; min_plan: string
  requires: string[]; installs: number; rating: number
  trigger_type: string; is_featured: boolean; can_install: boolean
}

export default function TemplatesPage() {
  const [templates, setTemplates]     = useState<Template[]>([])
  const [category, setCategory]       = useState('all')
  const [search, setSearch]           = useState('')
  const [installing, setInstalling]   = useState<string | null>(null)
  const [installed, setInstalled]     = useState<Set<string>>(new Set())
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = category !== 'all' ? `/api/templates?category=${category}` : '/api/templates'
    fetch(url)
      .then(r => r.json())
      .then(data => { setTemplates(data); setLoading(false) })
  }, [category])

  const install = async (templateId: string) => {
    setInstalling(templateId)
    try {
      const res = await fetch(`/api/templates/${templateId}/install`, { method: 'POST' })
      if (res.ok) {
        setInstalled(prev => new Set([...prev, templateId]))
      }
    } finally {
      setInstalling(null)
    }
  }

  const DIFFICULTY_COLOR = {
    basica: 'text-emerald-400 bg-emerald-400/10',
    intermedia: 'text-amber-400 bg-amber-400/10',
    avanzada: 'text-red-400 bg-red-400/10',
  }

  const PLAN_COLOR = {
    starter: 'text-slate-300 bg-slate-300/10',
    profesional: 'text-indigo-300 bg-indigo-300/10',
    agencia: 'text-amber-300 bg-amber-300/10',
  }

  const REQUIRES_ICONS: Record<string, string> = {
    whatsapp: '💬', email: '📧', slack: '💜',
    telegram: '✈️', notion: '📓', airtable: '🗃️',
    sheets: '📊', webhook: '🔗',
  }

  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-medium text-white">Plantillas de automatización</h1>
        <p className="text-white/40 text-sm mt-1">
          Instala con 1 click. Se configuran con los datos de tu agencia automáticamente.
        </p>
      </div>

      {/* Buscador + categorías */}
      <div className="flex flex-col gap-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar plantilla..."
          className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500"
        />
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-sm transition-all ${
                category === cat.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10'
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de plantillas */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(template => {
            const isInstalled = installed.has(template.id)
            const isInstalling = installing === template.id
            const locked = !template.can_install

            return (
              <div
                key={template.id}
                className={`relative rounded-2xl border p-5 flex flex-col gap-3 transition-all ${
                  locked
                    ? 'border-white/5 bg-white/[0.02] opacity-60'
                    : template.is_featured
                    ? 'border-indigo-500/40 bg-indigo-950/20'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                {template.is_featured && (
                  <span className="absolute -top-2.5 left-4 bg-indigo-600 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                    ⭐ Destacada
                  </span>
                )}

                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm leading-snug">{template.name}</p>
                    <p className="text-white/40 text-xs mt-1 line-clamp-2">{template.description}</p>
                  </div>
                  {locked && <span className="text-xl flex-shrink-0">🔒</span>}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[template.difficulty as keyof typeof DIFFICULTY_COLOR]}`}>
                    {template.difficulty}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PLAN_COLOR[template.min_plan as keyof typeof PLAN_COLOR]}`}>
                    {template.min_plan}
                  </span>
                  {template.requires.map(req => (
                    <span key={req} className="text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full" title={req}>
                      {REQUIRES_ICONS[req] ?? '⚙️'}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 text-xs text-white/30">
                  <span>⬇️ {template.installs} instalaciones</span>
                  {template.rating > 0 && <span>⭐ {template.rating.toFixed(1)}</span>}
                </div>

                {/* Botón */}
                <button
                  onClick={() => !locked && !isInstalled && install(template.id)}
                  disabled={locked || isInstalling || isInstalled}
                  className={`mt-auto w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                    locked
                      ? 'bg-white/5 text-white/20 cursor-not-allowed'
                      : isInstalled
                      ? 'bg-emerald-600/20 text-emerald-400 cursor-default'
                      : isInstalling
                      ? 'bg-indigo-600/50 text-white/50'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {locked
                    ? `Requiere plan ${template.min_plan}`
                    : isInstalled
                    ? '✓ Instalada en tu agencia'
                    : isInstalling
                    ? 'Instalando...'
                    : 'Instalar en mi agencia'
                  }
                </button>
              </div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">🔍</p>
          <p>No hay plantillas que coincidan con tu búsqueda</p>
        </div>
      )}
    </div>
  )
}
```

---

## PARTE 6 — SEED DE PLANTILLAS GLOBALES DEL SAAS

### Estas plantillas están disponibles para CUALQUIER inmobiliaria. No tienen agency_id.

```sql
-- Plantillas que ve cualquier inmobiliaria registrada en PropIA

INSERT INTO automation_templates
  (name, description, category, difficulty, trigger_type, trigger_config,
   conditions, actions, min_plan, requires, is_featured, installs, sort_order)
VALUES

-- ═══════════════════ CAPTACIÓN ═══════════════════

('Bienvenida inmediata',
 'Responde a nuevos leads en menos de 2 minutos con un mensaje personalizado del Captador IA',
 'captacion', 'basica', 'lead_created', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Nuevo lead {{lead_name}} desde {{source_label}} en {{agency_name}}. Genera bienvenida cálida (2-3 frases), usa su nombre, preséntate como el asistente de {{agency_name}} en {{agency_city}}, y haz UNA pregunta de cualificación.","auto_send_whatsapp":true,"save_to_conversation":true}},{"type":"change_stage","config":{"new_stage":"contactado"}}]',
 'starter', ARRAY['whatsapp'], TRUE, 1240, 1),

('Cualificación inteligente de lead',
 'El Captador IA hace las preguntas clave para conocer el perfil del lead y asignar score',
 'captacion', 'basica', 'lead_created', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Lead {{lead_name}} llega a {{agency_name}}. Genera las 3 preguntas más importantes para cualificar si es comprador real: presupuesto, zona y urgencia. Elige el orden más natural según el origen {{source_label}}.","auto_send_whatsapp":true}},{"type":"assign_to","config":{"role":"comercial"}}]',
 'starter', ARRAY['whatsapp'], TRUE, 987, 2),

('Bienvenida omnicanal: WhatsApp + Email',
 'Contacto simultáneo por WhatsApp y email cuando el lead tiene ambos datos',
 'captacion', 'intermedia', 'lead_created', '{}',
 '[{"field":"email","operator":"not_null","value":null}]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Lead {{lead_name}} tiene WhatsApp ({{phone}}) y email ({{email}}). Genera DOS versiones: WHATSAPP: bienvenida breve (2-3 frases) con pregunta de cualificación. EMAIL: más formal con presentación de {{agency_name}}, servicios y CTA. Separa con ---EMAIL---","auto_send_whatsapp":true,"destinations":[{"type":"email_sendgrid","subject_template":"Bienvenido/a a {{agency_name}} — {{lead_first_name}}"}]}}]',
 'starter', ARRAY['whatsapp','email'], FALSE, 645, 3),

('Lead VIP detectado — escalada inmediata',
 'Cuando un lead tiene presupuesto alto, alerta al manager y asigna al mejor comercial',
 'captacion', 'basica', 'lead_created', '{}',
 '[{"field":"budget_max","operator":"gte","value":400000}]',
 '[{"type":"add_tag","config":{"tag":"vip"}},{"type":"update_score","config":{"score_change":20}},{"type":"assign_to","config":{"role":"manager"}},{"type":"notify_team","config":{"notification_message":"💎 LEAD VIP: {{lead_name}}, {{budget_formatted}} en {{zone}}. Asignado a manager.","for_role":"manager","level":"urgente"}}]',
 'starter', ARRAY[]::TEXT[], TRUE, 432, 4),

-- ═══════════════════ SEGUIMIENTO ═══════════════════

('Follow-up 24h sin respuesta',
 'Si el lead no responde en 24 horas, el Vendedor IA envía un mensaje de seguimiento',
 'seguimiento', 'basica', 'no_response_hours', '{"hours":24}',
 '[{"field":"ia_score","operator":"gte","value":30},{"field":"pipeline_stage","operator":"neq","value":"cerrado"}]',
 '[{"type":"activate_agent","config":{"agent_type":"vendedor","prompt_template":"{{lead_name}} no ha respondido en 24h. Etapa: {{stage_label}}, score: {{score}}/100, zona: {{zone}}. Genera follow-up breve y sin presión (máximo 2 frases). Pregunta si sigue interesado o tiene dudas que puedas resolver.","auto_send_whatsapp":true}}]',
 'starter', ARRAY['whatsapp'], TRUE, 2341, 5),

('Reactivación urgente lead caliente 72h',
 'Lead con score alto que lleva 72h sin responder — mensaje de reactivación con valor real',
 'seguimiento', 'basica', 'no_response_hours', '{"hours":72}',
 '[{"field":"ia_score","operator":"gte","value":65}]',
 '[{"type":"activate_agent","config":{"agent_type":"vendedor","prompt_template":"Lead caliente {{lead_name}} ({{score_emoji}} {{score}}/100) lleva 72h sin responder. Zona {{zone}}, {{budget_formatted}}. Genera mensaje de reactivación con algo de valor: propiedad nueva, dato de mercado, o pregunta diferente. No suenes desesperado. 2-3 frases.","auto_send_whatsapp":true}},{"type":"notify_team","config":{"notification_message":"🚨 {{lead_name}} (score {{score}}) lleva 72h sin responder. Mensaje de reactivación enviado.","for_role":"manager","level":"urgente"}},{"type":"create_task","config":{"title":"Llamar a {{lead_name}} si no responde al mensaje de reactivación","due_hours":4,"priority":"alta","assign_to":"comercial"}}]',
 'starter', ARRAY['whatsapp'], TRUE, 1876, 6),

('Nurturing mensual leads fríos',
 'Cada mes, los leads fríos reciben contenido de valor del mercado de su zona',
 'seguimiento', 'basica', 'time_schedule', '{"cron":"0 10 1 * *"}',
 '[{"field":"ia_score","operator":"lt","value":40}]',
 '[{"type":"activate_agent","config":{"agent_type":"nurturing","prompt_template":"Lead frío {{lead_name}}, buscaba en {{zone}} con {{budget_formatted}}. Genera mensaje mensual de valor (2-3 frases): menciona algo útil del mercado en {{zone}}, {{agency_city}}. Tono personal, no de campaña.","auto_send_whatsapp":true}}]',
 'starter', ARRAY['whatsapp'], FALSE, 1102, 7),

('Rescate post-pérdida a 6 meses',
 'Los leads marcados como perdidos reciben un check-in a los 6 meses',
 'seguimiento', 'intermedia', 'time_schedule', '{"cron":"0 11 1 */6 *"}',
 '[{"field":"pipeline_stage","operator":"eq","value":"perdido"}]',
 '[{"type":"activate_agent","config":{"agent_type":"nurturing","prompt_template":"{{lead_name}} fue marcado como perdido hace meses. Han pasado 6 meses. Genera mensaje muy breve y sin expectativas: ¿sigues buscando en {{zone}}? ¿Ha cambiado algo? Tono de genuino interés, no de venta.","auto_send_whatsapp":true}}]',
 'starter', ARRAY['whatsapp'], FALSE, 567, 8),

-- ═══════════════════ VISITAS ═══════════════════

('Recordatorio de visita 24h antes',
 'El Agendador IA recuerda la visita y pide confirmación al lead',
 'visitas', 'basica', 'time_schedule', '{"hours_before_visit":24}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"agendador","prompt_template":"Genera recordatorio de visita para {{lead_name}} en {{agency_name}}. Incluye: hora, pide confirmación, datos de contacto de la agencia ({{agency_phone}}). Tono amable.","auto_send_whatsapp":true}},{"type":"create_task","config":{"title":"Preparar briefing visita {{lead_name}}","due_hours":20,"priority":"alta","assign_to":"comercial"}}]',
 'starter', ARRAY['whatsapp'], TRUE, 1543, 9),

('Seguimiento post-visita',
 'El Vendedor IA contacta al lead 3h después de la visita para recoger feedback',
 'visitas', 'basica', 'visit_completed', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"vendedor","prompt_template":"{{lead_name}} terminó la visita hace 3 horas. Genera mensaje de seguimiento cálido: agradece el tiempo, pregunta qué le pareció, ofrece resolver dudas, sugiere siguiente paso sutilmente.","auto_send_whatsapp":true}},{"type":"update_score","config":{"score_change":12}},{"type":"create_task","config":{"title":"Llamar a {{lead_name}} si no responde al seguimiento post-visita","due_hours":24,"priority":"alta","assign_to":"comercial"}}]',
 'starter', ARRAY['whatsapp'], TRUE, 1287, 10),

('Rescate tras no-show',
 'El lead no apareció a la visita — mensaje comprensivo y propuesta de reagendamiento',
 'visitas', 'basica', 'visit_no_show', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"agendador","prompt_template":"{{lead_name}} no se presentó a la visita. Genera mensaje comprensivo (sin reproches), propone 2-3 nuevos horarios esta semana, menciona que también hay otra propiedad similar disponible. Tono amable.","auto_send_whatsapp":true}},{"type":"update_score","config":{"score_change":-10}},{"type":"add_tag","config":{"tag":"no-show"}}]',
 'starter', ARRAY['whatsapp'], FALSE, 743, 11),

('Briefing completo para el comercial',
 'El Agendador IA prepara el briefing del lead para el comercial 2h antes de la visita',
 'visitas', 'intermedia', 'time_schedule', '{"hours_before_visit":2}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"agendador","prompt_template":"Genera briefing pre-visita PARA EL COMERCIAL (no para el lead) de {{agency_name}}. Lead: {{lead_name}}, busca {{zone}}, {{budget_formatted}}, score {{score_emoji}} {{score}}. Incluye: perfil y motivación, puntos a destacar según su perfil, posibles objeciones y cómo manejarlas, objetivo de la visita.","destinations":[{"type":"internal_notification"},{"type":"slack"}]}}]',
 'profesional', ARRAY['slack'], FALSE, 892, 12),

-- ═══════════════════ PIPELINE ═══════════════════

('Documentación en negociación',
 'Al llegar a negociación, solicita documentos y calcula viabilidad financiera',
 'pipeline', 'intermedia', 'stage_changed', '{"to_stage":"negociacion"}', '[]',
 '[{"type":"request_documents","config":{"document_types":["dni","nomina","extracto","vida_laboral"]}},{"type":"activate_agent","config":{"agent_type":"financiero","prompt_template":"{{lead_name}} en negociación, presupuesto {{budget_formatted}}. Genera mensaje con estimación de gastos totales (entrada 20% + impuestos ~10% + notaría ~1% = total necesario) y cuota hipotecaria aproximada a 25 años.","auto_send_whatsapp":false,"destinations":[{"type":"email_sendgrid","subject_template":"Próximos pasos para tu operación — {{agency_name}}"}]}},{"type":"notify_team","config":{"notification_message":"💼 {{lead_name}} en NEGOCIACIÓN. Documentación solicitada.","for_role":"manager","level":"importante"}},{"type":"create_task","config":{"title":"Revisar documentación {{lead_name}} cuando llegue","due_hours":72,"priority":"alta","assign_to":"manager"}}]',
 'profesional', ARRAY['email'], TRUE, 1023, 13),

('Lead caliente sin asignar — acción urgente',
 'Score alto sin comercial asignado — asignación automática y alerta',
 'pipeline', 'basica', 'score_threshold', '{"threshold":80,"direction":"above"}',
 '[{"field":"assigned_to","operator":"is_null","value":null}]',
 '[{"type":"assign_to","config":{"role":"comercial"}},{"type":"notify_team","config":{"notification_message":"🔥 {{lead_name}} ({{score}}/100) sin asignar. Zona: {{zone}}, {{budget_formatted}}. Asignado automáticamente.","for_role":"manager","level":"urgente"}}]',
 'starter', ARRAY[]::TEXT[], TRUE, 1567, 14),

('Cierre: celebración + solicitar referidos',
 'Operación cerrada — felicitación al lead y solicitud de referidos de forma natural',
 'pipeline', 'basica', 'stage_changed', '{"to_stage":"cerrado"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"vendedor","prompt_template":"Operación cerrada con {{lead_name}} en {{agency_name}}. Genera mensaje de felicitación genuino: celebra el momento, ofrece ayuda post-compra, y de forma muy natural al final menciona que si conocen a alguien buscando algo similar, estarán encantados de ayudar. Sin presión comercial.","auto_send_whatsapp":true}},{"type":"notify_team","config":{"notification_message":"🎉 CIERRE: {{lead_name}}. ¡Enhorabuena al equipo!","for_role":"all","level":"importante"}},{"type":"create_task","config":{"title":"Pedir reseña Google a {{lead_name}} (en 2 semanas)","due_hours":336,"priority":"media","assign_to":"comercial"}}]',
 'starter', ARRAY['whatsapp'], TRUE, 1234, 15),

-- ═══════════════════ REPORTES ═══════════════════

('Briefing matutino del equipo',
 'Cada mañana laborable el equipo recibe sus leads prioritarios y tareas del día',
 'reportes', 'basica', 'time_schedule', '{"cron":"0 8 * * 1-5"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"notificador","prompt_template":"Genera briefing matutino para el equipo de {{agency_name}} en {{agency_city}}. Formato: saludo motivador, recordatorio de revisar leads sin respuesta, consejo de ventas inmobiliarias del día, y emoji de energía. Máximo 5 líneas.","destinations":[{"type":"internal_notification"},{"type":"slack"}]}}]',
 'starter', ARRAY[]::TEXT[], FALSE, 876, 16),

('Informe semanal → email + Slack',
 'Lunes 8:30: análisis ejecutivo del equipo para el manager con KPIs y recomendaciones',
 'reportes', 'intermedia', 'time_schedule', '{"cron":"30 8 * * 1"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"analista","prompt_template":"Informe semanal para {{agency_name}}, {{agency_city}}. Genera: resumen ejecutivo del pipeline (3 bullets), 3 métricas clave con benchmarks del sector inmobiliario, top oportunidades de la semana, y 3 acciones prioritarias. Formato para email y Slack.","destinations":[{"type":"email_sendgrid","subject_template":"📊 Informe semanal {{agency_name}} — {{date}}"},{"type":"slack"}]}}]',
 'profesional', ARRAY['email'], TRUE, 743, 17),

('Forecast mensual → email dirección',
 'Primer día del mes: previsión de cierres y revenue estimado',
 'reportes', 'avanzada', 'time_schedule', '{"cron":"0 9 1 * *"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"analista","prompt_template":"Forecast de {{month}} {{year}} para {{agency_name}}. Genera: probabilidades de cierre por etapa (negociacion=65%, visita=35%, interesado=15%), revenue estimado del mes, top 3 operaciones a priorizar, 2 riesgos a mitigar, y plan de acción. Formato ejecutivo con tabla.","destinations":[{"type":"email_sendgrid","subject_template":"📈 Forecast {{month}} — {{agency_name}}"},{"type":"google_sheets"},{"type":"slack"}]}}]',
 'profesional', ARRAY['email'], FALSE, 432, 18),

-- ═══════════════════ N8N / INTEGRACIONES ═══════════════════

('[n8n] New lead → Slack con análisis IA',
 'Replica el flujo n8n más usado: lead nuevo → Slack con score, zona, presupuesto y siguiente acción',
 'n8n', 'basica', 'lead_created', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Nuevo lead en {{agency_name}}: {{lead_name}}, {{phone}}, {{email}}, desde {{source_label}}. Zona: {{zone}}, presupuesto: {{budget_formatted}}. Genera mensaje Slack (4 líneas máx): datos clave, score estimado con emoji, y acción inmediata para el equipo.","save_to_conversation":false,"destinations":[{"type":"slack"}]}},{"type":"assign_to","config":{"role":"comercial"}},{"type":"change_stage","config":{"new_stage":"contactado"}}]',
 'starter', ARRAY['slack'], TRUE, 2134, 19),

('[n8n] Lead nuevo → Google Sheets backup',
 'Replica "New lead to spreadsheet" de n8n: cada lead se añade automáticamente a tu hoja de cálculo',
 'n8n', 'basica', 'lead_created', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Genera línea para Google Sheets (valores separados por |): {{date}}|{{lead_name}}|{{phone}}|{{email}}|{{zone}}|{{budget_max}}|{{operation_type}}|{{source_label}}|{{score}}|{{stage_label}}|{{agency_name}}. Solo esa línea.","save_to_conversation":false,"destinations":[{"type":"google_sheets"},{"type":"airtable"}]}}]',
 'profesional', ARRAY['sheets'], FALSE, 1876, 20),

('[n8n] Stage change → webhook CRM externo',
 'Sincroniza cambios de etapa con HubSpot, Pipedrive, Salesforce o cualquier CRM vía webhook',
 'n8n', 'intermedia', 'stage_changed', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"coordinador","prompt_template":"{{lead_name}} cambió a etapa {{stage_label}}. Score: {{score}}. Genera JSON para CRM externo con todos los datos del lead.","save_to_conversation":false,"destinations":[{"type":"webhook","payload_template":"{\"event\":\"stage_changed\",\"lead_name\":\"{{lead_name}}\",\"phone\":\"{{phone}}\",\"email\":\"{{email}}\",\"stage\":\"{{stage}}\",\"score\":{{score}},\"zone\":\"{{zone}}\",\"budget\":{{budget_max}},\"agency\":\"{{agency_name}}\",\"timestamp\":\"{{datetime}}\"}"}]}}]',
 'profesional', ARRAY['webhook'], TRUE, 1234, 21),

('[n8n] Deal closed → Airtable + Notion + Slack',
 'Cierre de operación sincronizado en Airtable, Notion y Slack simultáneamente',
 'n8n', 'avanzada', 'stage_changed', '{"to_stage":"cerrado"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"analista","prompt_template":"Cierre en {{agency_name}}: {{lead_name}}, zona {{zone}}, presupuesto {{budget_formatted}}, {{days_in_crm}} días hasta cierre, origen {{source_label}}. Genera: mensaje de celebración para Slack (2 líneas con emojis) y análisis de aprendizaje (qué funcionó, perfil del cliente, lección para futuros leads). Separa con ---APRENDIZAJE---","save_to_conversation":false,"destinations":[{"type":"slack"},{"type":"airtable"},{"type":"notion"}]}}]',
 'agencia', ARRAY['slack','airtable','notion'], FALSE, 654, 22),

('[n8n] Weekly report → email + Sheets + Slack',
 'El informe semanal más completo: métricas, forecast y KPIs distribuidos en todos los canales',
 'n8n', 'avanzada', 'time_schedule', '{"cron":"30 8 * * 1"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"analista","prompt_template":"Informe semanal completo para {{agency_name}}, {{agency_city}}. SECCIÓN EMAIL: resumen ejecutivo con KPIs (leads, visitas, negociaciones, cierres), benchmark vs sector inmobiliario, top 3 acciones para esta semana. SECCIÓN SHEETS (una línea): {{date}}|leads|contactados|visitas|cierres|score_promedio. SECCIÓN SLACK (3 líneas con emojis): bullets más importantes. Separa con ---SHEETS--- y ---SLACK---","save_to_conversation":false,"destinations":[{"type":"email_sendgrid","subject_template":"📊 Weekly report {{agency_name}} — {{date}}"},{"type":"google_sheets"},{"type":"slack"}]}}]',
 'agencia', ARRAY['email','sheets','slack'], TRUE, 543, 23),

('[n8n] AI property description → portales',
 'Nueva propiedad en el CRM → Copywriter IA genera descripción SEO completa y la envía vía webhook',
 'n8n', 'intermedia', 'lead_created', '{"property_added":true}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"copywriter","prompt_template":"Nueva propiedad de {{agency_name}}, {{agency_city}}. Genera: TITULO: (SEO, máx 70 chars) DESCRIPCION_CORTA: (2-3 frases gancho) DESCRIPCION_LARGA: (300 palabras, emocional + características + CTA) BULLET_POINTS: (5 beneficios con •) KEYWORDS: (10 long-tail locales). Contacto al final: {{agency_email}}, {{agency_phone}}.","save_to_conversation":false,"destinations":[{"type":"webhook","payload_template":"{\"action\":\"new_property\",\"agency\":\"{{agency_name}}\",\"city\":\"{{agency_city}}\",\"content\":\"{{content}}\",\"timestamp\":\"{{datetime}}\"}"},{"type":"notion"}]}}]',
 'profesional', ARRAY['webhook'], FALSE, 876, 24),

('[n8n] Sentiment analysis → strategy adjustment',
 'Analiza el sentimiento de cada mensaje del lead y ajusta automáticamente la estrategia',
 'n8n', 'avanzada', 'message_received', '{}',
 '[{"field":"ia_score","operator":"gte","value":45}]',
 '[{"type":"activate_agent","config":{"agent_type":"coordinador","prompt_template":"Análisis de conversación: {{lead_name}}, score {{score_emoji}} {{score}}/100, etapa {{stage_label}}. Perfil: {{lead_summary}}. Analiza y responde exactamente en este formato: SENTIMIENTO: positivo/neutro/negativo/dubitativo | SEÑAL: descripción breve | ESTRATEGIA: qué tipo de respuesta enviar | ACCION: qué hacer en las próximas 2h","save_to_conversation":false,"destinations":[{"type":"crm_field","crm_field":"ia_next_action"},{"type":"webhook","payload_template":"{\"event\":\"sentiment_analyzed\",\"lead\":\"{{lead_name}}\",\"score\":{{score}},\"analysis\":\"{{content}}\",\"agency\":\"{{agency_name}}\"}"}]}}]',
 'agencia', ARRAY['webhook'], FALSE, 432, 25);
```

---

## PARTE 7 — PANEL DE ADMIN DEL SAAS (Solo para el dueño de PropIA)

### Solo visible para el super-admin — métricas globales del SaaS

```tsx
// app/(admin)/admin/page.tsx
// Ruta protegida — solo accesible si user.role === 'super_admin'

// Métricas que ve el dueño de PropIA:
// - Total de inmobiliarias registradas
// - MRR (Monthly Recurring Revenue)
// - Nuevos registros esta semana
// - Inmobiliarias por plan
// - Automatizaciones ejecutadas en total (últimas 24h)
// - Leads procesados por todos los agentes IA hoy
// - Coste de OpenRouter del mes (tokens usados)
// - Inmobiliarias en trial vs activas vs churned
// - Plantillas más instaladas
```

```sql
-- Vista para el panel de admin del SaaS (sin datos privados de agencias)
CREATE OR REPLACE VIEW saas_metrics AS
SELECT
  (SELECT COUNT(*) FROM agencies)                    AS total_agencies,
  (SELECT COUNT(*) FROM agencies WHERE plan_status = 'active')  AS active_agencies,
  (SELECT COUNT(*) FROM agencies WHERE plan_status = 'trialing') AS trial_agencies,
  (SELECT COUNT(*) FROM agencies WHERE created_at > NOW() - INTERVAL '7 days') AS new_this_week,
  (SELECT COUNT(*) FROM agencies WHERE plan = 'starter')         AS plan_starter,
  (SELECT COUNT(*) FROM agencies WHERE plan = 'profesional')     AS plan_profesional,
  (SELECT COUNT(*) FROM agencies WHERE plan = 'agencia')         AS plan_agencia,
  (SELECT COUNT(*) FROM leads WHERE created_at > NOW() - INTERVAL '24 hours')  AS leads_today,
  (SELECT COUNT(*) FROM activities WHERE type = 'ia_action' AND created_at > NOW() - INTERVAL '24 hours') AS ai_actions_today,
  (SELECT COUNT(*) FROM automation_logs WHERE created_at > NOW() - INTERVAL '24 hours') AS automations_today;
```

---

## PARTE 8 — ORDEN DE IMPLEMENTACIÓN

```
PASO 1 — SQL base:
  a) Ejecutar CREATE TABLE agencies con todas las columnas de credenciales
  b) Ejecutar Row Level Security en todas las tablas
  c) Ejecutar CREATE FUNCTION auth.agency_id()
  d) Ejecutar CREATE FUNCTION get_automation_context()
  e) Ejecutar CREATE TABLE automation_templates
  f) Ejecutar CREATE FUNCTION install_template()
  g) Ejecutar INSERT de las 25 plantillas globales
  h) Ejecutar CREATE VIEW saas_metrics

PASO 2 — Archivos a crear:
  a) lib/auth/get-agency.ts           ← helper que todos los endpoints usan
  b) app/api/auth/register/route.ts   ← crea agencia al registrarse
  c) app/api/templates/route.ts       ← listar plantillas disponibles
  d) app/api/templates/[id]/install/route.ts  ← instalar en la agencia

PASO 3 — Páginas nuevas:
  a) app/(auth)/register/page.tsx     ← formulario de registro con creación de agencia
  b) app/(dashboard)/automations/templates/page.tsx ← marketplace de plantillas
  c) app/(admin)/admin/page.tsx       ← panel super-admin del SaaS

PASO 4 — Corregir bug crítico en TODOS los endpoints y SQL:
  a) Buscar y reemplazar: "SELECT id FROM agencies LIMIT 1"
     por: usar auth.agency_id() o el agency_id del usuario autenticado
  b) Todos los INSERT deben tener agency_id del usuario, no hardcodeado
  c) Todos los SELECT deben filtrar por agency_id

PASO 5 — Actualizar el onboarding:
  a) Tras registro, redirigir a /onboarding con los 4 pasos
  b) Paso 1: conectar WhatsApp (y probar)
  c) Paso 2: conectar email (y probar)
  d) Paso 3: añadir primera propiedad
  e) Paso 4: activar agentes y elegir primeras plantillas

PASO 6 — Verificar aislamiento:
  a) Crear 2 agencias de prueba
  b) Añadir leads a cada una
  c) Verificar que ninguna ve los datos de la otra
  d) Verificar que las automatizaciones usan las credenciales de cada una
```

---

## RESUMEN DEL CONCEPTO

```
PropIA = SaaS multi-tenant para inmobiliarias

Inmobiliaria A (García Realty, Sevilla)
├── Sus leads (100)
├── Sus propiedades (45)
├── Sus credenciales (WhatsApp +34 600 111, Slack #ventas)
├── Sus automatizaciones (15 activas)
└── Sus agentes IA configurados con su tono y ciudad

Inmobiliaria B (BcnHomes, Barcelona)
├── Sus leads (230)
├── Sus propiedades (120)
├── Sus credenciales (WhatsApp +34 700 222, Sendgrid key2)
├── Sus automatizaciones (8 activas)
└── Sus agentes IA configurados con su tono y ciudad

Inmobiliaria C (MalagaSur, Málaga)
├── Sus leads (67)
└── ... completamente separada

PropIA Admin (tú)
└── Ves métricas globales: 3 agencias, X leads totales, Y MRR
    Pero NUNCA los datos privados de ninguna
```
