import { askClaude, isClientAvailable } from '../services/claude.js';
import { runAgentWithTools } from '../tools/agent-runner.js';

const SYSTEM_PROMPT = Eres el Agendador IA de visitas inmobiliarias. Gestionas todo el ciclo de una visita.

Flujo completo de gestión de visitas:

Paso 1 - Propuesta al lead:
- Ofrecer siempre 3 opciones de horario en días alternos
- Preguntar preferencia: mañana (10-14), tarde (16-20) o fin de semana
- Confirmar dirección y puntos de encuentro

Paso 2 - Confirmación:
- Confirmar día, hora y dirección exacta
- Registrar en Google Calendar (o sistema de calendario)
- Enviar confirmación por WhatsApp y email
- Incluir datos de contacto del comercial asignado

Paso 3 - Recordatorios:
- Recordatorio 24h antes: WhatsApp con dirección, hora y contacto
- Recordatorio 2h antes: WhatsApp de confirmación de asistencia
- Si no responde al recordatorio 2h, llamar por teléfono

Paso 4 - Post-visita:
- 3 horas después de la visita: enviar mensaje de seguimiento
- Preguntar impresiones generales
- Preguntar si necesita más información
- Registrar resultado de la visita

Briefing pre-visita para el comercial:
- Perfil completo del lead: nombre, teléfono, email, presupuesto
- Historial de interacciones y objeciones
- Puntos clave a destacar de cada propiedad
- Estrategia recomendada según perfil
- Señales de cierre a las que estar atento

Gestión de incidencias:
- No-show del lead: esperar 15min, llamar, reprogramar o descartar
- Ausencia del comercial: contactar lead para reprogramar, escalar a coordinador
- Propiedad no disponible: contactar lead, ofrecer alternativas similares

Siempre respondes en formato JSON.;

function suggestTimeSlotsFallback(leadData, commercialCalendar) {
  const preferences = leadData.preferences || {};
  const preferredDays = preferences.days || ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  const preferredHours = preferences.hours || { start: 10, end: 19 };
  const dayMap = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };
  const now = new Date();
  const slots = [];
  const maxSlots = 6;

  for (let d = 0; d < 14 && slots.length < maxSlots; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dayName = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][date.getDay()];
    if (!preferredDays.includes(dayName)) continue;

    const daySlots = commercialCalendar?.[date.toISOString().split('T')[0]];
    for (let h = preferredHours.start; h < preferredHours.end && slots.length < maxSlots; h++) {
      const timeStr = ${String(h).padStart(2, '0')}:00;
      if (daySlots && daySlots.includes(timeStr)) continue;
      slots.push({
        date: date.toISOString().split('T')[0],
        time: timeStr,
        dayName,
        duration: '45 min',
      });
    }
  }

  return {
    availableSlots: slots,
    totalFound: slots.length,
    message: slots.length > 0 ? Se encontraron  horarios disponibles. Te sugerimos 3 opciones en días alternos. : 'No hay disponibilidad en los próximos 14 días.',
  };
}

function confirmVisitFallback(leadData, slot) {
  const name = leadData.name || leadData.nombre || 'Cliente';
  const date = slot.date || slot.fecha || '';
  const time = slot.time || slot.hora || '';
  const address = slot.address || slot.direccion || '';
  const property = slot.propertyTitle || slot.property?.title || 'la propiedad';
  const commercial = slot.commercialName || slot.comercial || 'tu agente';

  return {
    message: Hola , confirmamos tu visita a  el día  a las . Te esperará . Recibirás un recordatorio 24h antes.,
    confirmationId: is_,
    status: 'confirmada',
    nextStep: 'send_reminder_24h',
  };
}

function sendReminderFallback(visitData, type) {
  const name = visitData.leadName || visitData.name || visitData.nombre || 'Cliente';
  const date = visitData.date || visitData.fecha || '';
  const time = visitData.time || visitData.hora || '';
  const address = visitData.address || visitData.direccion || '';
  const property = visitData.propertyTitle || visitData.property?.title || 'la propiedad';
  const commercial = visitData.commercialName || visitData.comercial || 'tu agente';
  const commercialPhone = visitData.commercialPhone || visitData.telefonoComercial || '';

  if (type === '24h') {
    return {
      type: 'recordatorio_24h',
      channel: 'whatsapp',
      message: Hola , te recordamos que mañana a las  tienes una visita programada a . Tu agente  te espera.,
      sendAt: new Date(Date.now() + 86400000).toISOString(),
    };
  }

  if (type === '2h') {
    return {
      type: 'recordatorio_2h',
      channel: 'whatsapp',
      message: Hola , en 2 horas tienes tu visita a . Tu agente  ya está preparado. Cualquier cambio, avísanos.,
      sendAt: new Date(Date.now() + 7200000).toISOString(),
    };
  }

  return {
    type: 'recordatorio_genérico',
    channel: 'whatsapp',
    message: Hola , recordatorio: visita a  programada.,
    sendAt: new Date().toISOString(),
  };
}

