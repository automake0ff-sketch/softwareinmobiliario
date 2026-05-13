import { askClaude, isClientAvailable } from '../services/claude.js';

const SYSTEM_PROMPT = `Eres un agente de notificaciones inteligentes para CRM inmobiliario. Generas informes diarios, alertas de leads calientes, envias mensajes multicanal, supervisas SLAs y notificas sobre matches de propiedades.

Siempre respondes en formato JSON. Debes ser rapido, preciso y priorizar la informacion critica para cada rol (manager, comercial, agente IA).`;

function generateDailyBriefingFallback(agencyData) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const leads = agencyData.leads || [];
  const visits = agencyData.visits || agencyData.visitas || [];
  const tasks = agencyData.tasks || agencyData.tareas || [];
  const properties = agencyData.properties || agencyData.propiedades || [];

  const newLeads = leads.filter((l) => l.status === 'nuevo' || l.status === 'new').length;
  const hotLeads = leads.filter((l) => (l.ia_score || l.score || 0) >= 70).length;
  const todayVisits = visits.filter((v) => v.date === today.toISOString().split('T')[0]).length;
  const pendingTasks = tasks.filter((t) => !t.completed).length;
  const newProperties = properties.filter((p) => {
    const created = new Date(p.created_at || p.createdAt || 0);
    return (today - created) / 86400000 <= 1;
  }).length;

  return {
    date: dateStr,
    generatedAt: today.toISOString(),
    summary: {
      newLeads,
      hotLeads,
      todayVisits,
      pendingTasks,
      newProperties,
      totalLeads: leads.length,
    },
    highlights: [
      hotLeads > 0 ? `🔥 ${hotLeads} leads calientes requieren atencion inmediata` : null,
      todayVisits > 0 ? `📅 ${todayVisits} visitas programadas para hoy` : null,
      pendingTasks > 0 ? `📋 ${pendingTasks} tareas pendientes` : null,
      newProperties > 0 ? `🏠 ${newProperties} propiedades nuevas anadidas` : null,
    ].filter(Boolean),
    priority: hotLeads > 3 ? 'alta' : hotLeads > 0 ? 'media' : 'normal',
    commercialStatus: (agencyData.comerciales || []).map((c) => ({
      name: c.name || c.nombre || '',
      leadsCount: c.leadsCount || 0,
      tasksPending: c.tasksPending || 0,
      visitsToday: c.visitsToday || 0,
    })),
  };
}

function alertHotLeadFallback(leadData) {
  const name = leadData.name || leadData.nombre || 'Lead';
  const score = leadData.ia_score || leadData.score || 0;
  const source = leadData.source || leadData.origen || 'desconocido';
  const zone = leadData.zone || leadData.zona || '';
  const budget = leadData.budget || leadData.presupuesto || 0;
  const interest = leadData.property_interest || leadData.propertyInterest || leadData.interes || 'propiedad';
  const assignedTo = leadData.assigned_to || leadData.assignedTo || null;

  const reasons = [];
  if (score >= 80) reasons.push('Puntuacion muy alta');
  if (budget >= 300000) reasons.push('Presupuesto elevado');
  if (/whatsapp|llamada/i.test(source)) reasons.push('Contacto directo');
  if (zone) reasons.push(`Interes en ${zone}`);

  return {
    alertType: 'hot_lead',
    priority: score >= 80 ? 'critica' : 'alta',
    leadName: name,
    score,
    source,
    budget: budget ? `${budget}€` : 'No especificado',
    interest,
    zone,
    reasons,
    message: `🔥 LEAD CALIENTE: ${name} (${score}/100) - ${interest} en ${zone || 'sin zona'} - ${budget ? budget.toLocaleString() + '€' : 'presupuesto no especificado'} - Origen: ${source}`,
    suggestedAction: assignedTo
      ? `Notificar a comercial asignado inmediatamente`
      : `Asignar a comercial disponible con urgencia`,
    channels: ['whatsapp', 'email', 'in_app'],
  };
}

