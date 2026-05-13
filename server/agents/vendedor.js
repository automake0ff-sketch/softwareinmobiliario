import { askClaude, isClientAvailable } from '../services/claude.js';
import { PropIARagRetriever, buildRagContext } from '../rag/retriever.js';

const SYSTEM_PROMPT = `Eres un Agente Vendedor IA especializado en conversión de leads inmobiliarios. Tu objetivo es transformar leads templados en calientes y cerrar operaciones.

Cuando recibas contexto RAG (propiedades similares, conversaciones exitosas previas, datos de mercado), ÚSALO para:
- Recomendar propiedades que realmente encajen con el perfil del lead
- Aplicar estrategias que ya funcionaron en casos similares
- Responder objeciones con argumentos basados en datos de mercado reales

Técnicas de gestión de objeciones:
- "Me lo tengo que pensar": Crear urgencia realista con datos de demanda. Ofrecer reserva temporal 48h sin compromiso.
- "Es caro": Reframe valor vs precio. Desglosar características que justifican el valor. Comparar con precio por m² de la zona.
- "No me decido por la zona": Destacar puntos fuertes de la zona (colegios, transporte, servicios). Comparar con zonas similares. Ofrecer visita para que conozca el entorno.
- "Primero tengo que vender mi piso": Ofrecer servicio de venta coordinada. Explicar opciones de venta+compra simultánea. Presentar casos de éxito similares.

Detección de señales de cierre:
- Pregunta sobre disponibilidad inmediata
- Pregunta sobre gastos de comunidad/IBI
- Menciona "mi pareja también opina que..."
- Pregunta sobre fechas de entrada
- Pide detalles sobre trámites y papeleo
- Compara con otra propiedad pero vuelve a esta

Personalización por perfil:
- Familia joven: destacar colegios, zonas verdes, seguridad, espacios amplios
- Inversor: rentabilidad, plusvalía, demanda de alquiler en la zona, ROI
- Primera vivienda: facilidades de pago, ayudas, paso a paso del proceso, tranquilidad
- Lujo: exclusividad, privacidad, acabados premium, servicios VIP

Cuándo escalar a humano:
- El cliente solicita expresamente hablar con un comercial
- Negociación de condiciones especiales o descuentos significativos
- El cliente muestra frustración o enfado
- Se requiere asesoría legal o financiera especializada
- El lead es una oportunidad de alto valor (>500K)

Siempre respondes en formato JSON con:
{
  "score_change": número (positivo o negativo),
  "new_insights": ["observaciones relevantes"],
  "recommended_properties": ["títulos de propiedades recomendadas"],
  "should_escalate": boolean,
  "stage_change": "templado->caliente" | "caliente->negociación" | "mantener" | "enfriando"
}`;

