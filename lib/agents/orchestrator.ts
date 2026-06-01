import { SupabaseClient } from '@supabase/supabase-js'
import { AGENTS, AgentType, getAgent } from './definitions'
import { askAI, parseAgentReply } from '../openrouter/client'
import { ActionExecutor } from '../actions/executor'

export interface OrchestrationContext {
  leadId:     string
  agencyId:   string
  trigger:    string
  payload?:   Record<string, unknown>
}

export interface AgentResult {
  agentType:        AgentType
  success:          boolean
  message:          string          // texto generado para el lead/equipo
  data:             Record<string, unknown> | null  // JSON estructurado
  actionsExecuted:  string[]
  leadsUpdated:     boolean
  error?:           string
  durationMs:       number
}

export class AgentOrchestrator {
  constructor(
    private supabase: SupabaseClient,
    private agencyId: string
  ) {}

  // Punto de entrada principal — decide qué agente actúa
  async runForLead(
    leadId: string,
    trigger: string,
    payload?: Record<string, unknown>
  ): Promise<AgentResult[]> {
    const lead = await this.loadLead(leadId)
    if (!lead) return []

    const agencyData = await this.loadAgency()
    const ctx = this.buildContext(lead, agencyData, trigger, payload)

    // Decidir agente según el trigger y el estado del lead
    const agentType = this.decideAgent(trigger, lead, payload)
    if (!agentType) return []

    const result = await this.runAgent(agentType, ctx, lead)

    // Si el agente dice escalar → activar siguiente agente
    if (result.data?.escalate && result.data?.escalate_reason) {
      const nextAgent = this.getEscalationAgent(agentType, lead)
      if (nextAgent) {
        const escalationResult = await this.runAgent(nextAgent, ctx, lead)
        return [result, escalationResult]
      }
    }

    return [result]
  }

  // Decidir qué agente debe actuar según el contexto
  private decideAgent(
    trigger: string,
    lead: Record<string, unknown>,
    payload?: Record<string, unknown>
  ): AgentType | null {
    const score = Number(lead.ia_score ?? 0)
    const stage = String(lead.pipeline_stage ?? 'nuevo')

    switch (trigger) {
      case 'lead_created':
        return 'captador'

      case 'message_received':
        if (score >= 70) return 'vendedor'
        if (score >= 40) return 'captador'
        return 'nurturing'

      case 'stage_changed':
        const toStage = String(payload?.to_stage ?? '')
        if (toStage === 'negociacion') return 'coordinador'
        if (toStage === 'visita_agendada') return 'agendador'
        if (toStage === 'reserva') return 'documentador'
        return 'vendedor'

      case 'no_response_hours':
        const hours = Number(payload?.hours ?? 24)
        if (score >= 70 && hours >= 48) return 'vendedor'
        if (score >= 40) return 'nurturing'
        return 'nurturing'

      case 'visit_completed':
        return 'vendedor'

      case 'visit_no_show':
        return 'agendador'

      case 'score_threshold':
        return 'coordinador'

      case 'valuation_request':
        return 'tasador'

      case 'mortgage_inquiry':
        return 'financiero'

      case 'document_request':
        return 'documentador'

      default:
        return null
    }
  }

  // Agente de escalado según el contexto
  private getEscalationAgent(
    currentAgent: AgentType,
    lead: Record<string, unknown>
  ): AgentType | null {
    const escalationMap: Partial<Record<AgentType, AgentType>> = {
      captador:    'coordinador',
      vendedor:    'coordinador',
      nurturing:   'vendedor',
      agendador:   'vendedor',
      documentador:'financiero',
    }
    return escalationMap[currentAgent] ?? null
  }

  // Ejecutar un agente específico
  async runAgent(
    agentType: AgentType,
    ctx: Record<string, unknown>,
    lead: Record<string, unknown>
  ): Promise<AgentResult> {
    const t0 = Date.now()
    const def = getAgent(agentType)
    if (!def) {
      return {
        agentType, success: false,
        message: '', data: null,
        actionsExecuted: [],
        leadsUpdated: false,
        error: `Agente ${agentType} no configurado`,
        durationMs: 0
      }
    }

    try {
      // Construir system prompt con contexto real
      const systemWithCtx = this.buildSystemPrompt(def.systemPrompt, ctx)

      // Llamar a la IA con Structured Output
      const userPrompt = this.buildUserPrompt(agentType, ctx, lead)

      const raw = await askAI({
        system: systemWithCtx,
        userMessage: userPrompt,
        model: def.model,
        temperature: def.temperature,
        maxTokens: def.maxTokens,
      })

      const { message, data } = parseAgentReply(raw)

      // Ejecutar acciones basadas en lo que devolvió la IA
      const executor = new ActionExecutor(this.supabase, this.agencyId)
      const actionsExecuted = await executor.executeFromAgentData(
        agentType, String(lead.id), ctx, message, data
      )

      // Actualizar lead con los datos del agente
      const leadsUpdated = await this.updateLeadFromAgentData(
        String(lead.id), agentType, data ?? {}
      )

      // Registrar actividad
      await this.logActivity(String(lead.id), agentType, message, data)

      // Actualizar stats del agente en ai_agents
      await this.updateAgentStats(agentType)

      return {
        agentType, success: true,
        message: message || raw,
        data,
        actionsExecuted,
        leadsUpdated,
        durationMs: Date.now() - t0,
      }
    } catch (err) {
      return {
        agentType, success: false,
        message: '', data: null,
        actionsExecuted: [],
        leadsUpdated: false,
        error: String(err),
        durationMs: Date.now() - t0,
      }
    }
  }