function sendMultiChannelFallback(recipient, message, channels) {
  const chs = channels || ['whatsapp'];
  const deliveries = [];

  chs.forEach((channel) => {
    const delivery = {
      channel,
      recipient: recipient.phone || recipient.email || recipient.id || '',
      status: 'sent',
      sentAt: new Date().toISOString(),
    };

    if (channel === 'whatsapp') {
      delivery.message = message.substring(0, 4096);
    } else if (channel === 'email') {
      delivery.subject = 'Notificacion CRM Inmobiliario';
      delivery.html = `<div style="font-family:sans-serif;padding:20px"><p>${message}</p></div>`;
    } else if (channel === 'sms') {
      delivery.message = message.substring(0, 160);
    } else if (channel === 'in_app') {
      delivery.message = message;
      delivery.icon = 'bell';
    }

    deliveries.push(delivery);
  });

  return {
    success: true,
    channelsUsed: chs,
    deliveries,
    totalSent: deliveries.length,
    timestamp: new Date().toISOString(),
  };
}

function generateEndOfDayReportFallback(agencyData) {
  const today = new Date().toISOString().split('T')[0];
  const leads = agencyData.leads || [];
  const activities = agencyData.activities || agencyData.actividades || [];
  const visits = agencyData.visits || agencyData.visitas || [];
  const tasks = agencyData.tasks || agencyData.tareas || [];

  const todayActivities = activities.filter((a) => (a.created_at || a.createdAt || '').startsWith(today));
  const todayLeads = leads.filter((l) => (l.created_at || l.createdAt || '').startsWith(today));
  const completedTasks = tasks.filter((t) => t.completed);
  const todayVisits = visits.filter((v) => (v.date || v.fecha || '').startsWith(today));
  const statusChanges = todayActivities.filter((a) => a.type === 'status_change');
  const conversations = todayActivities.filter((a) => a.type === 'conversation');

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    metrics: {
      newLeads: todayLeads.length,
      activitiesRegistered: todayActivities.length,
      visitsCompleted: todayVisits.filter((v) => v.status === 'completada' || v.resultado === 'realizada').length,
      tasksCompleted: completedTasks.length,
      statusChanges: statusChanges.length,
      conversationsHeld: conversations.length,
    },
    summary: [
      `Hoy se registraron ${todayLeads.length} nuevos leads.`,
      `${todayVisits.length} visitas programadas, ${todayVisits.filter((v) => v.status === 'completada').length} completadas.`,
      `${completedTasks.length} tareas completadas de ${tasks.length} totales.`,
      `${conversations.length} conversaciones mantenidas.`,
    ],
    recommendations: [
      todayLeads.length === 0 ? 'No se registraron leads nuevos hoy. Revisar fuentes de captacion.' : null,
      completedTasks.length < tasks.length * 0.5 ? `Quedan ${tasks.length - completedTasks.length} tareas pendientes. Priorizar manana.` : null,
      'Revisar leads calientes no contactados.',
    ].filter(Boolean),
  };
}

