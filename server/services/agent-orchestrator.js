import { get, run } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';
import { askAI, parseAgentReply } from './openrouter.js';
import { ActionExecutor } from './action-executor.js';
import { getAgentSystemPrompt, AGENT_META } from '../agents/index.js';

export class AgentOrchestrator {
  constructor(agencyId) {
    this.agencyId = agencyId;
  }

  async runForLead(leadId, trigger, payload = {}) {
    const lead = await this.loadLead(leadId);
    if (!lead) return [];

    const agencyData = await this.loadAgency();
    const ctx = this.buildContext(lead, agencyData, trigger, payload);

    const agentType = this.decideAgent(trigger, lead, payload);
    if (!agentType) return [];

    const result = await this.runAgent(agentType, ctx, lead);

    // Si el agente decide escalar → activar siguiente agente
    if (result.data?.escalate && result.data?.escalate_reason) {
      const nextAgent = this.getEscalationAgent(agentType, lead);
      if (nextAgent) {
        const escalationResult = await this.runAgent(nextAgent, ctx, lead);
        return [result, escalationResult];
      }
    }

    return [result];
  }

  decideAgent(trigger, lead, payload = {}) {
    const score = Number(lead.ia_score ?? 0);

    switch (trigger) {
      case 'lead_created':
        return 'captador';

      case 'message_received':
        if (score >= 70) return 'vendedor';
        if (score >= 40) return 'captador';
        return 'nurturing';

      case 'stage_changed':
        const toStage = String(payload?.to_stage ?? '');
        if (toStage === 'negociacion') return 'coordinador';
        if (toStage === 'visita_agendada') return 'agendador';
        if (toStage === 'reserva') return 'documentador';
        return 'vendedor';

      case 'no_response_hours':
        const hours = Number(payload?.hours ?? 24);
        if (score >= 70 && hours >= 48) return 'vendedor';
        if (score >= 40) return 'nurturing';
        return 'nurturing';

      case 'visit_completed':
        return 'vendedor';

      case 'visit_no_show':
        return 'agendador';

      case 'score_threshold':
        return 'coordinador';

      case 'valuation_request':
        return 'tasador';

      case 'mortgage_inquiry':
        return 'financiero';

      case 'document_request':
        return 'documentador';

      default:
        return null;
    }
  }

  getEscalationAgent(currentAgent, lead) {
    const escalationMap = {
      captador:    'coordinador',
      vendedor:    'coordinador',
      nurturing:   'vendedor',
      agendador:   'vendedor',
      documentador:'financiero',
    };
    return escalationMap[currentAgent] || null;
  }

