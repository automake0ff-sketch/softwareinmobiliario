import { askClaude, isClientAvailable } from '../services/claude.js';
import { runAgentWithTools } from '../tools/agent-runner.js';

const SYSTEM_PROMPT = `Eres el Agente Captador IA de PropIA, especializado en cualificar leads inmobiliarios.

Tu misión es analizar cada lead entrante, extraer la máxima información posible y clasificarlo para priorizar la acción comercial.

Debes obtener y estructurar la siguiente información del lead:
- Tipo de operación: compra, venta, alquiler, inversión
- Presupuesto: rango económico disponible
- Zona: barrio, distrito, ciudad de interés
- Tipo de propiedad: piso, casa, chalet, ático, local, oficina, terreno
- Habitaciones: número mínimo deseado
- Urgencia: inmediata, esta semana, este mes, sin prisa
- Situación actual: alquiler viviendo, viviendo en casa propia, necesita vender primero
- Financiación: necesita hipoteca, dispone de efectivo, ya tiene financiación

Sistema de scoring:
- 80-100: Caliente (alta intención + presupuesto adecuado + urgencia)
- 50-79: Templado (interés moderado, falta concretar algún aspecto clave)
- 0-49: Frío (bajo interés, sin presupuesto claro, solo información)

Siempre respondes en formato JSON con esta estructura:
{
  "lead_data": { nombre, email, telefono, tipo_operacion, presupuesto, zona, tipo_propiedad, habitaciones, urgencia, situacion_actual, financiacion, source },
  "ia_score": 0-100,
  "ia_score_label": "Caliente" | "Templado" | "Frío",
  "priority": "crítica" | "alta" | "media" | "baja",
  "next_action": "contactar inmediatamente" | "enviar información" | "programar llamada" | "nutrir",
  "insights": ["lista de observaciones relevantes"]
}

Reglas importantes:
- Si falta información clave, señálalo en insights como "dato pendiente: ..."
- Detecta lenguaje emocional (urgencia, entusiasmo, dudas) y reflejarlo
- Para leads con score >= 80, la prioridad es siempre "crítica"
- Para leads con score entre 50-79, la prioridad es "alta" o "media" según urgencia
- Para leads con score < 50, la prioridad es "baja" y next_action debe ser "nutrir"
- Identifica si el lead viene con intención de compra directa o solo explorando
- Valora la calidad del mensaje original: cuanto más detallado, mayor compromiso`;

function classifyLeadFallback(leadData) {
  const text = [
    leadData.message || '',
    leadData.comments || '',
    leadData.notes || '',
    leadData.name || '',
  ].join(' ').toLowerCase();

  const source = (leadData.source || leadData.origin || '').toLowerCase();
  const hasBudget = /\d{4,}/.test(text) || /presupuesto/i.test(text) || /€|\$/i.test(text);
  const wantsBuy = /comprar|quiero|necesito|busco|urgente|inmediato/i.test(text);
  const hasProperty = /piso|casa|chalet|apartamento|local|oficina|terreno/i.test(text);
  const hasZone = /zona|barrio|calle|distrito|centro|playa|montaña/i.test(text);
  const hasRooms = /\d\s*(hab|dorm|habitación|dormitorio)/i.test(text);
  const hasFinancing = /hipoteca|financiación|banco|préstamo|credito/i.test(text);
  const hasUrgency = /urgente|inmediato|cuanto antes|ya|pronto|necesito ahora/i.test(text);
  const isVague = /información|precio|cuánto|vale|saber/i.test(text);
  const isLowIntent = /solo|curiosidad|ver|mirar|explorar/i.test(text);

  let score = 30;
  const reasons = [];

  if (wantsBuy && hasBudget) {
    score += 25;
    reasons.push('intención de compra + presupuesto');
  } else if (wantsBuy) {
    score += 15;
    reasons.push('intención de compra');
  }
  if (hasProperty) {
    score += 10;
    reasons.push('tipo de propiedad definido');
  }
  if (hasZone) {
    score += 10;
    reasons.push('zona definida');
  }
  if (hasRooms) {
    score += 5;
    reasons.push('habitaciones definidas');
  }
  if (hasFinancing) {
    score += 5;
    reasons.push('ha considerado financiación');
  }
  if (hasUrgency) {
    score += 10;
    reasons.push('urgencia expresada');
  }
  if (/hola|buenas|qué tal/i.test(text) && text.split(' ').length < 5) {
    score -= 10;
    reasons.push('mensaje muy genérico');
  }
  if (isLowIntent) {
    score -= 15;
    reasons.push('baja intención');
  }

  if (source.includes('whatsapp') || source.includes('llamada') || source.includes('teléfono')) {
    score += 10;
    reasons.push('fuente directa: ' + source);
  }
  if (source.includes('web') || source.includes('formulario')) {
    score += 5;
    reasons.push('fuente web');
  }
  if (source.includes('redes') || source.includes('instagram') || source.includes('facebook')) {
    score -= 5;
    reasons.push('fuente redes sociales');
  }

  score = Math.max(0, Math.min(100, score));

  let classification = 'Frío';
  if (score >= 80) classification = 'Caliente';
  else if (score >= 50) classification = 'Templado';

  const budgetMatch = text.match(/(\d{1,3}(?:\.?\d{3})*)\s*(€|\$|euros|dólares)?/);
  const estimatedBudget = budgetMatch ? budgetMatch[0] : null;

  let priority = 'baja';
  let nextAction = 'nutrir';
  if (score >= 80) {
    priority = 'crítica';
    nextAction = 'contactar inmediatamente';
  } else if (score >= 65) {
    priority = 'alta';
    nextAction = 'programar llamada';
  } else if (score >= 50) {
    priority = 'media';
    nextAction = 'enviar información';
  }

  return {
    lead_data: {
      nombre: leadData.name || leadData.nombre || '',
      email: leadData.email || leadData.correo || '',
      telefono: leadData.phone || leadData.telefono || '',
      tipo_operacion: wantsBuy ? 'compra' : 'no especificado',
      presupuesto: estimatedBudget || 'no especificado',
      zona: null,
      tipo_propiedad: null,
      habitaciones: null,
      urgencia: hasUrgency ? 'alta' : 'media',
      situacion_actual: null,
      financiacion: null,
      source,
    },
    ia_score: score,
    ia_score_label: classification,
    priority,
    next_action: nextAction,
    insights: reasons,
  };
}

