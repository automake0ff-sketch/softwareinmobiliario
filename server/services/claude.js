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

// Compatibility aliases for legacy imports
export const askClaude = callClaude;
export const isClientAvailable = () => !!process.env.ANTHROPIC_API_KEY;

export default { callClaude, generateLeadSummary, generatePropertyMatch, generateAgentResponse, askClaude, isClientAvailable };