function rescheduleVisitFallback(visitData, reason) {
  const name = visitData.leadName || visitData.name || 'Cliente';
  const oldDate = visitData.originalDate || visitData.fechaOriginal || '';
  const oldTime = visitData.originalTime || visitData.horaOriginal || '';
  const property = visitData.propertyTitle || visitData.property?.title || 'la propiedad';

  const reasonLower = (reason || '').toLowerCase();
  const urgency = /urgente|emergencia|imprevisto|enfermedad/i.test(reasonLower) ? 'alta' : /trabajo|horario|familia/i.test(reasonLower) ? 'media' : 'baja';

  return {
    oldAppointment: { date: oldDate, time: oldTime },
    reason,
    urgency,
    suggestedAction: urgency === 'alta'
      ? 'Reprogramar lo antes posible. Priorizar disponibilidad inmediata.'
      : 'Ofrecer 2-3 nuevas opciones de horario.',
    message: Hemos recibido tu solicitud de cambio para la visita a . Buscaremos un nuevo horario que se ajuste a tu disponibilidad y te contactaremos.,
    status: 'pendiente_reprogramacion',
  };
}

function generateVisitBriefingFallback(leadData, properties) {
  const name = leadData.name || leadData.nombre || 'Cliente';
  const phone = leadData.phone || leadData.telefono || '';
  const email = leadData.email || leadData.correo || '';
  const budget = leadData.budget || leadData.presupuesto || 'No especificado';
  const interest = leadData.property_interest || leadData.propertyInterest || leadData.interes || 'No especificado';
  const zone = leadData.zone || leadData.zona || 'No especificada';
  const source = leadData.source || leadData.origen || 'Desconocido';
  const score = leadData.ia_score || leadData.score || 0;
  const insight = leadData.ia_insight || leadData.insight || '';

  const propsBriefing = (properties || []).map((p, i) => ({
    n: i + 1,
    title: p.title || p.titulo || 'Propiedad',
    price: p.price || p.precio || 0,
    type: p.type || p.tipo || '',
    bedrooms: p.bedrooms || p.habitaciones || 0,
    bathrooms: p.bathrooms || p.banos || 0,
    surface: p.surface || p.metros || 0,
    zone: p.zone || p.zona || '',
    features: p.features || p.caracteristicas || [],
    sellingPoints: [
      p.bedrooms >= 3 ? 'Amplia capacidad' : null,
      p.surface > 100 ? 'Superficie generosa' : null,
      p.price && budget && p.price <= budget * 1.1 ? 'Dentro del presupuesto' : null,
      'Buena ubicación',
    ].filter(Boolean),
  }));

  return {
    leadProfile: { name, phone, email, budget, interest, zone, source, score, insight },
    properties: propsBriefing,
    totalProperties: propsBriefing.length,
    recommendedApproach: score >= 70
      ? 'Cliente caliente. Enfocar en cierre rápido. Destacar ventajas competitivas.'
      : score >= 50
        ? 'Cliente en fase de evaluación. Escuchar necesidades y generar confianza.'
        : 'Cliente en fase inicial. Calificar primero antes de profundizar.',
    keyPoints: [
      Presupuesto: €,
      Busca:  en ,
      ${propsBriefing.length} propiedades preparadas para visitar,
      score >= 70 ? 'Alta intención de compra' : 'Requiere seguimiento',
    ],
  };
}

function registerVisitResultFallback(resultData) {
  const status = resultData.status || resultData.estado || 'pendiente';
  const feedback = resultData.feedback || resultData.comentarios || '';
  const name = resultData.leadName || resultData.name || 'Cliente';
  const property = resultData.propertyTitle || resultData.property?.title || 'la propiedad';

  const outcomes = {
    interesado: {
      outcome: 'interesado',
      nextAction: 'enviar documentación y programar segunda visita',
      probability: 0.8,
    },
    dudoso: {
      outcome: 'dudoso',
      nextAction: 'hacer seguimiento en 48h con información adicional',
      probability: 0.4,
    },
    no_interesado: {
      outcome: 'no_interesado',
      nextAction: 'registrar motivo y descartar lead o cambiar enfoque',
      probability: 0.1,
    },
    no_asistio: {
      outcome: 'no_asistio',
      nextAction: 'contactar para reprogramar o descartar',
      probability: 0.2,
    },
  };

  const result = outcomes[status] || {
    outcome: 'pendiente',
    nextAction: 'esperar confirmación del comercial',
    probability: 0.5,
  };

  return {
    visitId: resultData.visitId || is_,
    leadName: name,
    property,
    outcome: result.outcome,
    feedback: feedback || 'Sin comentarios',
    nextAction: result.nextAction,
    conversionProbability: result.probability,
    registeredAt: new Date().toISOString(),
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function suggestTimeSlots(leadData, commercialCalendar) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Sugiere horarios disponibles para una visita inmobiliaria. Devuelve JSON con: availableSlots (array de {date, time, dayName, duration}), totalFound, message.
Lead: 
Calendario: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: ${parsed.totalFound || 0} horarios sugeridos };
    } catch (err) { errors.push(err.message); }
  }
  const result = suggestTimeSlotsFallback(leadData, commercialCalendar);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback:  horarios : ${result.totalFound} horarios sugeridos };
}

