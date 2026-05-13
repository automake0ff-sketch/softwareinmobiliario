---
name: propia-frameworks
description: >
  Guía de frameworks, patrones y convenciones de código para PropIA. Usa esta skill
  SIEMPRE que escribas código para PropIA: componentes React, API routes de Next.js,
  queries a Supabase, jobs de BullMQ, integraciones de WhatsApp, o cualquier parte
  del stack técnico. También actívala cuando el usuario pregunte sobre "cómo hacer X
  en PropIA", "estructura del código", "patrón para Y", "cómo implementar Z en Next.js",
  o cuando necesites crear nuevas páginas, componentes, workers o endpoints para el SaaS.
  Contiene patrones probados y convenciones del proyecto para evitar errores comunes.
---

# PropIA — Frameworks y Patrones de Código

## Stack Técnico

| Capa | Framework | Versión | Uso |
|------|-----------|---------|-----|
| Frontend | Next.js App Router | 14.x | SSR + API Routes |
| UI Components | shadcn/ui + Tailwind | latest | Sistema de diseño |
| Animaciones | Framer Motion | 11.x | Micro-interacciones |
| Drag & Drop | @dnd-kit/core | 6.x | Pipeline Kanban |
| Estado global | Zustand | 4.x | Store del cliente |
| Server state | TanStack Query | 5.x | Cache + sync |
| Base de datos | Supabase (PostgreSQL) | 2.x | Auth + DB + Realtime |
| Cola de jobs | BullMQ + Upstash Redis | 5.x | Procesamiento async |
| IA | @anthropic-ai/sdk | latest | Agentes Claude |
| WhatsApp | Meta Graph API | v18 | Mensajería |
| Email | @sendgrid/mail | 8.x | Email transaccional |
| Pagos | Stripe | 14.x | Suscripciones |
| Validación | Zod | 3.x | Schemas tipados |
| Forms | React Hook Form | 7.x | Formularios |
| PDF | @react-pdf/renderer | 3.x | Informes PDF |
| Testing | Vitest + Testing Library | latest | Tests unitarios |

## Estructura de Archivos — Convenciones

### Páginas (App Router)
```
app/(dashboard)/leads/page.tsx          ← Server Component (datos del servidor)
app/(dashboard)/leads/[id]/page.tsx     ← Server Component con params
app/(dashboard)/leads/[id]/loading.tsx  ← Skeleton loading automático
app/(dashboard)/leads/[id]/error.tsx    ← Error boundary
```

### Componentes
```typescript
// SIEMPRE: nombrar en PascalCase, un componente por archivo
// components/leads/LeadCard.tsx

'use client'  // Solo si necesita interactividad

import { type FC } from 'react'
import { type Lead } from '@/types/lead'

interface LeadCardProps {
  lead: Lead
  onSelect?: (id: string) => void
  compact?: boolean
}

export const LeadCard: FC<LeadCardProps> = ({ lead, onSelect, compact = false }) => {
  // ...
}
```

### API Routes
```typescript
// app/api/leads/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { z } from 'zod'

// Schema de validación SIEMPRE con Zod
const CreateLeadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/),
  email: z.string().email().optional(),
  budget_max: z.number().positive().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Verificar auth SIEMPRE
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validar input
    const body = await req.json()
    const parsed = CreateLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    // Obtener agency_id del usuario autenticado
    const { data: userData } = await supabase
      .from('users').select('agency_id').eq('id', user.id).single()

    // Operación en DB
    const { data, error } = await supabase.from('leads').insert({
      ...parsed.data,
      agency_id: userData.agency_id
    }).select().single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })

  } catch (err) {
    console.error('[POST /api/leads]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
```

### Hooks personalizados
```typescript
// hooks/useLeads.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type Lead } from '@/types/lead'

export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      const res = await fetch(`/api/leads?${params}`)
      if (!res.ok) throw new Error('Failed to fetch leads')
      return res.json() as Promise<Lead[]>
    },
    staleTime: 30_000, // 30 segundos de cache
  })
}

export function useUpdateLeadScore() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadId, score }: { leadId: string; score: number }) => {
      const res = await fetch(`/api/leads/${leadId}/score`, {
        method: 'PATCH',
        body: JSON.stringify({ score }),
        headers: { 'Content-Type': 'application/json' }
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    }
  })
}
```

### Zustand Store
```typescript
// store/usePipelineStore.ts

import { create } from 'zustand'
import { type Lead } from '@/types/lead'

interface PipelineStore {
  // Estado
  leads: Record<string, Lead[]>  // pipeline_stage → leads[]
  draggedLead: Lead | null
  activeFilters: PipelineFilters

  // Acciones
  setLeads: (stage: string, leads: Lead[]) => void
  moveLead: (leadId: string, fromStage: string, toStage: string) => void
  setDraggedLead: (lead: Lead | null) => void
  setFilters: (filters: Partial<PipelineFilters>) => void
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  leads: {},
  draggedLead: null,
  activeFilters: {},

  setLeads: (stage, leads) =>
    set(state => ({ leads: { ...state.leads, [stage]: leads } })),

  moveLead: (leadId, fromStage, toStage) =>
    set(state => {
      const from = state.leads[fromStage] || []
      const to = state.leads[toStage] || []
      const lead = from.find(l => l.id === leadId)
      if (!lead) return state

      return {
        leads: {
          ...state.leads,
          [fromStage]: from.filter(l => l.id !== leadId),
          [toStage]: [...to, { ...lead, pipeline_stage: toStage }]
        }
      }
    }),

  setDraggedLead: (lead) => set({ draggedLead: lead }),
  setFilters: (filters) => set(state => ({ activeFilters: { ...state.activeFilters, ...filters } }))
}))
```

