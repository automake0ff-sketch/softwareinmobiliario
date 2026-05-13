import { askClaude, isClientAvailable } from '../services/claude.js';

const SYSTEM_PROMPT = `Eres un agente de nurturing inmobiliario experto en mantener el engagement de leads frios y tibios. Disenas secuencias de comunicacion personalizadas que nutren y reactivan leads.

Siempre respondes en formato JSON. Considera: tipo de lead (comprador/inversor/vendedor/inquilino), tiempo sin actividad, canal preferido, historial de interacciones y momento del dia optimo para enviar.`;

const SEQUENCE_TEMPLATES = {
  buyer: {
    name: 'comprador',
    steps: [
      { day: 1, type: 'whatsapp', template: 'presentacion', content: 'Hola {name}, gracias por tu interes en {property}. Tenemos opciones que te encantaran.' },
      { day: 3, type: 'email', template: 'dossier', content: 'Te enviamos nuestro dossier con las mejores propiedades en {zone}.' },
      { day: 7, type: 'whatsapp', template: 'seguimiento', content: '{name}, ¿que te parecieron las opciones que te enviamos?' },
      { day: 14, type: 'email', template: 'novedades', content: 'Novedades inmobiliarias en {zone} - {month}' },
      { day: 30, type: 'whatsapp', template: 'reactivacion', content: '{name}, hemos incorporado nuevas propiedades. ¿Quieres verlas?' },
    ],
  },
  investor: {
    name: 'inversor',
    steps: [
      { day: 1, type: 'email', template: 'inversion', content: 'Oportunidades de inversion inmobiliaria en {zone} con alta rentabilidad.' },
      { day: 5, type: 'whatsapp', template: 'analisis', content: '{name}, tenemos un analisis de mercado que te interesa.' },
      { day: 15, type: 'email', template: 'comparativa', content: 'Comparativa de rentabilidad por zonas - {month}' },
      { day: 30, type: 'whatsapp', template: 'oferta', content: 'Oferta exclusiva para inversores: {property}' },
    ],
  },
  seller: {
    name: 'vendedor',
    steps: [
      { day: 1, type: 'whatsapp', template: 'tasacion', content: '{name}, podemos tasar tu propiedad gratis sin compromiso.' },
      { day: 3, type: 'email', template: 'proceso', content: 'Te explicamos nuestro proceso de venta en 5 pasos.' },
      { day: 10, type: 'whatsapp', template: 'seguimiento', content: '{name}, ¿te gustaria saber cuanto vale tu piso?' },
    ],
  },
  renter: {
    name: 'inquilino',
    steps: [
      { day: 1, type: 'whatsapp', template: 'ofertas', content: 'Hola {name}, tenemos pisos en alquiler en {zone} que te interesaran.' },
      { day: 4, type: 'email', template: 'lista', content: 'Lista actualizada de alquileres en {zone}.' },
      { day: 12, type: 'whatsapp', template: 'visita', content: '¿Quieres visitar alguno esta semana? Tenemos disponibilidad.' },
    ],
  },
};

function generateSequenceFallback(leadProfile, frequency) {
  const interest = (leadProfile.property_interest || leadProfile.propertyInterest || leadProfile.interes || '').toLowerCase();
  const budget = leadProfile.budget || leadProfile.presupuesto || 0;
  const zone = leadProfile.zone || leadProfile.zona || 'tu zona';

  let profile = 'buyer';
  if (/invers|rentabil|alquiler/i.test(interest)) profile = 'investor';
  else if (/vende|vender|tasación/i.test(interest)) profile = 'seller';
  else if (/alquila|renta|inquilino/i.test(interest)) profile = 'renter';

  const template = SEQUENCE_TEMPLATES[profile] || SEQUENCE_TEMPLATES.buyer;
  const intervalDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 3;

  const steps = template.steps.map((step, i) => ({
    step: i + 1,
    day: step.day,
    channel: step.type,
    template: step.template,
    content: step.content
      .replace('{name}', leadProfile.name || '')
      .replace('{zone}', zone)
      .replace('{property}', leadProfile.property_interest || 'propiedades')
      .replace('{month}', new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })),
    sendAt: new Date(Date.now() + step.day * intervalDays * 86400000).toISOString(),
  }));

  return {
    profile,
    frequency: frequency || 'cada_3_dias',
    totalSteps: steps.length,
    durationDays: steps.reduce((max, s) => Math.max(max, s.day), 0),
    steps,
    estimatedCompletion: new Date(Date.now() + steps.reduce((max, s) => Math.max(max, s.day), 0) * intervalDays * 86400000).toISOString(),
  };
}

