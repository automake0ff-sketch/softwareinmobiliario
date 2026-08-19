import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-3-haiku-20240307';

function createMessage(systemPrompt, userMessage) {
  return anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
}

export async function callClaude(systemPrompt, userMessage) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'AI service not configured. Set ANTHROPIC_API_KEY environment variable.';
  }
  try {
    const response = await createMessage(systemPrompt, userMessage);
    return response.content[0].text;
  } catch (error) {
    console.error('Claude API error:', error.message);
    throw new Error(`Claude API error: ${error.message}`);
  }
}

export async function generateLeadSummary(leadData) {
  const systemPrompt = 'Eres un asistente inmobiliario experto. Resumen el perfil del lead en 2-3 frases destacando su intención de compra, presupuesto y urgencia. Responde en español.';
  const userMessage = `Analiza este lead: Nombre: ${leadData.name}, Email: ${leadData.email}, Teléfono: ${leadData.phone}, Presupuesto: ${leadData.budget || 'No especificado'}, Zona de interés: ${leadData.zone || 'No especificada'}, Tipo de propiedad: ${leadData.property_interest || 'No especificado'}, Origen: ${leadData.source || 'desconocido'}, Estado actual: ${leadData.status || 'nuevo'}.`;
  return callClaude(systemPrompt, userMessage);
}

export async function generatePropertyMatch(leadProfile, properties) {
  const systemPrompt = 'Eres un asesor inmobiliario. Recomiendas las mejores propiedades para un lead basándote en su perfil. Devuelve los índices de las propiedades ordenadas por relevancia y una explicación breve. Responde en español.';
  const leadInfo = `Lead: ${leadProfile.name}, Presupuesto: ${leadProfile.budget || 'variable'}, Zona: ${leadProfile.zone || 'cualquiera'}, Interés: ${leadProfile.property_interest || 'cualquiera'}`;
  const propsInfo = properties.map((p, i) => `${i}: ${p.title} - ${p.price}€ - ${p.city} ${p.zone || ''} - ${p.bedrooms} hab ${p.surface}m2`).join('\n');
  const userMessage = `Lead:\n${leadInfo}\n\nPropiedades:\n${propsInfo}\n\n¿Cuáles recomiendas y por qué?`;
  return callClaude(systemPrompt, userMessage);
}

export async function generateAgentResponse(agentType, context) {
  const prompts = {
    captador: 'Eres un agente captador de leads inmobiliario. Tu objetivo es calificar y captar nuevos leads. Responde de forma persuasiva pero profesional.',
    vendedor: 'Eres un agente vendedor inmobiliario experto. Tu objetivo es cerrar ventas y agendar visitas. Sé persuasivo y resolutivo.',
    coordinador: 'Eres un coordinador de agentes inmobiliarios. Organizas tareas, asignas leads y optimizas el flujo de trabajo del equipo.',
    copywriter: 'Eres un copywriter inmobiliario. Redactas descripciones atractivas de propiedades y mensajes de marketing.',
    tasador: 'Eres un tasador inmobiliario. Evalúas propiedades y determinas precios de mercado basados en datos comparativos.',
    analista: 'Eres un analista de datos inmobiliarios. Generas insights y recomendaciones basadas en métricas del negocio.',
  };
  const systemPrompt = prompts[agentType] || prompts.analista;
  return callClaude(systemPrompt, context);
}

export async function generatePropertyImprovement(property) {
  const systemPrompt = `Eres un experto en marketing inmobiliario y copywriting para portales como Idealista y Fotocasa.
Analiza la ficha de la propiedad y genera una versión mejorada, lista para publicar.
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin \`\`\`), con esta forma exacta:
{
  "title": "título comercial, atractivo, máximo 70 caracteres, sin mayúsculas sostenidas ni signos de exclamación excesivos",
  "description": "descripción de 3-5 frases, en español, destacando lo que realmente diferencia esta propiedad según los datos dados (no inventes datos que no se han proporcionado)",
  "strengths": ["2-4 puntos fuertes concretos de ESTA propiedad en concreto, basados en los datos reales"],
  "next_actions": ["2-3 acciones concretas y accionables para mejorar el anuncio, priorizando lo que más impacto tendría"]
}`;

  const fields = [
    `Título actual: ${property.title || 'sin título'}`,
    `Tipo: ${property.type || 'no especificado'}`,
    `Operación: ${property.operation_type === 'rent' ? 'alquiler' : 'venta'}`,
    `Precio: ${property.price ? `${Number(property.price).toLocaleString('es-ES')} €` : 'no especificado'}`,
    `Ubicación: ${[property.zone, property.city].filter(Boolean).join(', ') || 'no especificada'}`,
    `Habitaciones: ${property.bedrooms ?? 'no especificado'}`,
    `Baños: ${property.bathrooms ?? 'no especificado'}`,
    `Superficie: ${property.surface ? `${property.surface} m²` : 'no especificada'}`,
    `Planta: ${property.floor ?? 'no especificada'}`,
    `Ascensor: ${property.has_elevator ? 'sí' : 'no'}`,
    `Terraza: ${property.has_terrace ? 'sí' : 'no'}`,
    `Garaje: ${property.has_garage ? 'sí' : 'no'}`,
    `Piscina: ${property.has_pool ? 'sí' : 'no'}`,
    `Certificado energético: ${property.energy_certificate || 'no especificado'}`,
    `Descripción actual: ${property.description || 'sin descripción'}`,
    `Nº de imágenes: ${property.images ? (Array.isArray(property.images) ? property.images.length : String(property.images).split(/[\n,]/).filter(Boolean).length) : 0}`,
  ].join('\n');

  const raw = await callClaude(systemPrompt, `Ficha de la propiedad:\n${fields}`);
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.title || !parsed.description) throw new Error('Respuesta de IA incompleta');
  return {
    title: parsed.title,
    description: parsed.description,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    next_actions: Array.isArray(parsed.next_actions) ? parsed.next_actions : [],
  };
}

// Compatibility aliases for legacy imports
export const askClaude = callClaude;
export const isClientAvailable = () => !!process.env.ANTHROPIC_API_KEY;

export default { callClaude, generateLeadSummary, generatePropertyMatch, generateAgentResponse, generatePropertyImprovement, askClaude, isClientAvailable };