const OBJECTION_RESPONSES = {
  'es muy caro': {
    reframe: 'Entiendo que el precio puede parecer elevado, pero hay que considerar que esta propiedad tiene unas características que la hacen única en el mercado. Además, estamos en un momento de revalorización constante en esta zona.',
    strategy: 'Valor vs precio: destacar características que justifican el valor. Ofrecer facilidades de pago si están disponibles.',
    alternative: 'Si quieres, podemos explorar opciones similares con un rango de precio más ajustado, aunque perderías algunas de las prestaciones que ofrece esta.',
  },
  'lo voy a pensar': {
    reframe: 'Por supuesto, es una decisión importante. Pero déjame contarte que esta semana tenemos otras 3 visitas programadas para el mismo inmueble. Si te gusta de verdad, no me gustaría que te quedases sin él.',
    strategy: 'Crear urgencia realista. Recordar que las buenas oportunidades no duran. Ofrecer una segunda visita.',
    alternative: 'Podemos hacer una reserva temporal por 48h sin compromiso mientras lo piensas. Así te aseguras la propiedad.',
  },
  'no me decido por la zona': {
    reframe: 'Entiendo tus dudas sobre la zona. Déjame contarte que esta zona ha experimentado una revalorización del 15% en el último año. Además, tienes colegios, centros comerciales y parques a menos de 10 minutos.',
    strategy: 'Destacar puntos fuertes de la zona. Comparar con zonas similares. Ofrecer visita para conocer el entorno.',
    alternative: 'Podemos visitar la propiedad y de paso te enseño los puntos clave de la zona. Muchas veces cambiar de opinión cuando se ve en persona.',
  },
  'primero tengo que vender mi piso': {
    reframe: 'Es completamente comprensible. De hecho, trabajamos con muchas familias en tu misma situación. Podemos coordinar la venta de tu piso actual mientras gestionamos la compra de tu nueva casa.',
    strategy: 'Ofrecer servicio de venta coordinada. Explicar opciones de venta+compra simultánea. Presentar casos de éxito.',
    alternative: 'Podemos tasar tu piso actual sin compromiso y buscar un comprador mientras tanto. Así cuando encuentres la casa ideal, ya tienes el camino allanado.',
  },
  'quiero ver otras opciones': {
    reframe: 'Me parece perfecto, es importante comparar. De hecho, yo mismo puedo enseñarte otras 3 propiedades similares que tenemos en cartera para que puedas valorar.',
    strategy: 'Convertirse en su asesor de confianza mostrando alternativas propias. Evitar que vaya a la competencia.',
    alternative: 'He preparado una selección de propiedades que se ajustan a tu perfil. ¿Te parece si las vemos juntos esta semana?',
  },
  'tengo que consultar con mi pareja/familia': {
    reframe: 'Por supuesto, una decisión así se toma en familia. De hecho, es buena señal que quieras involucrarlos. ¿Por qué no organizamos una visita conjunta este fin de semana para que todos la vean?',
    strategy: 'Facilitar la decisión grupal. Ofrecer visitas en horarios convenientes para todos.',
    alternative: 'Puedo preparar un dossier informativo con todos los detalles para que lo compartas con ellos. ¿Te parece útil?',
  },
  'no tengo financiación': {
    reframe: 'No te preocupes, trabajamos con varias entidades bancarias que ofrecen condiciones especiales a nuestros clientes. Podemos hacer un estudio de viabilidad sin compromiso.',
    strategy: 'Ofrecer asesoría financiera. Presentar opciones de financiación. Calcular cuota mensual.',
    alternative: 'Muchos de nuestros clientes empiezan con una hipoteca del 80% y cuotas muy asequibles. ¿Quieres que te hagamos una simulación?',
  },
};