### BullMQ Jobs
```typescript
// lib/queue/jobs.ts

import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'

export const agentQueue = new Queue('agent-jobs', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 }
  }
})

// Tipos de jobs tipados
export type AgentJob =
  | { type: 'process_new_lead'; leadId: string; agencyId: string; source: string }
  | { type: 'process_message'; leadId: string; messageId: string; agencyId: string }
  | { type: 'run_automation'; automationId: string; leadId: string; agencyId: string }
  | { type: 'daily_briefing'; agencyId: string; userId: string }
  | { type: 'nurturing_sequence'; leadId: string; sequenceId: string; step: number }

export async function enqueueAgentJob(job: AgentJob, delay?: number) {
  return agentQueue.add(job.type, job, {
    delay,
    priority: job.type === 'process_new_lead' ? 1 : 5  // leads nuevos = alta prioridad
  })
}
```

### Tipos TypeScript
```typescript
// types/lead.ts

export type PipelineStage =
  | 'nuevo' | 'contactado' | 'interesado' | 'visita_agendada'
  | 'negociacion' | 'reserva' | 'cerrado' | 'perdido' | 'archivo'

export type ScoreLabel = 'caliente' | 'templado' | 'frio'

export type LeadSource =
  | 'manual' | 'whatsapp' | 'web_form' | 'meta_ads'
  | 'idealista' | 'fotocasa' | 'habitaclia' | 'referido'

export interface Lead {
  id: string
  agency_id: string
  office_id?: string
  assigned_to?: string
  name: string
  phone?: string
  email?: string
  budget_min?: number
  budget_max?: number
  zones?: string[]
  property_type?: string
  bedrooms_min?: number
  operation_type: 'compra' | 'alquiler' | 'venta'
  urgency: 'alta' | 'media' | 'baja'
  pipeline_stage: PipelineStage
  ia_score: number
  ia_score_label: ScoreLabel
  ia_summary?: string
  ia_insights?: string[]
  ia_recommendations?: string[]
  source: LeadSource
  last_contact_at?: string
  created_at: string
  updated_at: string
}

// types/agent.ts
export type AgentType =
  | 'captador' | 'vendedor' | 'coordinador' | 'copywriter'
  | 'tasador' | 'analista' | 'agendador' | 'nurturing'
  | 'documentador' | 'seo' | 'financiero' | 'notificador'
```

## Patrones de Diseño UI

### Colores del sistema
```css
/* Siempre usar estas variables CSS — nunca hardcodear hex */
--bg-primary: #080811;
--bg-secondary: #0F0F1A;
--bg-card: #13131F;
--accent: #6366F1;          /* Violeta IA */
--score-hot: #10B981;       /* Verde caliente */
--score-warm: #F59E0B;      /* Ámbar templado */
--score-cold: #475569;      /* Gris frío */
--text-primary: #F1F5F9;
--text-secondary: #94A3B8;
--border: rgba(255,255,255,0.06);
```

### Skeleton Loading (patrón estándar)
```tsx
// Siempre proporcionar skeleton loading para datos async
export function LeadCardSkeleton() {
  return (
    <div className="bg-card rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-muted rounded w-3/4 mb-2" />
      <div className="h-3 bg-muted rounded w-1/2 mb-4" />
      <div className="h-6 bg-muted rounded w-1/4" />
    </div>
  )
}
```

### Optimistic Updates en Kanban
```tsx
// Al mover un lead en el kanban: actualizar UI primero, DB después
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return

  // 1. Actualizar store (inmediato)
  moveLead(active.id, fromStage, toStage)

  // 2. Sincronizar con DB (async)
  try {
    await fetch(`/api/leads/${active.id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage: toStage })
    })
  } catch {
    // Rollback si falla
    moveLead(active.id, toStage, fromStage)
    toast.error('Error al mover el lead')
  }
}
```

## Convenciones de Nomenclatura

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Componentes | PascalCase | `LeadCard.tsx` |
| Hooks | camelCase + use | `useLeads.ts` |
| Utils | camelCase | `formatCurrency.ts` |
| Types | PascalCase | `Lead`, `AgentType` |
| API routes | kebab-case | `/api/leads/[id]/score` |
| DB tablas | snake_case | `leads`, `ai_agents` |
| Constantes | UPPER_SNAKE | `MAX_LEADS_PER_PAGE` |

## Errores comunes a evitar

1. **No usar `any`** → Tipar siempre con los tipos de `types/`
2. **No hacer fetch en componentes** → Usar hooks de TanStack Query
3. **No acceder a DB en componentes cliente** → Solo en Server Components o API Routes
4. **No hardcodear agency_id** → Siempre del usuario autenticado
5. **No olvidar RLS** → Cada tabla tiene políticas de seguridad en Supabase
6. **No crear jobs síncronos** → Operaciones con Claude siempre van a la cola BullMQ