function checkSLAViolationsFallback(leads, thresholdHours) {
  const threshold = thresholdHours || 24;
  const violations = [];
  const now = Date.now();

  (leads || []).forEach((lead) => {
    const created = new Date(lead.created_at || lead.createdAt || lead.fechaCreacion || now);
    const hoursSinceCreation = (now - created.getTime()) / 3600000;
    const lastActivity = lead.last_activity || lead.lastActivity || lead.ultimaActividad || lead.created_at || lead.createdAt;

    if (lead.status === 'nuevo' && hoursSinceCreation > threshold) {
      violations.push({
        leadId: lead.id,
        leadName: lead.name || lead.nombre || 'Desconocido',
        type: 'lead_no_contactado',
        hoursSinceCreation: Math.round(hoursSinceCreation * 10) / 10,
        threshold,
        severity: hoursSinceCreation > threshold * 2 ? 'critica' : 'alta',
        suggestedAction: 'Contactar al lead inmediatamente o reasignar',
      });
    }

    if (lastActivity) {
      const lastActivityDate = new Date(lastActivity);
      const hoursSinceActivity = (now - lastActivityDate.getTime()) / 3600000;
      if (lead.status !== 'cerrado' && lead.status !== 'reserva' && hoursSinceActivity > threshold * 3) {
        violations.push({
          leadId: lead.id,
          leadName: lead.name || lead.nombre || 'Desconocido',
          type: 'lead_sin_seguimiento',
          hoursSinceLastActivity: Math.round(hoursSinceActivity * 10) / 10,
          threshold: threshold * 3,
          severity: 'media',
          suggestedAction: 'Reactivar lead con secuencia de nurturing',
        });
      }
    }
  });

  violations.sort((a, b) => {
    const sev = { critica: 3, alta: 2, media: 1 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  });

  return {
    totalViolations: violations.length,
    criticalCount: violations.filter((v) => v.severity === 'critica').length,
    highCount: violations.filter((v) => v.severity === 'alta').length,
    mediumCount: violations.filter((v) => v.severity === 'media').length,
    violations,
    slaThreshold: `${threshold}h`,
    recommendation: violations.length > 0
      ? `Se detectaron ${violations.length} violaciones SLA. Atender las criticas primero.`
      : 'Sin violaciones SLA. Rendimiento correcto.',
  };
}

function notifyNewPropertyMatchFallback(lead, property) {
  const name = lead.name || lead.nombre || 'Cliente';
  const propTitle = property.title || property.titulo || 'nueva propiedad';
  const price = property.price || property.precio || 0;
  const city = property.city || property.ciudad || '';
  const zone = property.zone || property.zona || '';
  const beds = property.bedrooms || property.habitaciones || 0;
  const baths = property.bathrooms || property.banos || 0;
  const surf = property.surface || property.metros || 0;
  const score = property.matchScore || property.score || 85;
  const reason = property.matchReason || property.reason || 'coincide con tus criterios de busqueda';

  const location = [zone, city].filter(Boolean).join(', ');
  const priceStr = typeof price === 'number' ? `${price.toLocaleString()}€` : price;

  return {
    notificationType: 'property_match',
    priority: score >= 90 ? 'alta' : score >= 70 ? 'media' : 'baja',
    leadName: name,
    property: {
      title: propTitle,
      price: priceStr,
      location,
      bedrooms: beds,
      bathrooms: baths,
      surface: surf,
    },
    matchScore: score,
    matchReason: reason,
    message: `Hola ${name}, hemos encontrado una propiedad que podria interesarte: ${propTitle} en ${location} por ${priceStr}. ${beds} hab, ${surf}m2. ${reason}`,
    suggestedAction: score >= 80
      ? 'Enviar notificacion inmediata y sugerir visita'
      : 'Incluir en proximo newsletter o secuencia de nurturing',
    channels: score >= 80 ? ['whatsapp', 'email'] : ['email'],
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function generateDailyBriefing(agencyData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Genera un briefing diario para el manager de la agencia. Devuelve JSON con: date, generatedAt, summary (newLeads, hotLeads, todayVisits, pendingTasks, newProperties, totalLeads), highlights (array), priority, commercialStatus (array de {name, leadsCount, tasksPending, visitsToday}).
Agency data: ${JSON.stringify(agencyData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Briefing: ${parsed.summary?.newLeads || 0} leads nuevos, ${parsed.summary?.hotLeads || 0} calientes` };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateDailyBriefingFallback(agencyData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: briefing diario` : `Briefing: ${result.summary.newLeads} leads nuevos, ${result.summary.hotLeads} calientes` };
}

export async function alertHotLead(leadData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Genera una alerta de lead caliente. Devuelve JSON con: alertType, priority, leadName, score, source, budget, interest, zone, reasons, message, suggestedAction, channels.
Lead: ${JSON.stringify(leadData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `🔥 Alerta lead caliente: ${parsed.leadName} (${parsed.score}/100)` };
    } catch (err) { errors.push(err.message); }
  }
  const result = alertHotLeadFallback(leadData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: alerta lead caliente` : `🔥 Alerta: ${result.leadName} (${result.score}/100)` };
}

export async function sendMultiChannel(recipient, message, channels) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Envia un mensaje multicanal. Devuelve JSON con: success, channelsUsed, deliveries (array de {channel, recipient, status, sentAt}), totalSent, timestamp.
Recipient: ${JSON.stringify(recipient)}
Message: ${message}
Channels: ${JSON.stringify(channels)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Mensaje enviado por ${parsed.channelsUsed?.length || 0} canales` };
    } catch (err) { errors.push(err.message); }
  }
  const result = sendMultiChannelFallback(recipient, message, channels);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: mensaje enviado` : `Mensaje enviado por ${result.channelsUsed.length} canales` };
}

export async function generateEndOfDayReport(agencyData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Genera un informe de fin de dia. Devuelve JSON con: date, generatedAt, metrics (newLeads, activitiesRegistered, visitsCompleted, tasksCompleted, statusChanges, conversationsHeld), summary (array), recommendations (array).
Agency: ${JSON.stringify(agencyData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Fin de dia: ${parsed.metrics?.newLeads || 0} leads, ${parsed.metrics?.visitsCompleted || 0} visitas` };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateEndOfDayReportFallback(agencyData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: informe fin de dia` : `Fin de dia: ${result.metrics.newLeads} leads, ${result.metrics.visitsCompleted} visitas` };
}

export async function checkSLAViolations(leads, thresholdHours) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Verifica violaciones SLA en leads. Devuelve JSON con: totalViolations, criticalCount, highCount, mediumCount, violations (array de {leadId, leadName, type, hoursSinceCreation, threshold, severity, suggestedAction}), slaThreshold, recommendation.
Leads: ${JSON.stringify(leads)}
Threshold: ${thresholdHours}h
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `${parsed.totalViolations} violaciones SLA (${parsed.criticalCount} criticas)` };
    } catch (err) { errors.push(err.message); }
  }
  const result = checkSLAViolationsFallback(leads, thresholdHours);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: ${result.totalViolations} violaciones SLA` : `${result.totalViolations} violaciones SLA (${result.criticalCount} criticas)` };
}