function handleObjectionFallback(objection, context) {
  const objLower = objection.toLowerCase();
  const propertyName = context?.propertyName || context?.property?.title || 'la propiedad';

  let matchedKey = null;
  let bestScore = 0;

  for (const [key] of Object.entries(OBJECTION_RESPONSES)) {
    const words = key.split(' ');
    let score = 0;
    for (const word of words) {
      if (objLower.includes(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      matchedKey = key;
    }
  }

  if (!matchedKey || bestScore < 1) {
    return {
      detectedObjection: objection,
      response: `Entiendo tu punto. En mi experiencia, la mejor forma de resolver dudas como esa es que lo veas en persona. ¿Qué te parece si organizamos una visita?`,
      strategy: 'Escucha activa y ofrecer visita',
      confidence: 0.5,
      should_escalate: false,
    };
  }

  const template = OBJECTION_RESPONSES[matchedKey];
  const personalizedResponse = template.reframe.replace('la propiedad', propertyName);

  return {
    detectedObjection: matchedKey,
    response: personalizedResponse,
    strategy: template.strategy,
    alternatives: template.alternative,
    confidence: 0.85,
    should_escalate: false,
  };
}

function generateFollowUpFallback(leadData, history) {
  const daysSinceLast = leadData.daysSinceLastContact || 0;
  const name = leadData.name || leadData.nombre || '';
  const lastAction = leadData.lastAction || 'interés mostrado';
  const property = leadData.propertyTitle || leadData.property?.title || leadData.propertyName || 'la propiedad';

  if (daysSinceLast <= 1) {
    return {
      message: `Hola ${name}, solo quería confirmar que recibí tu mensaje. Quedo atento a cualquier duda sobre ${property}.`,
      type: 'seguimiento inmediato',
      score_change: 0,
      stage_change: 'mantener',
    };
  }

  if (daysSinceLast <= 3) {
    return {
      message: `Hola ${name}, ¿qué tal? Quería saber si has tenido oportunidad de pensarlo. Sigo teniendo disponible ${property} y hay buen interés. No dudes en consultarme cualquier cosa.`,
      type: 'seguimiento recordatorio',
      score_change: 5,
      stage_change: 'mantener',
    };
  }

  if (daysSinceLast <= 7) {
    return {
      message: `Hola ${name}, espero que estés bien. Te escribo porque ${property} sigue despertando mucho interés. He tenido varias consultas esta semana. Aún estás a tiempo de visitarla, ¿te parece?`,
      type: 'seguimiento urgencia',
      score_change: 10,
      stage_change: 'templado->caliente',
    };
  }

  return {
    message: `Hola ${name}, hace unos días hablamos sobre ${property}. Quería retomar el contacto por si sigues interesado. He actualizado mi cartera y tengo novedades que pueden interesarte.`,
    type: 'seguimiento reactivación',
    score_change: 5,
    stage_change: 'mantener',
  };
}

function generateUrgencyMessageFallback(property, leadProfile) {
  const propTitle = property?.title || property?.name || 'la propiedad';
  const name = leadProfile?.name || leadProfile?.nombre || '';
  const views = property?.views || property?.visitas || 0;
  const favorites = property?.favorites || property?.favoritos || 0;
  const price = property?.price || property?.precio || '';

  const priceNote = price ? ` con un precio de ${price}` : '';

  return {
    message: `¡${name}! Te escribo porque ${propTitle}${priceNote} está teniendo muchísimo movimiento. Esta semana ha recibido ${Math.max(views, 3)} consultas y ${Math.max(favorites, 2)} clientes la han marcado como favorita. No me gustaría que te quedases sin ella. ¿Podemos hablar hoy?`,
    urgencyLevel: views > 10 ? 'alta' : 'media',
    type: 'urgencia por demanda',
    should_escalate: false,
  };
}

function suggestClosingStrategyFallback(leadData) {
  const score = leadData.score || leadData.puntuacion || 50;
  const objections = leadData.objectionsRaised || leadData.objeciones || [];
  const visitsDone = leadData.visitsDone || leadData.visitasRealizadas || 0;
  const profile = (leadData.profile || leadData.perfil || '').toLowerCase();

  let strategy = 'cierre consultivo';
  let approach = 'Todavía en fase de evaluación. Ofrecer más información y generar confianza.';
  let script = 'Cuéntame, ¿qué información adicional necesitas para tomar una decisión?';
  let timing = 'media / largo plazo';

  if (score >= 80) {
    strategy = 'cierre directo';
    approach = `El lead está listo${profile ? ' (perfil: ' + profile + ')' : ''}. Preguntar directamente por la decisión. Ofrecer condiciones especiales por cierre rápido.`;
    script = 'Como has visto, esta propiedad cumple con todo lo que buscabas. ¿Te parece si empezamos con los trámites?';
    timing = 'inmediato';
  } else if (score >= 60 && visitsDone >= 1) {
    strategy = 'cierre por urgencia';
    approach = 'Ya ha visitado. Reforzar beneficios únicos y crear urgencia limitada.';
    script = 'Como te comenté, hay otras personas interesadas. Puedo mantener las condiciones actuales si concretamos esta semana.';
    timing = 'próximos 3 días';
  } else if (objections.length > 0) {
    strategy = 'cierre por manejo de objeciones';
    approach = 'Resolver objeciones una por una antes de intentar cierre.';
    script = 'Me gustaría abordar cada una de tus dudas para que puedas tomar la mejor decisión.';
    timing = 'tras resolver objeciones';
  }

  return {
    strategy,
    approach,
    script,
    timing,
    should_escalate: score >= 80 && visitsDone >= 2,
    stage_change: score >= 80 ? 'caliente->negociación' : 'mantener',
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function handleObjection(objection, context) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `El cliente ha puesto esta objeción: "${objection}". Contexto: ${JSON.stringify(context)}

Devuelve un JSON con: detectedObjection, response, strategy, alternatives, confidence, should_escalate.

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Objeción "${parsed.detectedObjection}" manejada con estrategia: ${parsed.strategy}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = handleObjectionFallback(objection, context);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: objeción "${result.detectedObjection}" manejada`
      : `Objeción "${result.detectedObjection}" manejada con estrategia: ${result.strategy}`,
  };
}

export async function generateFollowUp(leadData, conversationHistory) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un mensaje de seguimiento para este lead. Devuelve JSON con: message, type, score_change, stage_change.

Lead: ${JSON.stringify(leadData)}
Historial: ${JSON.stringify(conversationHistory?.slice(-5) || [])}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Follow-up tipo "${parsed.type}" generado para ${leadData.name || 'lead'}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateFollowUpFallback(leadData, conversationHistory);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: follow-up tipo "${result.type}" generado`
      : `Follow-up tipo "${result.type}" generado para ${leadData.name || 'lead'}`,
  };
}

export async function generateUrgencyMessage(property, leadProfile) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un mensaje de urgencia para este lead sobre esta propiedad. Devuelve JSON con: message, urgencyLevel, type, should_escalate.

Property: ${JSON.stringify(property)}
Lead: ${JSON.stringify(leadProfile)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Mensaje de urgencia nivel "${parsed.urgencyLevel}" generado`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateUrgencyMessageFallback(property, leadProfile);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: urgencia ${result.urgencyLevel}`
      : `Mensaje de urgencia nivel "${result.urgencyLevel}" generado para ${property?.title || 'propiedad'}`,
  };
}

export async function suggestClosingStrategy(leadData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Sugiere la mejor estrategia de cierre para este lead. Devuelve JSON con: strategy, approach, script, timing, should_escalate, stage_change.

Lead Data: ${JSON.stringify(leadData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Estrategia de cierre sugerida: ${parsed.strategy} (timing: ${parsed.timing})`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = suggestClosingStrategyFallback(leadData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: estrategia ${result.strategy}`
      : `Estrategia de cierre sugerida: ${result.strategy} (timing: ${result.timing})`,
  };
}

export async function getRagContextForLead(lead, incomingMessage) {
  try {
    const retriever = new PropIARagRetriever();

    const similarProps = await retriever.findSimilarProperties(lead);
    const isObjection = detectObjection(incomingMessage);
    const successfulExamples = isObjection
      ? await retriever.findSimilarSuccessfulConversations(incomingMessage, lead.agency_id)
      : [];
    const marketInfo = await retriever.searchKnowledgeBase(
      `mercado inmobiliario ${lead.zone || ''}`,
      lead.agency_id,
      'mercado'
    );

    return buildRagContext({ similarProps, successfulExamples, marketInfo });
  } catch (err) {
    console.warn('[VENDEDOR] RAG context error:', err.message);
    return null;
  }
}

function detectObjection(message) {
  const objectionKeywords = [
    'caro', 'precio', 'barato', 'pensar', 'decidir', 'duda', 'zona',
    'vender', 'opciones', 'consultar', 'pareja', 'familia', 'financiación',
    'hipoteca', 'interés', 'esperar', 'bajen', 'inversión',
  ];
  const lower = (message || '').toLowerCase();
  return objectionKeywords.some(kw => lower.includes(kw));
}

export async function execute(context) {
  const { action, payload } = context;

  switch (action) {
    case 'handleObjection':
      return handleObjection(payload.objection, payload.context);
    case 'handleObjectionWithRag':
      return handleObjectionWithRag(payload);
    case 'generateFollowUp':
      return generateFollowUp(payload.leadData, payload.conversationHistory);
    case 'generateFollowUpWithRag':
      return generateFollowUpWithRag(payload);
    case 'generateUrgencyMessage':
      return generateUrgencyMessage(payload.property, payload.leadProfile);
    case 'suggestClosingStrategy':
      return suggestClosingStrategy(payload.leadData);
    case 'runVendedorWithRag':
      return runVendedorWithRag(payload);
    default:
      return {
        success: false,
        result: null,
        insight: `Acción desconocida: ${action}. Acciones disponibles: handleObjection, generateFollowUp, generateUrgencyMessage, suggestClosingStrategy, handleObjectionWithRag, generateFollowUpWithRag, runVendedorWithRag`,
      };
  }
}

export async function handleObjectionWithRag(payload) {
  const { objection, lead, context } = payload;
  const errors = [];

  const ragContext = await getRagContextForLead(lead, objection);
  const ragSection = ragContext
    ? `\n\n## CONTEXTO RAG PARA ESTE LEAD\nEjemplos de conversaciones similares que funcionaron:\n${ragContext.examplesSection}\n\nDatos de mercado relevantes:\n${ragContext.marketSection}`
    : '';

  const extendedSystemPrompt = SYSTEM_PROMPT + ragSection;

  if (isClientAvailable()) {
    try {
      const prompt = `El cliente ha puesto esta objeción: "${objection}". Contexto: ${JSON.stringify(context || {})}

Devuelve un JSON con: detectedObjection, response, strategy, alternatives, confidence, should_escalate.

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(extendedSystemPrompt, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        ragUsed: !!ragContext,
        result: parsed,
        insight: `Objeción "${parsed.detectedObjection}" manejada con estrategia: ${parsed.strategy}${ragContext ? ' (con contexto RAG)' : ''}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = handleObjectionFallback(objection, context);
  return {
    success: true,
    ragUsed: false,
    result,
    insight: errors.length > 0
      ? `Modo fallback: objeción "${result.detectedObjection}" manejada`
      : `Objeción "${result.detectedObjection}" manejada con estrategia: ${result.strategy}`,
  };
}

export async function generateFollowUpWithRag(payload) {
  const { lead, conversationHistory } = payload;
  const errors = [];

  const ragContext = await getRagContextForLead(lead, '');
  const ragSection = ragContext
    ? `\n\n## PROPIEDADES RELEVANTES PARA ESTE LEAD\n${ragContext.propertiesSection}`
    : '';

  const extendedSystemPrompt = SYSTEM_PROMPT + ragSection;

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un mensaje de seguimiento para este lead. Devuelve JSON con: message, type, score_change, stage_change.

Lead: ${JSON.stringify(lead)}
Historial: ${JSON.stringify(conversationHistory?.slice(-5) || [])}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(extendedSystemPrompt, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        ragUsed: !!ragContext,
        result: parsed,
        insight: `Follow-up tipo "${parsed.type}" generado para ${lead.name || 'lead'}${ragContext ? ' (con contexto RAG)' : ''}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateFollowUpFallback(lead, conversationHistory);
  return {
    success: true,
    ragUsed: false,
    result,
    insight: errors.length > 0
      ? `Modo fallback: follow-up tipo "${result.type}" generado`
      : `Follow-up tipo "${result.type}" generado para ${lead.name || 'lead'}`,
  };
}

export async function runVendedorWithRag(payload) {
  const { lead, incomingMessage } = payload;
  const errors = [];

  const ragContext = await getRagContextForLead(lead, incomingMessage);
  const ragSection = ragContext ? `

## PROPIEDADES RELEVANTES PARA ESTE LEAD (recuperadas automáticamente)
${ragContext.propertiesSection}

## EJEMPLOS DE CONVERSACIONES SIMILARES QUE FUNCIONARON
${ragContext.examplesSection}

## DATOS DE MERCADO RELEVANTES
${ragContext.marketSection}
` : '';

  const extendedSystemPrompt = SYSTEM_PROMPT + ragSection;

  if (isClientAvailable()) {
    try {
      const prompt = `El lead ha enviado este mensaje: "${incomingMessage}"

Perfil del lead: ${JSON.stringify(lead)}

Devuelve un JSON con:
{
  "response": "tu respuesta al lead",
  "score_change": número (positivo o negativo),
  "new_insights": ["observaciones relevantes"],
  "recommended_properties": ["títulos de propiedades recomendadas si aplica"],
  "should_escalate": boolean,
  "stage_change": "templado->caliente" | "caliente->negociación" | "mantener" | "enfriando"
}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(extendedSystemPrompt, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        ragUsed: !!ragContext,
        result: parsed,
        insight: `Respuesta generada para ${lead.name || 'lead'}${ragContext ? ' (con contexto RAG)' : ''}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  return {
    success: false,
    ragUsed: false,
    result: null,
    insight: `Error generando respuesta con RAG: ${errors.join(', ')}`,
  };
}
