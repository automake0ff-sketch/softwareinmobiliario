import { v4 as uuidv4 } from 'uuid';
import { get, run } from '../db/db.js';
import { callClaude } from './claude.js';
import { logActivity, logLeadAutomation } from './lead-automation.service.js';

const QUALIFIER_SYSTEM_PROMPT = `Eres un cualificador de leads inmobiliario experto. Analiza el lead y genera un JSON con:
- score: número 0-100
- level: "frio" | "templado" | "caliente"
- urgency: "baja" | "media" | "alta" | "inmediata"
- budget_detected: presupuesto detectado o null
- zone_preferred: zona preferida o null
- operation_type: "compra" | "alquiler" | null
- possible_objections: array de posibles objeciones
- next_best_action: string con la próxima mejor acción
- missing_questions: array de preguntas que faltan por hacer
- summary: resumen breve de 1-2 frases`;

export async function qualifyLead(lead, agencyId, userId) {
  const systemPrompt = QUALIFIER_SYSTEM_PROMPT;

  const leadInfo = `Nombre: ${lead.name || 'N/A'}
Email: ${lead.email || 'N/A'}
Teléfono: ${lead.phone || 'N/A'}
Estado: ${lead.status || 'N/A'}
Etapa pipeline: ${lead.pipeline_stage || 'N/A'}
Presupuesto: ${lead.budget || 'No especificado'}
Presupuesto máximo: ${lead.budget_max || 'No especificado'}
Zona(s): ${lead.zones || lead.zone || 'No especificada'}
Tipo propiedad: ${lead.property_interest || lead.property_type || 'No especificado'}
Operación: ${lead.operation_type || 'No especificada'}
Origen: ${lead.source || 'desconocido'}
Urgencia: ${lead.urgency || 'no especificada'}
Score actual: ${lead.ia_score || 0}
Última actividad: ${lead.last_activity || 'sin actividad'}
Insights previos: ${lead.ia_insights ? JSON.stringify(lead.ia_insights) : 'ninguno'}
Resumen: ${lead.ia_summary || 'ninguno'}`;

  const userMessage = `Cualifica al siguiente lead inmobiliario:\n\n${leadInfo}\n\nResponde solo JSON válido sin markdown.`;

  let result = {
    score: 50, level: 'templado', urgency: 'media',
    budget_detected: lead.budget || null,
    zone_preferred: lead.zone || null,
    operation_type: lead.operation_type || null,
    possible_objections: ['Precio', 'Ubicación', 'Financiación'],
    next_best_action: 'Contactar para conocer mejor sus necesidades',
    missing_questions: ['¿Cuál es tu presupuesto máximo?', '¿Tienes financiación pre-aprobada?', '¿Buscas para vivienda habitual o inversión?'],
    summary: `Lead ${lead.name} - ${lead.zone || 'zona no especificada'}`,
  };

  try {
    const raw = await callClaude(systemPrompt, userMessage);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    result = { ...result, ...parsed };
  } catch {}

  const score = Math.max(0, Math.min(100, result.score));
  const newStatus = score >= 80 ? 'interesado' : score >= 50 ? 'contactado' : lead.status;

  const insights = lead.ia_insights ? (() => { try { return JSON.parse(lead.ia_insights); } catch { return []; } })() : [];
  insights.push({
    date: new Date().toISOString(),
    score,
    level: result.level,
    urgency: result.urgency,
    next_action: result.next_best_action,
    summary: result.summary,
  });

  await run(
    `UPDATE leads SET ia_score = @score, ia_insights = @insights, ia_summary = @summary,
     status = @status, updated_at = NOW(), last_activity = NOW()
     WHERE id = @id`,
    {
      score, insights: JSON.stringify(insights.slice(-20)),
      summary: result.summary, status: newStatus, id: lead.id,
    }
  );

  logActivity(agencyId, lead.id, userId, 'ia_insight',
    `Cualificador IA: Score ${score}/100 (${result.level}). ${result.summary}`,
    { score, level: result.level, urgency: result.urgency, next_action: result.next_best_action }
  );

  logLeadAutomation({
    agencyId, leadId: lead.id, type: 'qualifier', status: 'completed',
    payload: { lead_id: lead.id },
    result,
  });

  if (score >= 80) {
    const taskId = uuidv4();
    await run(
      `INSERT INTO tasks (id, lead_id, assigned_to, title, description, due_date, completed, created_at)
       VALUES (@id, @lid, @uid, @title, @desc, @due, false, NOW())`,
      {
        id: taskId, lid: lead.id, uid: userId,
        title: 'Lead caliente - acción urgente',
        desc: `Lead ${lead.name} cualificado como caliente (${score}/100). ${result.next_best_action}`,
        due: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      }
    );
  }

  return result;
}
