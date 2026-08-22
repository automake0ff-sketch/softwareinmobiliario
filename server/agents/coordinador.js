import { askClaude, isClientAvailable } from '../services/claude.js';
import { PropIARagRetriever } from '../rag/retriever.js';

const SYSTEM_PROMPT = `Eres el Coordinador IA de PropIA — el cerebro del sistema. Orquestas todos los agentes y tomas decisiones críticas de asignación y priorización.

Tus responsabilidades:
1. Monitoreo de leads en tiempo real: detectas leads entrantes, cambios de estado y eventos importantes
2. Reglas de asignación: asignas leads al comercial ideal según:
   - Zona geográfica (el comercial que mejor conoce la zona)
   - Carga de trabajo (no sobrecargar a ningún comercial)
   - Historial (comercial con mejor conversión en ese perfil de lead)
   - Disponibilidad (turno, horario, vacaciones)
3. Alertas: generas alertas URGENTES (leads calientes, SLA violados) e IMPORTANTES (cambios de estado, tareas vencidas)
4. Activación de agentes: decides qué agente IA activar según el contexto:
   - Lead nuevo → Captador
   - Objeción → Vendedor
   - Documentación → Documentador
   - Visita → Agendador
   - Financiación → Financiero
5. Briefing matutino diario: cada mañana generas un resumen ejecutivo con leads pendientes, visitas del día, tareas críticas y recomendaciones

Siempre respondes en formato JSON con:
{
  "assignments": [{ leadId, assignedTo, agentId, score, reasons, isUrgent }],
  "agent_activations": [{ agentName, action, reason }],
  "alerts": [{ type: "URGENTE"|"IMPORTANTE"|"INFO", message, forRole }],
  "automations_to_trigger": [{ type, trigger, action, priority }]
}`;

const COMMERCIAL_SPECIALTIES = {
  ventas: ['venta', 'compra', 'inversión', 'hipoteca'],
  alquiler: ['alquiler', 'renta', 'arrendamiento', 'inquilino'],
  premium: ['lujo', 'exclusivo', 'premium', 'alta', 'vip'],
  corporativo: ['oficina', 'local', 'nave', 'industrial', 'corporativo'],
};

function assignLeadFallback(leadData, availableAgents) {
  if (!availableAgents || availableAgents.length === 0) {
    return { assignedTo: null, reason: 'No hay comerciales disponibles', score: 0 };
  }

  const leadType = (leadData.typeOfProperty || leadData.tipo || leadData.type || '').toLowerCase();
  const leadMessage = (leadData.message || leadData.comments || leadData.notes || '').toLowerCase();
  const leadSource = (leadData.source || leadData.origin || '').toLowerCase();
  const isUrgent = leadData.urgency === 'alta' || leadData.urgency === 'high' || leadData.score >= 70;

  const scoredAgents = availableAgents.map((agent) => {
    let score = 50;
    const reasons = [];

    const agentName = (agent.name || agent.nombre || '').toLowerCase();
    const agentRole = (agent.role || agent.rol || agent.especialidad || '').toLowerCase();
    const agentLoad = agent.currentLoad || agent.cargaActual || 0;

    const allAgentText = agentName + ' ' + agentRole;

    for (const [specialty, keywords] of Object.entries(COMMERCIAL_SPECIALTIES)) {
      for (const kw of keywords) {
        if (leadType.includes(kw) || leadMessage.includes(kw)) {
          if (allAgentText.includes(specialty)) {
            score += 20;
            reasons.push(`especialista en ${specialty}`);
            break;
          }
        }
      }
    }

    if (agentLoad < 3) {
      score += 15;
      reasons.push('baja carga de trabajo');
    } else if (agentLoad > 8) {
      score -= 20;
      reasons.push('alta carga de trabajo');
    }

    if (agent.zone && leadData.zone && agent.zone.toLowerCase() === leadData.zone.toLowerCase()) {
      score += 15;
      reasons.push('conoce la zona');
    }

    if (agent.performance && agent.performance > 0.8) {
      score += 10;
      reasons.push('alto rendimiento histórico');
    }

    if (isUrgent) {
      if (agentLoad < 5) {
        score += 10;
        reasons.push('disponible para urgencia');
      }
    }

    if (leadSource.includes('whatsapp') && allAgentText.includes('whatsapp')) {
      score += 5;
      reasons.push('canal preferido');
    }

    return { agent, score: Math.max(0, score), reasons };
  });

  scoredAgents.sort((a, b) => b.score - a.score);
  const best = scoredAgents[0];

  return {
    assignedTo: best.agent.name || best.agent.nombre || best.agent.id,
    agentId: best.agent.id || best.agent._id,
    score: best.score,
    reasons: best.reasons.slice(0, 3),
    isUrgent,
  };
}