  private buildSystemPrompt(
    basePrompt: string,
    ctx: Record<string, unknown>
  ): string {
    const now = new Date()
    return `${basePrompt}

═══ CONTEXTO ACTUAL ═══
Agencia: ${ctx.agency_name}
Ciudad: ${ctx.agency_city}
Lead: ${ctx.lead_name} | Teléfono: ${ctx.phone}
Score IA: ${ctx.score}/100 (${ctx.score_label})
Etapa pipeline: ${ctx.stage_label}
Zona de interés: ${ctx.zone}
Presupuesto: ${ctx.budget_formatted}
Tipo operación: ${ctx.operation_type}
Urgencia: ${ctx.urgency}
${ctx.lead_summary ? `Resumen: ${ctx.lead_summary}` : ''}
${ctx.days_since_contact ? `Días sin contacto: ${ctx.days_since_contact}` : ''}
Fecha y hora: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`
  }

  private buildUserPrompt(
    agentType: AgentType,
    ctx: Record<string, unknown>,
    lead: Record<string, unknown>
  ): string {
    const prompts: Record<AgentType, string> = {
      captador:     `Nuevo lead que necesita cualificación. Genera el mensaje de primer contacto y asigna el score inicial basándote en los datos disponibles del lead.`,
      vendedor:     `El lead ${ctx.lead_name} está activo. Genera la respuesta más efectiva para avanzar hacia el cierre. Si tiene objeciones, manéjalas. Si muestra señales de cierre, escala.`,
      coordinador:  `Analiza el estado del pipeline de la agencia y genera recomendaciones de orquestación. ¿A quién asignar este lead? ¿Qué agente debe actuar ahora?`,
      copywriter:   `Genera contenido de marketing inmobiliario de alta conversión para esta agencia y sus propiedades actuales.`,
      tasador:      `Realiza una valoración de mercado para la propiedad o zona especificada. Incluye análisis comparativo y recomendación de precio.`,
      analista:     `Analiza el rendimiento del CRM y pipeline. Identifica cuellos de botella, oportunidades y genera el informe ejecutivo.`,
      agendador:    `Gestiona la agenda de visitas. Propón horarios, confirma o reagenda según el contexto.`,
      nurturing:    `El lead está en fase de nurturing. Genera el mensaje apropiado para mantener la relación sin presión.`,
      documentador: `Gestiona la documentación de la operación. Solicita lo que falta o confirma lo recibido.`,
      seo:          `Optimiza el contenido SEO de las propiedades y genera contenido para el blog de la agencia.`,
      financiero:   `Calcula la viabilidad financiera, cuota hipotecaria y gastos totales de la operación.`,
      notificador:  `Genera la notificación o alerta apropiada para el equipo según el contexto actual.`,
    }
    return prompts[agentType]
  }

  private async updateLeadFromAgentData(
    leadId: string,
    agentType: AgentType,
    data: Record<string, unknown>
  ): Promise<boolean> {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    }

    if (agentType === 'captador') {
      if (data.score !== undefined) {
        const score = Number(data.score)
        updates.ia_score = score
        updates.ia_score_label = score > 75 ? 'caliente' : score > 40 ? 'templado' : 'frio'
      }
      if (Array.isArray(data.insights)) updates.ia_insights = data.insights
      if (data.next_action) updates.ia_next_action = String(data.next_action)
      const d = (data.datos_captados ?? {}) as Record<string, unknown>
      if (d.operation_type) updates.operation_type = d.operation_type
      if (d.budget_max && Number(d.budget_max) > 0) updates.budget_max = Number(d.budget_max)
      if (Array.isArray(d.zones) && d.zones.length) updates.zones = d.zones
      if (d.urgency) updates.urgency = d.urgency
    }