function createMessageFallback(leadData, sequenceStep) {
  const name = leadData.name || leadData.nombre || '';
  const zone = leadData.zone || leadData.zona || 'tu zona';
  const template = sequenceStep.template || 'generico';
  const channel = sequenceStep.channel || sequenceStep.type || 'whatsapp';

  const messages = {
    presentacion: `Hola ${name}, soy el asistente virtual de InmoTech. Hemos visto tu interes en propiedades en ${zone} y queremos ayudarte a encontrar la opcion perfecta. ¿Que tipo de propiedad buscas exactamente?`,
    dossier: `${name}, te enviamos nuestro catalogo con las mejores propiedades en ${zone}. Esperamos que te sea util. ¿Hay alguna que te llame la atencion?`,
    seguimiento: `Hola ${name}, ¿que tal? Queria saber si has tenido oportunidad de revisar la informacion que te enviamos. ¿Te surge alguna duda?`,
    novedades: `Hola ${name}, estas son las novedades inmobiliarias de este mes en ${zone}. Hemos incorporado nuevas propiedades que podrian interesarte.`,
    reactivacion: `${name}, hacia tiempo que no hablabamos. Hemos incorporado propiedades nuevas y me encantaria compartirlas contigo. ¿Sigue siendo buen momento?`,
    inversion: `Hola ${name}, tenemos oportunidades de inversion en ${zone} con rentabilidades atractivas. ¿Te gustaria recibir mas informacion?`,
    analisis: `${name}, nuestro equipo ha preparado un analisis del mercado en ${zone}. Las perspectivas son muy interesantes.`,
    comparativa: `${name}, compara la rentabilidad por zonas y descubre donde invertir este ${new Date().toLocaleDateString('es-ES', { month: 'long' })}.`,
    oferta: `${name}, tenemos una oportunidad exclusiva para inversores. Rentabilidad garantizada. ¿Quieres conocer los detalles?`,
    tasacion: `Hola ${name}, podemos tasar tu propiedad de forma gratuita y sin compromiso. ¿Te interesa saber cuanto vale tu casa?`,
    proceso: `${name}, te explicamos como funciona nuestro proceso de venta. Es mas sencillo de lo que imaginas.`,
    lista: `Hola ${name}, esta es nuestra lista actualizada de alquileres disponibles en ${zone}.`,
    visita: `${name}, ¿te gustaria visitar alguno de los pisos que te enviamos? Tenemos disponibilidad esta semana.`,
    generico: `Hola ${name}, queremos mantenerte al dia de las mejores oportunidades en ${zone}. ¿Podemos ayudarte en algo?`,
  };

  return {
    message: messages[template] || messages.generico,
    channel,
    template,
    personalized: true,
    tone: 'cercano y profesional',
  };
}