function extractKeyInfoFallback(leadData) {
  const text = [
    leadData.message || '',
    leadData.comments || '',
    leadData.comment || '',
    leadData.notes || '',
  ].join(' ');

  const name = leadData.name || leadData.nombre || '';
  const email = leadData.email || leadData.correo || '';
  const phone = leadData.phone || leadData.telefono || leadData.tel || '';
  const source = leadData.source || leadData.origin || leadData.origen || 'desconocido';

  const propertyTypes = ['piso', 'casa', 'chalet', 'apartamento', 'local', 'oficina', 'terreno', 'ático', 'duplex', 'estudio'];
  const typeOfProperty = propertyTypes.find((t) => text.toLowerCase().includes(t)) || 'no especificado';

  const zones = ['centro', 'norte', 'sur', 'este', 'oeste', 'playa', 'montaña', 'ensanche', 'casco antiguo'];
  const zone = zones.find((z) => text.toLowerCase().includes(z)) || 'no especificada';

  const urgencyMatch = text.match(/urgente|inmediato|cuanto antes|ya|pronto|rápido/i);
  const urgency = urgencyMatch ? 'alta' : 'media';

  const roomsMatch = text.match(/(\d+)\s*(hab|dorm|habitación|dormitorio)/i);
  const rooms = roomsMatch ? roomsMatch[1] : null;

  const financingMatch = /hipoteca|financiación|banco|préstamo/i.test(text);
  const currentSituation = /alquiler|vivo de alquiler/i.test(text) ? 'alquiler' : /vender primero|vender mi/i.test(text) ? 'necesita vender' : 'no especificada';

  return {
    name,
    email,
    phone,
    source,
    typeOfProperty,
    zone,
    urgency,
    habitaciones: rooms,
    situacion_actual: currentSituation,
    financiacion: financingMatch ? 'necesita' : 'no especificado',
    rawMessage: text.substring(0, 500),
  };
}