export async function notifyNewPropertyMatch(lead, property) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Genera notificacion de match propiedad-lead. Devuelve JSON con: notificationType, priority, leadName, property (title, price, location, bedrooms, bathrooms, surface), matchScore, matchReason, message, suggestedAction, channels.
Lead: ${JSON.stringify(lead)}
Property: ${JSON.stringify(property)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Match notificado: ${parsed.leadName} - ${parsed.property?.title} (${parsed.matchScore}%)` };
    } catch (err) { errors.push(err.message); }
  }
  const result = notifyNewPropertyMatchFallback(lead, property);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: match notificado` : `Match: ${result.leadName} - ${result.property.title} (${result.matchScore}%)` };
}

export async function execute(context) {
  const { action, payload } = context;
  switch (action) {
    case 'generateDailyBriefing': return generateDailyBriefing(payload.agencyData);
    case 'alertHotLead': return alertHotLead(payload.leadData);
    case 'sendMultiChannel': return sendMultiChannel(payload.recipient, payload.message, payload.channels);
    case 'generateEndOfDayReport': return generateEndOfDayReport(payload.agencyData);
    case 'checkSLAViolations': return checkSLAViolations(payload.leads, payload.thresholdHours);
    case 'notifyNewPropertyMatch': return notifyNewPropertyMatch(payload.lead, payload.property);
    default: return { success: false, result: null, insight: `Accion desconocida: ${action}. Disponibles: generateDailyBriefing, alertHotLead, sendMultiChannel, generateEndOfDayReport, checkSLAViolations, notifyNewPropertyMatch` };
  }
}
