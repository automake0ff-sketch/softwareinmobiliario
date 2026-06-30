import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { getLeadMemory, memoryToContext } from './lead-memory.js';
import { buildConversationContext } from './conversation-memory.js';
import { askClaude, isClientAvailable } from '../services/claude.js';

export function updateLeadScore(leadId, scoreChange, reason) {
  const lead = get('SELECT * FROM leads WHERE id = @id', { id: leadId });
  if (!lead) return;

  const currentScore = lead.ia_score || 50;
  const newScore = Math.max(0, Math.min(100, currentScore + scoreChange));
  const label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio';

  run(
    `UPDATE leads SET ia_score = @score, ia_insight = @label, updated_at = NOW() WHERE id = @id`,
    { score: newScore, label, id: leadId }
  );

  if (reason) {
    run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @aid, @lid, @type, @desc, @meta, NOW())`,
      {
        id: uuidv4(), aid: lead.agency_id, lid: leadId,
        type: 'ia_action', desc: reason,
        meta: JSON.stringify({ scoreChange, newScore }),
      }
    );
  }

  return { score: newScore, label };
}

export function appendInsight(leadId, insight) {
  const lead = get('SELECT ia_insight FROM leads WHERE id = @id', { id: leadId });
  if (!lead) return;

  const existing = (lead.ia_insight || '').split(';').map(s => s.trim()).filter(Boolean);
  const updated = [...new Set([...existing, insight])].slice(-20).join('; ');

  run("UPDATE leads SET ia_insight = @insight, updated_at = NOW() WHERE id = @id", { insight: updated, id: leadId });
}

export async function regenerateSummary(leadId) {
  const memory = getLeadMemory(leadId);
  if (!memory) return null;

  const conversation = buildConversationContext(leadId, 20);

  if (isClientAvailable()) {
    try {
      const prompt = `Resume este lead inmobiliario en 2-3 frases para que un comercial entienda rápido quién es, qué busca y qué importa ahora mismo.

Perfil: ${JSON.stringify(memory)}

Últimas interacciones: ${conversation.slice(-5).map(m => m.content).join(' | ')}`;

      const text = await askClaude(
        'Eres un asistente que resume el perfil de leads inmobiliarios en UN párrafo conciso y útil para comerciales. Responde en español.',
        prompt
      );

      run("UPDATE leads SET ia_summary = @summary, updated_at = NOW() WHERE id = @id", { summary: text, id: leadId });
      return text;
    } catch (err) {
      console.warn('[MEMORY] Error regenerating summary:', err.message);
    }
  }

  const fallback = `${memory.name} busca ${memory.propertyType} en ${memory.zones.join(', ') || 'varias zonas'} con presupuesto de ${memory.budgetMax || 'sin definir'}. Score actual: ${memory.score}/100. ${memory.visitsDone > 0 ? `${memory.visitsDone} visita(s) realizada(s).` : 'Sin visitas aún.'} Último contacto: hace ${memory.lastContactDays} días.`;
  run("UPDATE leads SET ia_summary = @summary, updated_at = NOW() WHERE id = @id", { summary: fallback, id: leadId });
  return fallback;
}

export async function updateLeadMemory(leadId, agentType, analysis) {
  const lead = get('SELECT * FROM leads WHERE id = @id', { id: leadId });
  if (!lead) return;

  const updates = [];
  const params = { id: leadId };

  if (analysis.scoreChange) {
    const currentScore = lead.ia_score || 50;
    const newScore = Math.max(0, Math.min(100, currentScore + analysis.scoreChange));
    const label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio';
    updates.push('ia_score = @score');
    updates.push('ia_insight = @label');
    params.score = newScore;
    params.label = label;
  }

  if (analysis.newInsights?.length) {
    const existing = (lead.ia_insight || '').split(';').map(s => s.trim()).filter(Boolean);
    const merged = [...new Set([...existing, ...analysis.newInsights])].slice(-20);
    updates.push('ia_insight = @insight');
    params.insight = merged.join('; ');
  }

  if (analysis.shouldUpdateSummary) {
    const summary = await regenerateSummary(leadId);
    if (summary) {
      updates.push('ia_summary = @summary');
      params.summary = summary;
    }
  }

  updates.push("updated_at = NOW()");

  if (updates.length > 1) {
    run(`UPDATE leads SET ${updates.join(', ')} WHERE id = @id`, params);
  }

  if (analysis.reason) {
    run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @aid, @lid, @type, @desc, @meta, NOW())`,
      {
        id: uuidv4(), aid: lead.agency_id, lid: leadId,
        type: 'ia_action',
        desc: `[${agentType}] ${analysis.reason}`,
        meta: JSON.stringify({ scoreChange: analysis.scoreChange, hasInsights: !!analysis.newInsights?.length }),
      }
    );
  }

  return { updated: true };
}