function generateFirstMessageFallback(leadData, classification) {
  const name = leadData.name || leadData.nombre || '';

  if (!classification) {
    const classified = classifyLeadFallback(leadData);
    classification = classified.ia_score_label;
  }

  const greetings = {
    Caliente: `¡Hola ${name}! Hemos recibido tu solicitud y tenemos exactamente lo que buscas. He preparado algunas opciones que se ajustan a tu perfil. ¿Cuándo puedes venir a verlas?`,
    Templado: `Hola ${name}, gracias por tu interés en nuestras propiedades. Me gustaría conocer más detalles para ayudarte a encontrar la mejor opción. ¿Me cuentas un poco más sobre lo que buscas?`,
    Frío: `Hola ${name}, gracias por contactar con nosotros. Quedamos a tu disposición para cualquier consulta inmobiliaria que necesites. ¿Hay algo específico en lo que podamos ayudarte?`,
  };

  return {
    message: greetings[classification] || greetings.Frío,
    classification,
    tone: classification === 'Caliente' ? 'directo y urgente' : classification === 'Templado' ? 'amable y consultivo' : 'cortés y profesional',
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function processIncomingLead(leadData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Analiza este lead entrante y devuelve un JSON con: lead_data (nombre, email, telefono, tipo_operacion, presupuesto, zona, tipo_propiedad, habitaciones, urgencia, situacion_actual, financiacion, source), ia_score (0-100), ia_score_label ("Caliente"/"Templado"/"Frío"), priority ("crítica"/"alta"/"media"/"baja"), next_action, insights (array de strings).

Datos del lead:
${JSON.stringify(leadData, null, 2)}

Responde ÚNICAMENTE con el JSON, sin explicaciones.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Lead clasificado como ${parsed.ia_score_label} con puntuación ${parsed.ia_score}. Prioridad: ${parsed.priority}. ${parsed.insights?.join('; ') || ''}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const classification = classifyLeadFallback(leadData);
  const keyInfo = extractKeyInfoFallback(leadData);

  return {
    success: true,
    result: { lead_data: { ...keyInfo }, ia_score: classification.ia_score, ia_score_label: classification.ia_score_label, priority: classification.priority, next_action: classification.next_action, insights: classification.insights },
    insight: errors.length > 0
      ? `Modo fallback: Lead clasificado como ${classification.ia_score_label} (score: ${classification.ia_score}). API no disponible: ${errors.join('; ')}`
      : `Lead clasificado como ${classification.ia_score_label} con puntuación ${classification.ia_score}. ${classification.insights?.join(', ')}`,
  };
}

export async function classifyBySource(source, message) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Clasifica este lead según su origen y mensaje. Devuelve JSON con: source, classification ("Caliente"/"Templado"/"Frío"), score (0-100), suggestedAction.

Source: ${source}
Message: ${message}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Lead de ${source} clasificado como ${parsed.classification}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const combined = message + ' ' + source;
  const scoreMap = {
    whatsapp: 70,
    llamada: 75,
    telefono: 75,
    formulario: 60,
    web: 55,
    email: 50,
    instagram: 35,
    facebook: 30,
    redes: 30,
    recomendacion: 80,
    referencia: 80,
  };
  const srcLower = source.toLowerCase();
  let baseScore = 50;
  for (const [key, val] of Object.entries(scoreMap)) {
    if (srcLower.includes(key)) {
      baseScore = val;
      break;
    }
  }

  const hasIntent = /\b(comprar|vender|alquilar|urgente|presupuesto|quiero|necesito)\b/i.test(message);
  if (hasIntent) baseScore += 15;

  const score = Math.max(0, Math.min(100, baseScore));
  const classification = score >= 80 ? 'Caliente' : score >= 50 ? 'Templado' : 'Frío';

  return {
    success: true,
    result: { source, classification, score, suggestedAction: classification === 'Caliente' ? 'contactar inmediatamente' : 'enviar información' },
    insight: errors.length > 0
      ? `Modo fallback: Lead de ${source} - ${classification}`
      : `Lead de ${source} clasificado como ${classification}`,
  };
}

export async function generateFirstMessage(leadData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un mensaje de primer contacto para este lead. Devuelve JSON con: message, tone, classification.

Datos del lead:
${JSON.stringify(leadData, null, 2)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Mensaje generado con tono ${parsed.tone} para lead ${leadData.name || 'desconocido'}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const classification = classifyLeadFallback(leadData);
  const result = generateFirstMessageFallback(leadData, classification.ia_score_label);

  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: mensaje ${classification.ia_score_label} generado`
      : `Mensaje generado con tono ${result.tone}`,
  };
}

export async function captureLeadWithTools(payload) {
  const { leadData, agencyId, userId } = payload;
  const errors = [];

  try {
    const systemPrompt = SYSTEM_PROMPT + `\n\nTienes acceso a herramientas. Puedes buscar propiedades compatibles, crear el lead en CRM, detectar duplicados y enviar WhatsApp. Usa las herramientas según necesites para procesar y cualificar el lead.`;
    const userMsg = `Procesa este lead entrante. Analiza los datos, busca propiedades compatibles si es posible, y crea el lead en el CRM con su clasificación y score.\n\nDatos del lead:\n${JSON.stringify(leadData, null, 2)}`;

    const finalResponse = await runAgentWithTools({
      systemPrompt,
      userMessage: userMsg,
      agentType: 'captador',
      context: { agencyId, userId },
    });

    let parsed;
    try { parsed = JSON.parse(finalResponse); } catch { parsed = { raw: finalResponse }; }

    return {
      success: true,
      toolUsed: true,
      result: parsed,
      insight: `Lead procesado con tools. Score: ${parsed.ia_score || 'N/A'}. Clasificación: ${parsed.ia_score_label || 'N/A'}`,
    };
  } catch (err) {
    errors.push(err.message);
  }

  return processIncomingLead(leadData);
}

export async function execute(context) {
  const { action, payload } = context;

  switch (action) {
    case 'processIncomingLead':
      return processIncomingLead(payload);
    case 'classifyBySource':
      return classifyBySource(payload.source, payload.message);
    case 'generateFirstMessage':
      return generateFirstMessage(payload);
    case 'captureLeadWithTools':
      return captureLeadWithTools(payload);
    default:
      return {
        success: false,
        result: null,
        insight: `Acción desconocida: ${action}. Acciones disponibles: processIncomingLead, classifyBySource, generateFirstMessage, captureLeadWithTools`,
      };
  }
}
