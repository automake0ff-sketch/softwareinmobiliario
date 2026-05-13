import { all, get } from '../db/db.js';
import { buildConversationContext } from './conversation-memory.js';

export function getLeadMemory(leadId) {
  const lead = get('SELECT * FROM leads WHERE id = @id', { id: leadId });
  if (!lead) return null;

  const activities = all(
    'SELECT * FROM activities WHERE lead_id = @lid ORDER BY created_at DESC LIMIT 50',
    { lid: leadId }
  );

  const matchings = all(
    'SELECT m.*, p.title, p.price, p.type, p.zone, p.city FROM matchings m JOIN properties p ON p.id = m.property_id WHERE m.lead_id = @lid ORDER BY m.created_at DESC',
    { lid: leadId }
  );

  const tasks = all(
    "SELECT * FROM tasks WHERE lead_id = @lid ORDER BY created_at DESC",
    { lid: leadId }
  );

  const conv = get('SELECT * FROM conversations WHERE lead_id = @lid ORDER BY created_at DESC LIMIT 1', { lid: leadId });
  let messages = [];
  try { messages = JSON.parse(conv?.messages || '[]'); } catch { messages = []; }

  const lastContactDate = lead.last_activity || lead.updated_at || lead.created_at;
  const daysSinceContact = lastContactDate
    ? Math.floor((Date.now() - new Date(lastContactDate).getTime()) / 86400000)
    : 999;

  const visitsDone = tasks.filter(t => t.title?.toLowerCase().includes('visita') && t.completed).length;

  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone || '',
    email: lead.email || '',
    operationType: lead.property_interest || 'no especificado',
    budgetMax: lead.budget,
    zones: lead.zone ? lead.zone.split(',').map(z => z.trim()) : [],
    propertyType: lead.property_interest || 'no especificado',
    urgency: (lead.ia_score || 0) >= 70 ? 'alta' : (lead.ia_score || 0) >= 40 ? 'media' : 'baja',

    summary: lead.ia_summary || 'Sin resumen disponible aún',
    insights: lead.ia_insight ? lead.ia_insight.split(';').map(s => s.trim()).filter(Boolean) : [],
    keyFacts: extractKeyFacts(activities),
    objections: extractObjections(activities),
    interests: matchings.filter(m => m.score >= 70).map(m => m.title || m.property_id),
    dislikes: [],

    pipelineStage: lead.status,
    score: lead.ia_score || 0,
    lastContactDays: daysSinceContact,
    visitsDone,
    propertiesSent: matchings.map(m => m.property_id),
    totalMessages: messages.length,
  };
}

function extractKeyFacts(activities) {
  return activities
    .filter(a => a.type === 'note_added' || a.type === 'ia_action' || a.type === 'ia_insight')
    .map(a => a.description)
    .filter(Boolean)
    .slice(0, 10);
}

function extractObjections(activities) {
  const objectionKeywords = ['objeción', 'objeción', 'caro', 'precio', 'pensar', 'duda', 'zona', 'vender', 'financiación', 'hipoteca'];
  return activities
    .filter(a => {
      const desc = (a.description || '').toLowerCase();
      return objectionKeywords.some(k => desc.includes(k));
    })
    .map(a => a.description)
    .slice(0, 5);
}

export function memoryToContext(memory) {
  if (!memory) return '## MEMORIA DEL LEAD: No disponible';

  return `
## MEMORIA DEL LEAD: ${memory.name}

**Perfil de búsqueda:**
- Tipo de operación: ${memory.operationType}
- Presupuesto: ${memory.budgetMax ? `${memory.budgetMax.toLocaleString('es-ES')}€` : 'no definido'}
- Zonas: ${memory.zones.length ? memory.zones.join(', ') : 'no definidas'}
- Tipo propiedad: ${memory.propertyType}
- Urgencia: ${memory.urgency}

**Estado actual:**
- Etapa: ${memory.pipelineStage}
- Score IA: ${memory.score}/100
- Último contacto: hace ${memory.lastContactDays} días
- Visitas realizadas: ${memory.visitsDone}
- Mensajes intercambiados: ${memory.totalMessages}

**Resumen IA acumulado:**
${memory.summary}

**Hechos clave conocidos:**
${memory.keyFacts.length ? memory.keyFacts.map(f => `- ${f}`).join('\n') : '- Sin hechos registrados aún'}

**Objeciones planteadas:**
${memory.objections.length ? memory.objections.map(o => `- ${o}`).join('\n') : '- Ninguna registrada'}

**Propiedades ya enviadas (NO recomendar de nuevo):**
${memory.propertiesSent.length ? memory.propertiesSent.join(', ') : '- Ninguna aún'}
`.trim();
}