function detectReactivationMomentFallback(leadData) {
  const lastActivity = leadData.lastActivity || leadData.last_activity || leadData.ultimaActividad || '';
  const score = leadData.ia_score || leadData.score || 0;
  const originalSource = leadData.source || leadData.origen || '';
  const interactions = leadData.interactionCount || leadData.interacciones || 0;

  let daysSinceLastActivity = 0;
  if (lastActivity) {
    const lastDate = new Date(lastActivity);
    daysSinceLastActivity = Math.round((Date.now() - lastDate.getTime()) / 86400000);
  }

  const reasons = [];
  let recommended = false;
  let urgency = 'baja';

  if (daysSinceLastActivity >= 30 && score >= 50) {
    recommended = true;
    urgency = 'alta';
    reasons.push('30+ dias sin actividad pero con buena puntuacion historica');
  }
  if (daysSinceLastActivity >= 15 && score >= 70) {
    recommended = true;
    urgency = 'alta';
    reasons.push('Lead caliente que se ha enfriado, recuperacion prioritaria');
  }
  if (daysSinceLastActivity >= 45) {
    recommended = true;
    urgency = 'media';
    reasons.push('45+ dias sin actividad, riesgo de perdida');
  }
  if (interactions <= 1 && daysSinceLastActivity >= 7) {
    recommended = true;
    urgency = 'media';
    reasons.push('Solo 1 interaccion, requiere nutricion');
  }
  if (/whatsapp|llamada/i.test(originalSource) && daysSinceLastActivity >= 14) {
    recommended = true;
    urgency = 'alta';
    reasons.push('Fuente directa, alta probabilidad de reactivacion');
  }

  return {
    recommended,
    urgency,
    daysSinceLastActivity,
    reasons,
    suggestedAction: urgency === 'alta'
      ? 'Enviar mensaje personalizado hoy con nueva oferta o informacion relevante'
      : 'Incluir en secuencia de nurturing automatica',
    bestChannel: /whatsapp|llamada/i.test(originalSource) ? 'whatsapp' : 'email',
    optimalTime: 'martes o miercoles a las 11:00 o 17:00',
  };
}

function segmentByProfileFallback(leadData) {
  const interest = (leadData.property_interest || leadData.propertyInterest || leadData.interes || '').toLowerCase();
  const budget = leadData.budget || leadData.presupuesto || 0;
  const message = (leadData.message || leadData.comments || leadData.notes || '').toLowerCase();

  let segment = 'buyer';
  let segmentName = 'comprador';

  if (/invers|rentabil|ganancia|retorno|plusval|renta/i.test(interest) || /inversor/i.test(message)) {
    segment = 'investor';
    segmentName = 'inversor';
  } else if (/vende|vender|tasac|valora|precio venta/i.test(interest) || /vender|casa/i.test(message)) {
    segment = 'seller';
    segmentName = 'vendedor';
  } else if (/alqui|renta|inquil|arrend/i.test(interest) || /alquiler|rentar/i.test(message)) {
    segment = 'renter';
    segmentName = 'inquilino';
  }

  const subSegment = budget > 500000 ? 'premium' : budget > 200000 ? 'medio' : 'economico';

  return {
    segment,
    segmentName,
    subSegment,
    confidence: segment === 'buyer' ? 0.6 : 0.8,
    suggestedStrategy: segment === 'investor'
      ? 'Enviar analisis de rentabilidad y ROI'
      : segment === 'seller'
        ? 'Ofrecer tasacion gratuita'
        : segment === 'renter'
          ? 'Enviar lista de alquileres disponibles'
          : 'Enviar catalogo de propiedades en venta',
    channels: segment === 'investor' ? ['email', 'whatsapp'] : ['whatsapp', 'email'],
  };
}