function prioritizeTasksFallback(pendingTasks) {
  if (!pendingTasks || pendingTasks.length === 0) {
    return [];
  }

  const priorityMap = {
    critica: { value: 100, label: 'crítica' },
    alta: { value: 75, label: 'alta' },
    media: { value: 50, label: 'media' },
    baja: { value: 25, label: 'baja' },
  };

  const scored = pendingTasks.map((task) => {
    let base = 50;

    const taskText = (task.title + ' ' + task.description + ' ' + task.type).toLowerCase();

    if (task.urgency === 'alta' || /urgente|inmediato|crítico/i.test(taskText)) base += 40;
    if (/lead|cliente|venta|cierre/i.test(taskText)) base += 20;
    if (/seguimiento|llamada|visita/i.test(taskText)) base += 15;
    if (task.dueDate) {
      const daysUntilDue = (new Date(task.dueDate) - new Date()) / (1000 * 60 * 60 * 24);
      if (daysUntilDue < 0) base += 50;
      else if (daysUntilDue < 1) base += 35;
      else if (daysUntilDue < 3) base += 20;
    }

    const priority = base >= 90 ? 'critica' : base >= 70 ? 'alta' : base >= 45 ? 'media' : 'baja';

    return {
      task: task.title || task.name || 'Sin título',
      originalPriority: task.priority || 'media',
      calculatedPriority: priority,
      score: base,
      suggestedAction: priority === 'critica' ? 'ejecutar ahora' : priority === 'alta' ? 'ejecutar hoy' : priority === 'media' ? 'programar' : 'revisar cuando haya tiempo',
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function detectHotLeadFallback(leadData) {
  const score = leadData.score || leadData.puntuacion || 0;
  const urgency = leadData.urgency || leadData.urgencia || '';
  const message = leadData.message || leadData.comments || '';
  const source = leadData.source || leadData.origin || '';
  const budget = leadData.estimatedBudget || leadData.presupuesto || '';

  const isHot = score >= 70 || urgency === 'alta' || /urgente|inmediato|ya|necesito ahora/i.test(message);
  const hotReasons = [];

  if (score >= 70) hotReasons.push(`puntuación alta: ${score}`);
  if (urgency === 'alta') hotReasons.push('urgencia alta');
  if (budget) hotReasons.push(`presupuesto disponible: ${budget}`);
  if (/whatsapp|llamada/i.test(source)) hotReasons.push('contacto directo');

  return {
    isHot,
    score,
    reasons: hotReasons,
    suggestedAction: isHot ? 'contactar en menos de 30 minutos' : 'programar contacto en 24h',
    priority: isHot ? 'crítica' : 'normal',
  };
}

function suggestAutomationsFallback(leadStatus) {
  const status = (leadStatus || '').toLowerCase();
  const automations = [];

  const rules = {
    nuevo: [
      { type: 'whatsapp', trigger: 'inmediato', action: 'enviar mensaje de bienvenida', priority: 'alta' },
      { type: 'email', trigger: '1 hora', action: 'enviar dossier propiedades destacadas', priority: 'alta' },
      { type: 'tarea', trigger: 'inmediato', action: 'crear tarea de seguimiento para comercial', priority: 'media' },
    ],
    caliente: [
      { type: 'sms', trigger: 'inmediato', action: 'aviso a comercial de lead prioritario', priority: 'crítica' },
      { type: 'whatsapp', trigger: '5 min', action: 'mensaje de urgencia personalizado', priority: 'crítica' },
      { type: 'email', trigger: '30 min', action: 'enviar ficha detallada de propiedad', priority: 'alta' },
    ],
    tibio: [
      { type: 'email', trigger: '24 horas', action: 'newsletter con propiedades destacadas', priority: 'media' },
      { type: 'whatsapp', trigger: '3 días', action: 'mensaje de seguimiento', priority: 'media' },
      { type: 'tarea', trigger: '1 semana', action: 'llamada de revisión', priority: 'baja' },
    ],
    frio: [
      { type: 'email', trigger: '1 semana', action: 'email de reactivación', priority: 'baja' },
      { type: 'tarea', trigger: '2 semanas', action: 'revisar si descartar lead', priority: 'baja' },
    ],
    visita: [
      { type: 'whatsapp', trigger: '1 día antes', action: 'recordatorio de visita', priority: 'alta' },
      { type: 'email', trigger: 'post-visita', action: 'encuesta de satisfacción', priority: 'media' },
      { type: 'tarea', trigger: 'post-visita', action: 'seguimiento post-visita por comercial', priority: 'alta' },
    ],
    cierre: [
      { type: 'tarea', trigger: 'inmediato', action: 'preparar documentación', priority: 'crítica' },
      { type: 'email', trigger: 'inmediato', action: 'enviar contrato', priority: 'crítica' },
    ],
  };

  const matched = rules[status] || rules.nuevo;
  return matched.map((a) => ({
    ...a,
    status,
  }));
}

function generateCoordinationSummaryFallback(state) {
  const pendingLeads = state.pendingLeads || state.leadsPendientes || [];
  const activeDeals = state.activeDeals || state.operacionesActivas || [];
  const agents = state.agents || state.agentes || [];
  const tasks = state.pendingTasks || state.tareasPendientes || [];

  return {
    timestamp: new Date().toISOString(),
    agentStatus: agents.map((a) => ({
      agent: a.name || a.nombre || a.id,
      load: a.currentLoad || a.cargaActual || 0,
      status: a.status || 'disponible',
    })),
    pendingLeadsCount: pendingLeads.length,
    activeDealsCount: activeDeals.length,
    pendingTasksCount: tasks.length,
    hotLeads: pendingLeads.filter((l) => (l.score || l.puntuacion || 0) >= 70).length,
    alerts: [],
    recommendations: [
      `Hay ${pendingLeads.length} leads pendientes de asignar.`,
      `${activeDeals.length} operaciones activas requieren seguimiento.`,
      `${tasks.length} tareas pendientes en el sistema.`,
      agents.some((a) => (a.currentLoad || 0) > 8) ? 'Algún comercial está sobrecargado, revisar asignación.' : 'Carga de trabajo equilibrada.',
    ],
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function assignLead(leadData, availableAgents) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Asigna este lead al mejor comercial disponible. Devuelve JSON con: assignedTo, agentId, score, reasons, isUrgent.

Lead: ${JSON.stringify(leadData)}
Comerciales disponibles: ${JSON.stringify(availableAgents)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Lead asignado a ${parsed.assignedTo} (score: ${parsed.score})`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = assignLeadFallback(leadData, availableAgents);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: lead asignado a ${result.assignedTo || 'ninguno'}`
      : `Lead asignado a ${result.assignedTo} (score: ${result.score})${result.isUrgent ? ' [URGENTE]' : ''}`,
  };
}

export async function prioritizeTasks(pendingTasks) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Prioriza estas tareas pendientes. Devuelve un ARRAY de objetos JSON con: task, originalPriority, calculatedPriority, score, suggestedAction.

Tareas: ${JSON.stringify(pendingTasks)}

Responde ÚNICAMENTE con el JSON array.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `${parsed.length} tareas priorizadas. La más crítica: ${parsed[0]?.task || 'ninguna'}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = prioritizeTasksFallback(pendingTasks);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: ${result.length} tareas priorizadas`
      : `${result.length} tareas priorizadas. Críticas: ${result.filter((t) => t.calculatedPriority === 'critica').length}`,
  };
}

export async function detectHotLead(leadData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Detecta si este lead es "caliente" y necesita atención inmediata. Devuelve JSON con: isHot, score, reasons, suggestedAction, priority.

Lead: ${JSON.stringify(leadData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: parsed.isHot
          ? `LEAD CALIENTE detectado. Razones: ${parsed.reasons?.join(', ') || ''}`
          : `Lead no crítico. Prioridad: ${parsed.priority}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = detectHotLeadFallback(leadData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: ${result.isHot ? 'CALIENTE' : 'no crítico'}`
      : result.isHot
        ? `LEAD CALIENTE. Razones: ${result.reasons.join(', ')}`
        : `Lead no crítico. Prioridad: ${result.priority}`,
  };
}

export async function suggestAutomations(leadStatus) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Sugiere automatizaciones para un lead con estado "${leadStatus}". Devuelve un ARRAY de objetos JSON con: type, trigger, action, priority, status.

Responde ÚNICAMENTE con el JSON array.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `${parsed.length} automatizaciones sugeridas para estado "${leadStatus}"`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = suggestAutomationsFallback(leadStatus);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: ${result.length} automatizaciones para "${leadStatus}"`
      : `${result.length} automatizaciones sugeridas para estado "${leadStatus}"`,
  };
}

export async function generateCoordinationSummary(agencyState) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un resumen de coordinación para la agencia. Devuelve JSON con: timestamp, agentStatus, pendingLeadsCount, activeDealsCount, pendingTasksCount, hotLeads, alerts, recommendations.

Estado: ${JSON.stringify(agencyState)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Resumen generado: ${parsed.pendingLeadsCount} leads, ${parsed.activeDealsCount} operaciones activas`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateCoordinationSummaryFallback(agencyState);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: resumen generado`
      : `Resumen generado: ${result.pendingLeadsCount} leads, ${result.activeDealsCount} operaciones activas`,
  };
}

export async function assignLeadWithRag(payload) {
  const { leadData, availableAgents } = payload;
  const errors = [];

  let ragMarketInfo = '';
  try {
    const retriever = new PropIARagRetriever();
    const marketInfo = await retriever.searchKnowledgeBase(
      `asignación leads ${leadData.zone || ''} ${leadData.property_interest || ''}`,
      leadData.agency_id,
      'mercado'
    );
    if (marketInfo.length) {
      ragMarketInfo = '\n\n## DATOS DE MERCADO RELEVANTES PARA ASIGNACIÓN\n' +
        marketInfo.map(m => m.content.slice(0, 200)).join('\n\n');
    }
  } catch (err) {
    console.warn('[COORDINADOR] RAG context error:', err.message);
  }

  const extendedPrompt = SYSTEM_PROMPT + ragMarketInfo;

  if (isClientAvailable()) {
    try {
      const prompt = `Asigna este lead al mejor comercial disponible. Devuelve JSON con: assignedTo, agentId, score, reasons, isUrgent.

Lead: ${JSON.stringify(leadData)}
Comerciales disponibles: ${JSON.stringify(availableAgents)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(extendedPrompt, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        ragUsed: !!ragMarketInfo,
        result: parsed,
        insight: `Lead asignado a ${parsed.assignedTo} (score: ${parsed.score})`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = assignLeadFallback(leadData, availableAgents);
  return {
    success: true,
    ragUsed: false,
    result,
    insight: errors.length > 0
      ? `Modo fallback: lead asignado a ${result.assignedTo || 'ninguno'}`
      : `Lead asignado a ${result.assignedTo} (score: ${result.score})${result.isUrgent ? ' [URGENTE]' : ''}`,
  };
}

export async function execute(context) {
  const { action, payload } = context;

  switch (action) {
    case 'assignLead':
      return assignLead(payload.leadData, payload.availableAgents);
    case 'assignLeadWithRag':
      return assignLeadWithRag(payload);
    case 'prioritizeTasks':
      return prioritizeTasks(payload.pendingTasks);
    case 'detectHotLead':
      return detectHotLead(payload.leadData);
    case 'suggestAutomations':
      return suggestAutomations(payload.leadStatus);
    case 'generateCoordinationSummary':
      return generateCoordinationSummary(payload.agencyState);
    case 'orchestrateWithTools':
      return orchestrateWithTools(payload);
    default:
      return {
        success: false,
        result: null,
        insight: `Acción desconocida: ${action}. Acciones disponibles: assignLead, assignLeadWithRag, prioritizeTasks, detectHotLead, suggestAutomations, generateCoordinationSummary, orchestrateWithTools`,
      };
  }
}