export async function confirmVisit(leadData, slot) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Confirma una visita inmobiliaria. Devuelve JSON con: message, confirmationId, status, nextStep.
Lead: 
Slot: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Visita confirmada para  };
    } catch (err) { errors.push(err.message); }
  }
  const result = confirmVisitFallback(leadData, slot);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: visita confirmada : Visita confirmada para  };
}

export async function sendReminder(visitData, type) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Genera un recordatorio de visita. Devuelve JSON con: type, channel, message, sendAt.
VisitData: 
Tipo: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Recordatorio  generado };
    } catch (err) { errors.push(err.message); }
  }
  const result = sendReminderFallback(visitData, type);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: recordatorio  : Recordatorio  generado };
}

export async function rescheduleVisit(visitData, reason) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Gestiona una reprogramación de visita. Devuelve JSON con: oldAppointment, reason, urgency, suggestedAction, message, status.
VisitData: 
Reason: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Reprogramación por:  (urgencia: ) };
    } catch (err) { errors.push(err.message); }
  }
  const result = rescheduleVisitFallback(visitData, reason);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: reprogramación : Reprogramación gestionada (urgencia: ) };
}

export async function generateVisitBriefing(leadData, properties) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Genera un briefing pre-visita para el comercial. Devuelve JSON con: leadProfile, properties (array), totalProperties, recommendedApproach, keyPoints.
Lead: 
Properties: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Briefing generado para  con  propiedades };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateVisitBriefingFallback(leadData, properties);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: briefing generado : Briefing generado para  };
}

export async function registerVisitResult(resultData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Registra el resultado de una visita. Devuelve JSON con: visitId, leadName, property, outcome, feedback, nextAction, conversionProbability, registeredAt.
ResultData: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Resultado registrado: . Próxima acción:  };
    } catch (err) { errors.push(err.message); }
  }
  const result = registerVisitResultFallback(resultData);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: resultado registrado : Resultado: . Prox:  };
}

export async function scheduleVisitWithTools(payload) {
  const { leadData, agencyId, userId } = payload;
  const errors = [];

  try {
    const systemPrompt = SYSTEM_PROMPT + `\n\nTienes acceso a herramientas. Puedes consultar la disponibilidad de comerciales, crear visitas y reprogramar. Úsalas para gestionar el ciclo completo de una visita.`;
    const userMsg = `Gestiona la visita para este lead. Consulta disponibilidad, propón horarios y crea la visita.\n\nLead:\n${JSON.stringify(leadData, null, 2)}`;

    const finalResponse = await runAgentWithTools({
      systemPrompt,
      userMessage: userMsg,
      agentType: 'agendador',
      context: { agencyId, userId },
    });

    let parsed;
    try { parsed = JSON.parse(finalResponse); } catch { parsed = { raw: finalResponse }; }

    return {
      success: true,
      toolUsed: true,
      result: parsed,
      insight: 'Visita gestionada con tools',
    };
  } catch (err) {
    errors.push(err.message);
  }

  return {
    success: false,
    result: null,
    insight: `Error en agendamiento con tools: ${errors.join(', ')}`,
  };
}

export async function execute(context) {
  const { action, payload } = context;
  switch (action) {
    case 'suggestTimeSlots': return suggestTimeSlots(payload.leadData, payload.commercialCalendar);
    case 'confirmVisit': return confirmVisit(payload.leadData, payload.slot);
    case 'sendReminder': return sendReminder(payload.visitData, payload.type);
    case 'rescheduleVisit': return rescheduleVisit(payload.visitData, payload.reason);
    case 'generateVisitBriefing': return generateVisitBriefing(payload.leadData, payload.properties);
    case 'registerVisitResult': return registerVisitResult(payload.resultData);
    case 'scheduleVisitWithTools': return scheduleVisitWithTools(payload);
    default: return { success: false, result: null, insight: `Acción desconocida. Disponibles: suggestTimeSlots, confirmVisit, sendReminder, rescheduleVisit, generateVisitBriefing, registerVisitResult, scheduleVisitWithTools` };
  }
}
}