function generateValueContentFallback(zone, interest) {
  const zoneName = zone || 'tu zona';
  const interestLower = (interest || '').toLowerCase();

  const contentByZone = {
    default: {
      title: `Guia de compra de vivienda en ${zoneName}`,
      summary: `Todo lo que necesitas saber antes de comprar en ${zoneName}. Precios, zonas recomendadas, tramites y financiacion.`,
      topics: ['Mejores barrios de la zona', 'Precio medio por m2', 'Tipos de propiedad disponibles', 'Documentacion necesaria', 'Consejos para negociar'],
      contentType: 'guia',
    },
  };

  if (/invers/i.test(interestLower)) {
    return {
      title: `Oportunidades de inversion en ${zoneName}`,
      summary: `Analisis de rentabilidad inmobiliaria en ${zoneName}. Comparativa de zonas con mayor plusvalia.`,
      topics: ['Rentabilidad por alquiler', 'Zonas en revalorizacion', 'Perfiles de inquilino por zona', 'Proyeccion de crecimiento'],
      contentType: 'analisis_inversion',
      estimatedROI: '4-7% anual',
    };
  }

  if (/vende|vender/i.test(interestLower)) {
    return {
      title: `Guia para vender tu propiedad en ${zoneName}`,
      summary: `Consejos para vender rapido y al mejor precio en ${zoneName}. Estrategias de marketing inmobiliario.`,
      topics: ['Como preparar tu casa para la venta', 'Estrategia de precios', 'Mejor epoca para vender', 'Documentos necesarios'],
      contentType: 'guia_venta',
    };
  }

  return contentByZone.default;
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function generateSequence(leadProfile, frequency) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Crea una secuencia de nurturing personalizada. Devuelve JSON con: profile, frequency, totalSteps, durationDays, steps (array de {step, day, channel, template, content, sendAt}), estimatedCompletion.
Lead: ${JSON.stringify(leadProfile)}
Frequency: ${frequency || 'cada_3_dias'}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Secuencia ${parsed.profile} creada: ${parsed.totalSteps} pasos en ${parsed.durationDays} dias` };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateSequenceFallback(leadProfile, frequency);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: secuencia ${result.profile}` : `Secuencia ${result.profile} creada: ${result.totalSteps} pasos` };
}

export async function createMessage(leadData, sequenceStep) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Crea un mensaje contextual para un paso de secuencia de nurturing. Devuelve JSON con: message, channel, template, personalized, tone.
Lead: ${JSON.stringify(leadData)}
Step: ${JSON.stringify(sequenceStep)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Mensaje "${parsed.template}" creado para ${leadData.name || 'lead'}` };
    } catch (err) { errors.push(err.message); }
  }
  const result = createMessageFallback(leadData, sequenceStep);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: mensaje ${result.template}` : `Mensaje "${result.template}" creado` };
}

export async function detectReactivationMoment(leadData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Detecta si es un buen momento para reactivar un lead. Devuelve JSON con: recommended, urgency, daysSinceLastActivity, reasons, suggestedAction, bestChannel, optimalTime.
Lead: ${JSON.stringify(leadData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: parsed.recommended ? `Reactivacion recomendada (urgencia: ${parsed.urgency})` : 'No es momento de reactivar' };
    } catch (err) { errors.push(err.message); }
  }
  const result = detectReactivationMomentFallback(leadData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: reactivacion ${result.recommended ? 'recomendada' : 'no recomendada'}` : result.recommended ? `Reactivacion recomendada (urgencia: ${result.urgency})` : 'No es momento de reactivar' };
}

export async function segmentByProfile(leadData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Segmenta un lead por perfil inmobiliario. Devuelve JSON con: segment, segmentName, subSegment, confidence, suggestedStrategy, channels.
Lead: ${JSON.stringify(leadData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Lead segmentado como ${parsed.segmentName} (${parsed.subSegment})` };
    } catch (err) { errors.push(err.message); }
  }
  const result = segmentByProfileFallback(leadData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: ${result.segmentName}` : `Lead segmentado como ${result.segmentName} (${result.subSegment})` };
}

export async function generateValueContent(zone, interest) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Genera contenido de valor para zona y tipo de interes. Devuelve JSON con: title, summary, topics (array), contentType, estimatedROI (si aplica).
Zone: ${zone}
Interest: ${interest}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Contenido "${parsed.contentType}" generado para ${zone}` };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateValueContentFallback(zone, interest);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: contenido ${result.contentType}` : `Contenido "${result.contentType}" generado para ${zone}` };
}

export async function execute(context) {
  const { action, payload } = context;
  switch (action) {
    case 'generateSequence': return generateSequence(payload.leadProfile, payload.frequency);
    case 'createMessage': return createMessage(payload.leadData, payload.sequenceStep);
    case 'detectReactivationMoment': return detectReactivationMoment(payload.leadData);
    case 'segmentByProfile': return segmentByProfile(payload.leadData);
    case 'generateValueContent': return generateValueContent(payload.zone, payload.interest);
    default: return { success: false, result: null, insight: `Accion desconocida: ${action}. Disponibles: generateSequence, createMessage, detectReactivationMoment, segmentByProfile, generateValueContent` };
  }
}