  async runAgent(agentType, ctx, lead) {
    const t0 = Date.now();
    const systemPrompt = await getAgentSystemPrompt(agentType);
    if (!systemPrompt) {
      return {
        agentType, success: false,
        message: '', data: null,
        actionsExecuted: [],
        leadsUpdated: false,
        error: `Agente ${agentType} no configurado`,
        durationMs: 0
      };
    }

    try {
      const systemWithCtx = this.buildSystemPrompt(systemPrompt, ctx);
      const userPrompt = this.buildUserPrompt(agentType, ctx, lead);

      const config = AGENT_MODEL_CONFIG[agentType] || {};
      const raw = await askAI({
        system: systemWithCtx,
        userMessage: userPrompt,
        model: config.model || 'smart',
        temperature: config.temperature || 0.7,
        maxTokens: config.maxTokens || 1500,
      });

      const { message, data } = parseAgentReply(raw);
      // Sin fallback a raw: si parseAgentReply detectó basura (respuesta de
      // moderación/clasificación en vez de contenido real), message queda vacío
      // a propósito para que executeFromAgentData NO lo envíe al lead real.
      const finalMessage = message;

      const executor = new ActionExecutor(this.agencyId);
      const actionsExecuted = await executor.executeFromAgentData(
        agentType, String(lead.id), ctx, finalMessage, data
      );

      const leadsUpdated = await this.updateLeadFromAgentData(
        String(lead.id), agentType, data || {}
      );

      await this.logActivity(String(lead.id), agentType, finalMessage || '(sin texto generado)', data);
      await this.updateAgentStats(agentType);

      return {
        agentType, success: true,
        message: finalMessage,
        data,
        actionsExecuted,
        leadsUpdated,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      console.error(`[AgentOrchestrator] Error ejecutando ${agentType}:`, err);
      return {
        agentType, success: false,
        message: '', data: null,
        actionsExecuted: [],
        leadsUpdated: false,
        error: String(err),
        durationMs: Date.now() - t0,
      };
    }
  }

  buildSystemPrompt(basePrompt, ctx) {
    const now = new Date();
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
Fecha y hora: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`;
  }

  buildUserPrompt(agentType, ctx, lead) {
    const prompts = {
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
    };
    return prompts[agentType] || `Procesa la información para el lead ${ctx.lead_name}`;
  }

  async updateLeadFromAgentData(leadId, agentType, data) {
    const updates = {
      updated_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    };

    if (agentType === 'captador') {
      if (data.score !== undefined) {
        const score = Number(data.score);
        updates.ia_score = score;
        updates.ia_score_label = score > 75 ? 'caliente' : score > 40 ? 'templado' : 'frio';
      }
      if (Array.isArray(data.insights)) updates.ia_insights = JSON.stringify(data.insights);
      if (data.next_action) updates.ia_next_action = String(data.next_action);

      const d = data.datos_captados || {};
      if (d.operation_type) updates.operation_type = d.operation_type;
      if (d.budget_max && Number(d.budget_max) > 0) updates.budget_max = Number(d.budget_max);
      if (Array.isArray(d.zones) && d.zones.length) updates.zones = JSON.stringify(d.zones);
      if (d.urgency) updates.urgency = d.urgency;
    }

    if (agentType === 'vendedor' && data.score_change) {
      const lead = await get('SELECT ia_score FROM leads WHERE id = @id', { id: leadId });
      const newScore = Math.max(0, Math.min(100,
        (lead?.ia_score ?? 50) + Number(data.score_change)
      ));
      updates.ia_score = newScore;
      updates.ia_score_label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio';
      if (data.stage_change) updates.pipeline_stage = data.stage_change;
    }

    if (Object.keys(updates).length > 2) {
      const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
      const res = await run(`UPDATE leads SET ${setClauses} WHERE id = @id AND agency_id = @agency_id`, {
        ...updates,
        id: leadId,
        agency_id: this.agencyId,
      });
      return res.changes > 0;
    }
    return false;
  }

  async logActivity(leadId, agentType, message, data) {
    const name = AGENT_META[agentType]?.name || agentType;
    await run(
      `INSERT INTO activities (id, agency_id, lead_id, type, title, description, agent_type, metadata, created_at)
       VALUES (@id, @agency_id, @lead_id, 'ia_action', @title, @description, @agent_type, @metadata, NOW())`,
      {
        id: uuidv4(),
        agency_id: this.agencyId,
        lead_id: leadId,
        title: `${name} ejecutado`,
        description: message.slice(0, 400),
        agent_type: agentType,
        metadata: JSON.stringify({ has_json_data: !!data, score: data?.score, escalate: data?.escalate }),
      }
    );
  }

  async updateAgentStats(agentType) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const countRow = await get(
      `SELECT COUNT(*) as count FROM activities
       WHERE agency_id = @agency_id AND agent_type = @agent_type AND created_at >= @today`,
      { agency_id: this.agencyId, agent_type: agentType, today: today.toISOString() }
    );
    const count = countRow?.count || 0;

    const agent = await get('SELECT id, stats FROM ai_agents WHERE agency_id = @agency_id AND type = @type', {
      agency_id: this.agencyId,
      type: agentType
    });

    if (agent) {
      let stats = { leads_today: 0, messages_today: 0, last_action: '', last_action_text: '' };
      try {
        if (agent.stats) stats = JSON.parse(agent.stats);
      } catch (e) {}

      stats.leads_today = count;
      stats.last_action = new Date().toISOString();
      stats.last_action_text = `${AGENT_META[agentType]?.name || agentType} ejecutado`;

      await run('UPDATE ai_agents SET stats = @stats, last_action = NOW() WHERE id = @id', {
        stats: JSON.stringify(stats),
        id: agent.id,
      });
    }
  }

  async loadLead(leadId) {
    return await get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', {
      id: leadId,
      agency_id: this.agencyId,
    });
  }

  async loadAgency() {
    return await get('SELECT * FROM agency_full_context WHERE agency_id = @id', {
      id: this.agencyId,
    });
  }

  buildContext(lead, agency, trigger, payload = {}) {
    const score = Number(lead.ia_score ?? 0);
    const budgetMax = Number(lead.budget_max ?? lead.budget ?? 0);
    const lastContact = lead.last_contact_at
      ? Math.floor((Date.now() - new Date(String(lead.last_contact_at)).getTime()) / 86400000)
      : null;

    let zones = [];
    try {
      if (lead.zones) zones = JSON.parse(lead.zones);
    } catch (e) {}

    return {
      lead_id:          lead.id,
      lead_name:        lead.name,
      lead_first_name:  String(lead.name ?? '').split(' ')[0],
      phone:            lead.phone ?? '',
      email:            lead.email ?? '',
      score,
      score_label:      score > 75 ? 'caliente' : score > 40 ? 'templado' : 'frío',
      score_emoji:      score > 75 ? '🔥' : score > 40 ? '🟡' : '❄️',
      stage:            lead.pipeline_stage ?? lead.status,
      stage_label:      STAGE_LABELS[String(lead.pipeline_stage ?? lead.status)] ?? String(lead.pipeline_stage ?? lead.status),
      zone:             zones[0] || lead.zone || '',
      budget_max:       budgetMax,
      budget_formatted: budgetMax > 0
        ? new Intl.NumberFormat('es-ES').format(budgetMax) + '€'
        : 'no especificado',
      operation_type:   lead.operation_type ?? 'compra',
      urgency:          lead.urgency ?? 'media',
      source:           lead.source ?? 'manual',
      lead_summary:     lead.ia_summary ?? '',
      days_since_contact: lastContact,
      agency_id:        agency?.agency_id,
      agency_name:      agency?.agency_name ?? 'Mi Agencia',
      agency_city:      agency?.agency_city ?? 'España',
      agency_email:     agency?.agency_email ?? '',
      agency_phone:     agency?.agency_phone ?? '',
      agency_whatsapp:  agency?.agency_whatsapp ?? '',
      wa_token:         agency?.wa_token ?? '',
      wa_phone_id:      agency?.wa_phone_id ?? '',
      sg_key:           agency?.sg_api_key ?? '',
      sg_from_email:    agency?.sg_from_email ?? '',
      sg_from_name:     agency?.sg_from_name ?? agency?.agency_name ?? '',
      telegram_token:   agency?.telegram_bot_token ?? '',
      telegram_chat:    agency?.telegram_chat_id ?? '',
      slack_webhook:    agency?.slack_webhook_url ?? '',
      trigger,
      ...payload,
    };
  }
}

const STAGE_LABELS = {
  nuevo: 'Nuevo Lead', contactado: 'Contactado', interesado: 'Interesado',
  visita_agendada: 'Visita agendada', negociacion: 'En negociación',
  reserva: 'Reserva', cerrado: 'Cerrado', perdido: 'Perdido',
};

const AGENT_MODEL_CONFIG = {
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
};