    if (agentType === 'vendedor' && data.score_change) {
      const { data: lead } = await this.supabase
        .from('leads').select('ia_score').eq('id', leadId).single()
      const newScore = Math.max(0, Math.min(100,
        (lead?.ia_score ?? 50) + Number(data.score_change)
      ))
      updates.ia_score = newScore
      updates.ia_score_label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio'
      if (data.stage_change) updates.pipeline_stage = data.stage_change
    }

    if (Object.keys(updates).length > 2) {
      const { error } = await this.supabase.from('leads')
        .update(updates).eq('id', leadId).eq('agency_id', this.agencyId)
      return !error
    }
    return false
  }

  private async logActivity(
    leadId: string,
    agentType: AgentType,
    message: string,
    data: Record<string, unknown> | null
  ) {
    await this.supabase.from('activities').insert({
      lead_id:    leadId,
      agency_id:  this.agencyId,
      type:       'ia_action',
      title:      `${AGENTS[agentType].name} ejecutado`,
      description: message.slice(0, 400),
      agent_type:  agentType,
      metadata:    { has_json_data: !!data, score: data?.score, escalate: data?.escalate },
    })
  }

  private async updateAgentStats(agentType: AgentType) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { count } = await this.supabase.from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', this.agencyId).eq('agent_type', agentType)
      .gte('created_at', today.toISOString())

    await this.supabase.from('ai_agents').update({
      stats: {
        leads_today:   count ?? 0,
        last_action:   new Date().toISOString(),
        last_action_text: `${AGENTS[agentType].name} ejecutado`,
      },
      updated_at: new Date().toISOString(),
    }).eq('agency_id', this.agencyId).eq('type', agentType)
  }

  private async loadLead(leadId: string) {
    const { data } = await this.supabase
      .from('leads').select('*').eq('id', leadId)
      .eq('agency_id', this.agencyId).single()
    return data
  }

  private async loadAgency() {
    const { data } = await this.supabase
      .from('agencies').select('*').eq('id', this.agencyId).single()
    return data
  }

  private buildContext(
    lead: Record<string, unknown>,
    agency: Record<string, unknown> | null,
    trigger: string,
    payload?: Record<string, unknown>
  ): Record<string, unknown> {
    const score = Number(lead.ia_score ?? 0)
    const budgetMax = Number(lead.budget_max ?? 0)
    const lastContact = lead.last_contact_at
      ? Math.floor((Date.now() - new Date(String(lead.last_contact_at)).getTime()) / 86400000)
      : null

    return {
      lead_id:          lead.id,
      lead_name:        lead.name,
      lead_first_name:  String(lead.name ?? '').split(' ')[0],
      phone:            lead.phone ?? '',
      email:            lead.email ?? '',
      score,
      score_label:      score > 75 ? 'caliente' : score > 40 ? 'templado' : 'frío',
      score_emoji:      score > 75 ? '🔥' : score > 40 ? '🟡' : '❄️',
      stage:            lead.pipeline_stage,
      stage_label:      STAGE_LABELS[String(lead.pipeline_stage)] ?? String(lead.pipeline_stage),
      zone:             (lead.zones as string[])?.[0] ?? '',
      budget_max:       budgetMax,
      budget_formatted: budgetMax > 0
        ? new Intl.NumberFormat('es-ES').format(budgetMax) + '€'
        : 'no especificado',
      operation_type:   lead.operation_type ?? 'compra',
      urgency:          lead.urgency ?? 'media',
      source:           lead.source ?? 'manual',
      lead_summary:     lead.ia_summary ?? '',
      tags:             Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
      days_since_contact: lastContact,
      agency_id:        agency?.id,
      agency_name:      agency?.name ?? 'Mi Agencia',
      agency_city:      agency?.city ?? 'España',
      agency_email:     agency?.email ?? '',
      agency_phone:     agency?.phone ?? '',
      agency_whatsapp:  agency?.whatsapp_number ?? '',
      // Credenciales para los executors
      wa_token:         agency?.wa_token ?? '',
      wa_phone_id:      agency?.wa_phone_id ?? '',
      sg_key:           agency?.sendgrid_key ?? '',
      sg_from_email:    agency?.sendgrid_from_email ?? '',
      sg_from_name:     agency?.sendgrid_from_name ?? agency?.name ?? '',
      telegram_token:   agency?.telegram_token ?? '',
      telegram_chat:    agency?.telegram_chat ?? '',
      slack_webhook:    agency?.slack_webhook ?? '',
      trigger,
      ...payload,
    }
  }
}

const STAGE_LABELS: Record<string, string> = {
  nuevo: 'Nuevo Lead', contactado: 'Contactado', interesado: 'Interesado',
  visita_agendada: 'Visita agendada', negociacion: 'En negociación',
  reserva: 'Reserva', cerrado: 'Cerrado', perdido: 'Perdido',
}
