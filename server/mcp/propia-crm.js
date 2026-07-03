import { MCPServer, calculateCompatibility, getMatchReasons, logActivity } from './framework.js';
import { all, get, run } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';

const server = new MCPServer('propia-crm', '1.0.0');

server
  .resource('crm://leads/hot', 'Leads calientes', 'Leads con score > 75 sin asignar', async (agencyId) => {
    return await all(
      `SELECT id, name, phone, email, budget, zone, property_interest, ia_score, status, last_activity, created_at
       FROM leads WHERE ia_score > 75 AND assigned_to IS NULL
       ${agencyId ? 'AND agency_id = @aid' : ''}
       ORDER BY ia_score DESC LIMIT 20`,
      agencyId ? { aid: agencyId } : {}
    );
  })
  .resource('crm://pipeline/overview', 'Vista del pipeline', 'Conteo de leads por etapa', async (agencyId) => {
    const rows = await all(
      `SELECT status, COUNT(*) as count FROM leads
       ${agencyId ? 'WHERE agency_id = @aid' : ''}
       GROUP BY status ORDER BY count DESC`,
      agencyId ? { aid: agencyId } : {}
    );
    const total = rows.reduce((s, r) => s + r.count, 0);
    return { stages: rows, total };
  })
  .resource('crm://properties/available', 'Propiedades disponibles', 'Listado de propiedades activas', async (agencyId) => {
    return await all(
      `SELECT id, title, description, price, type, city, zone, bedrooms, bathrooms, surface, status, created_at
       FROM properties WHERE status = 'disponible'
       ${agencyId ? 'AND agency_id = @aid' : ''}
       ORDER BY created_at DESC LIMIT 50`,
      agencyId ? { aid: agencyId } : {}
    );
  });

server
  .tool('get_lead_full_context', 'Obtiene todo el contexto de un lead: datos, conversaciones, actividades y propiedades', {
    type: 'object',
    properties: { lead_id: { type: 'string' } },
    required: ['lead_id'],
  }, async (args) => {
    const lead = await get('SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON l.assigned_to = u.id WHERE l.id = @id', { id: args.lead_id });
    if (!lead) throw new Error('Lead no encontrado');

    const messages = await all(
      'SELECT * FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = @lid) ORDER BY created_at DESC LIMIT 20',
      { lid: args.lead_id }
    );
    const activities = await all(
      'SELECT * FROM activities WHERE lead_id = @lid ORDER BY created_at DESC LIMIT 10',
      { lid: args.lead_id }
    );
    const matchings = await all(
      `SELECT m.*, p.title, p.price, p.type, p.zone, p.city, p.surface, p.bedrooms
       FROM matchings m JOIN properties p ON p.id = m.property_id
       WHERE m.lead_id = @lid ORDER BY m.score DESC LIMIT 5`,
      { lid: args.lead_id }
    );

    return { lead, messages, activities, matchings };
  })

  .tool('update_lead_score', 'Actualiza el score IA del lead', {
    type: 'object',
    properties: {
      lead_id: { type: 'string' },
      score: { type: 'number', minimum: 0, maximum: 100 },
      summary: { type: 'string' },
      insights: { type: 'array', items: { type: 'string' } },
    },
    required: ['lead_id', 'score'],
  }, async (args, context) => {
    const scoreLabel = args.score > 75 ? 'caliente' : args.score > 40 ? 'templado' : 'frio';
    await run(
      `UPDATE leads SET ia_score = @score, ia_insight = @label, ia_summary = @summary, updated_at = NOW() WHERE id = @id`,
      { score: args.score, label: scoreLabel, summary: args.summary || null, id: args.lead_id }
    );
    logActivity(context.agencyId, args.lead_id, context.userId, 'ia_action', `Score actualizado a ${args.score} (${scoreLabel})`);
    return { success: true, score: args.score, label: scoreLabel };
  })

  .tool('change_pipeline_stage', 'Mueve un lead a otra etapa del pipeline', {
    type: 'object',
    properties: {
      lead_id: { type: 'string' },
      new_stage: {
        type: 'string',
        enum: ['nuevo', 'contactado', 'interesado', 'visita_agendada', 'negociacion', 'reserva', 'cerrado', 'perdido'],
      },
      reason: { type: 'string' },
    },
    required: ['lead_id', 'new_stage'],
  }, async (args, context) => {
    const existing = await get('SELECT status FROM leads WHERE id = @id', { id: args.lead_id });
    if (!existing) throw new Error('Lead no encontrado');
    await run("UPDATE leads SET status = @status, updated_at = NOW() WHERE id = @id", { status: args.new_stage, id: args.lead_id });
    logActivity(context.agencyId, args.lead_id, context.userId, 'status_change',
      `Pipeline: ${existing.status} → ${args.new_stage}${args.reason ? ': ' + args.reason : ''}`);
    return { success: true, from: existing.status, to: args.new_stage };
  })

  .tool('match_properties_to_lead', 'Busca propiedades compatibles con el perfil del lead', {
    type: 'object',
    properties: {
      lead_id: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['lead_id'],
  }, async (args) => {
    const lead = await get('SELECT * FROM leads WHERE id = @id', { id: args.lead_id });
    if (!lead) throw new Error('Lead no encontrado');

    const properties = await all(
      `SELECT * FROM properties WHERE status = 'disponible'
       ${lead.agency_id ? 'AND agency_id = @aid' : ''}
       ${lead.budget ? 'AND price <= @budget' : ''}
       ${lead.zone ? 'AND (zone LIKE @zone OR city LIKE @zone)' : ''}
       ORDER BY created_at DESC LIMIT 20`,
      {
        aid: lead.agency_id,
        budget: (lead.budget || 999999999) * 1.2,
        zone: lead.zone ? `%${lead.zone}%` : '%',
      }
    );

    const scored = properties.map(p => ({
      ...p,
      compatibility_score: calculateCompatibility(lead, p),
      match_reasons: getMatchReasons(lead, p),
    })).sort((a, b) => b.compatibility_score - a.compatibility_score).slice(0, args.limit || 5);

    for (const p of scored) {
      const existing = await get('SELECT id FROM matchings WHERE lead_id = @lid AND property_id = @pid', { lid: args.lead_id, pid: p.id });
      if (!existing) {
        await run(
          `INSERT INTO matchings (id, lead_id, property_id, score, reason, created_at)
           VALUES (@id, @lid, @pid, @score, @reason, NOW())`,
          { id: uuidv4(), lid: args.lead_id, pid: p.id, score: p.compatibility_score, reason: p.match_reasons?.join(', ') || '' }
        );
      }
    }

    return scored;
  })

  .tool('log_activity', 'Registra una actividad en el timeline del lead', {
    type: 'object',
    properties: {
      lead_id: { type: 'string' },
      type: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      agent_type: { type: 'string' },
    },
    required: ['lead_id', 'type', 'title'],
  }, async (args, context) => {
    logActivity(context.agencyId, args.lead_id, context.userId, args.type, `${args.title}: ${args.description || ''}`, { agent_type: args.agent_type });
    return { success: true };
  });

export default server;
