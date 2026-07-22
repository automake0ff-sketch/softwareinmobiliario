import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';

async function logActivity(agencyId, leadId, userId, type, description, metadata = null) {
  await run(
    `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
     VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, @metadata, NOW())`,
    {
      id: uuidv4(), agency_id: agencyId, lead_id: leadId, user_id: userId,
      type, description, metadata: metadata ? JSON.stringify(metadata) : null,
    }
  );
}

export async function executeTool(toolName, toolInput, context) {
  const { agencyId, userId, leadId } = context || {};

  try {
    let result;

    switch (toolName) {

      case 'buscar_propiedades_compatibles': {
        let sql = "SELECT * FROM properties WHERE status = 'disponible'";
        const params = {};

        if (agencyId) { sql += ' AND agency_id = @aid'; params.aid = agencyId; }
        if (toolInput.budget_max) { sql += ' AND price <= @max_price'; params.max_price = Number(toolInput.budget_max); }
        if (toolInput.property_type) { sql += ' AND type = @type'; params.type = toolInput.property_type; }
        if (toolInput.city) { sql += ' AND (city LIKE @city OR zone LIKE @city)'; params.city = `%${toolInput.city}%`; }
        if (toolInput.bedrooms_min) { sql += ' AND bedrooms >= @beds'; params.beds = Number(toolInput.bedrooms_min); }
        if (toolInput.zones && toolInput.zones.length) {
          const zoneClauses = toolInput.zones.map((_, i) => `zone LIKE @zone${i} OR city LIKE @zone${i}`);
          sql += ` AND (${zoneClauses.join(' OR ')})`;
          toolInput.zones.forEach((z, i) => { params[`zone${i}`] = `%${z}%`; });
        }

        sql += ' ORDER BY created_at DESC LIMIT 10';
        result = await all(sql, params);
        break;
      }

      case 'crear_lead': {
        const id = uuidv4();
        if (!agencyId) throw new Error('Se requiere agency_id para crear un lead');

        await run(
          `INSERT INTO leads (id, agency_id, name, phone, email, budget, zone, property_interest, source, ia_score, ia_insight, ia_summary, created_at, updated_at)
           VALUES (@id, @aid, @name, @phone, @email, @budget, @zone, @pi, @source, @score, @insight, @summary, NOW(), NOW())`,
          {
            id,
            aid: agencyId,
            name: toolInput.name,
            phone: toolInput.phone,
            email: toolInput.email || null,
            budget: toolInput.budget || null,
            zone: toolInput.zone || null,
            pi: toolInput.property_interest || null,
            source: toolInput.source || 'manual',
            score: toolInput.ia_score || null,
            insight: toolInput.ia_insight || null,
            summary: toolInput.ia_summary || null,
          }
        );

        result = await get('SELECT * FROM leads WHERE id = @id', { id });
        logActivity(defaultAgencyId, id, userId, 'lead_created', `Lead ${toolInput.name} creado por IA`, { toolName, input: toolInput });
        break;
      }

      case 'detectar_duplicado': {
        const duplicates = [];
        if (toolInput.phone) {
          const byPhone = await all('SELECT id, name, phone, email, status, created_at FROM leads WHERE phone = @phone', { phone: toolInput.phone });
          duplicates.push(...byPhone);
        }
        if (toolInput.email) {
          const byEmail = await all('SELECT id, name, phone, email, status, created_at FROM leads WHERE email = @email', { email: toolInput.email });
          for (const e of byEmail) {
            if (!duplicates.find(d => d.id === e.id)) duplicates.push(e);
          }
        }
        result = { duplicate: duplicates.length > 0, matches: duplicates };
        break;
      }

      case 'enviar_whatsapp': {
        result = {
          sent: true,
          to: toolInput.phone,
          message: toolInput.message,
          timestamp: new Date().toISOString(),
          mock: true,
        };
        logActivity(agencyId, leadId, userId, 'whatsapp_sent', `WhatsApp enviado a ${toolInput.phone}`, { toolName, message: toolInput.message?.substring(0, 80) });
        break;
      }

      case 'obtener_leads_sin_asignar': {
        let sql = "SELECT id, name, phone, email, budget, zone, property_interest, status, ia_score, last_activity, created_at FROM leads WHERE assigned_to IS NULL";
        const params = {};

        if (toolInput.agency_id) { sql += ' AND agency_id = @aid'; params.aid = toolInput.agency_id; }
        if (toolInput.min_score) { sql += ' AND ia_score >= @min_score'; params.min_score = Number(toolInput.min_score); }
        sql += ' ORDER BY ia_score DESC NULLS LAST';
        if (toolInput.limit) { sql += ' LIMIT @lim'; params.lim = Number(toolInput.limit); }

        result = await all(sql, params);
        break;
      }

      case 'obtener_comerciales_disponibles': {
        const params = { aid: toolInput.agency_id || agencyId };
        let sql = `SELECT u.id, u.name, u.email, u.phone, u.role,
                   (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status NOT IN ('cerrado', 'reserva')) as active_leads
                   FROM users u WHERE u.role = 'comercial' AND u.active = true AND u.agency_id = @aid`;
        if (toolInput.office_id) { sql += ' AND u.office_id = @oid'; params.oid = toolInput.office_id; }
        sql += ' ORDER BY active_leads ASC';

        result = await all(sql, params);
        break;
      }

      case 'asignar_lead': {
        const lead = await get('SELECT * FROM leads WHERE id = @id', { id: toolInput.lead_id });
        if (!lead) { result = { error: 'Lead no encontrado' }; break; }

        const agent = await get('SELECT * FROM users WHERE id = @id', { id: toolInput.user_id });
        if (!agent) { result = { error: 'Usuario no encontrado' }; break; }

        await run("UPDATE leads SET assigned_to = @uid, updated_at = NOW() WHERE id = @lid", { uid: toolInput.user_id, lid: toolInput.lead_id });

        logActivity(lead.agency_id, toolInput.lead_id, userId || toolInput.user_id, 'lead_assigned',
          `Lead asignado a ${agent.name}${toolInput.reason ? ': ' + toolInput.reason : ''}`, { toolName, reason: toolInput.reason });

        result = await get('SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON l.assigned_to = u.id WHERE l.id = @id', { id: toolInput.lead_id });
        break;
      }

      case 'enviar_alerta_equipo': {
        const alertId = uuidv4();
        const targetUsers = toolInput.user_ids || await all(
          `SELECT id FROM users WHERE agency_id = @aid${toolInput.role ? " AND role = @role" : ""}`,
          { aid: toolInput.agency_id || agencyId, role: toolInput.role }
        ).map(u => u.id);

        for (const uid of targetUsers) {
          await run(
            `INSERT INTO notifications (id, agency_id, user_id, lead_id, title, body, type, created_at)
             VALUES (@id, @aid, @uid, @lid, @title, @body, 'alert', NOW())`,
            {
              id: uuidv4(), aid: toolInput.agency_id || agencyId, uid,
              lid: toolInput.lead_id || null,
              title: 'Alerta del Coordinador IA',
              body: toolInput.message,
            }
          );
        }

        result = { alertId, sentTo: targetUsers.length, message: toolInput.message };
        break;
      }

      case 'detectar_leads_bloqueados': {
        const threshold = toolInput.hours_threshold || 48;
        const stages = toolInput.pipeline_stages || ['nuevo', 'contactado', 'interesado'];
        const params = { aid: toolInput.agency_id || agencyId, threshold };
        const placeholders = stages.map((_, i) => `@stage${i}`);
        stages.forEach((s, i) => { params[`stage${i}`] = s; });

        result = await all(
          `SELECT id, name, phone, email, status, ia_score, last_activity, created_at
           FROM leads WHERE agency_id = @aid AND status IN (${placeholders.join(',')})
           AND (last_activity IS NULL OR last_activity < NOW() - (@threshold * INTERVAL '1 hour'))
           ORDER BY last_activity ASC NULLS FIRST`,
          params
        );
        break;
      }

      case 'consultar_disponibilidad_comercial': {
        const daysAhead = toolInput.days_ahead || 5;
        const duration = toolInput.duration_minutes || 60;
        const slots = [];

        const now = new Date();
        for (let d = 0; d < daysAhead; d++) {
          const date = new Date(now);
          date.setDate(date.getDate() + d);
          const dayName = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][date.getDay()];
          if (dayName === 'domingo' || dayName === 'sábado') continue;

          for (let h = 10; h < 19; h++) {
            slots.push({
              date: date.toISOString().split('T')[0],
              time: `${String(h).padStart(2, '0')}:00`,
              dayName,
              duration: `${duration} min`,
            });
          }
        }

        result = { userId: toolInput.user_id, availableSlots: slots, totalFound: slots.length };
        break;
      }

      case 'crear_visita': {
        const visitId = uuidv4();
        const visitData = {
          id: visitId,
          lead_id: toolInput.lead_id,
          property_id: toolInput.property_id || null,
          user_id: toolInput.user_id,
          scheduled_at: toolInput.scheduled_at,
          duration_minutes: toolInput.duration_minutes || 60,
          notes: toolInput.notes || null,
          status: 'pendiente',
          created_at: new Date().toISOString(),
        };

        await run(
          `INSERT INTO tasks (id, lead_id, assigned_to, title, description, due_date, created_at)
           VALUES (@id, @lid, @uid, @title, @desc, @due, NOW())`,
          {
            id: visitId, lid: toolInput.lead_id, uid: toolInput.user_id,
            title: 'Visita agendada por IA',
            desc: toolInput.notes || `Visita programada para ${toolInput.scheduled_at}`,
            due: toolInput.scheduled_at,
          }
        );

        await run("UPDATE leads SET status = 'visita_agendada', updated_at = NOW() WHERE id = @id", { id: toolInput.lead_id });

        logActivity(agencyId || toolInput.agency_id, toolInput.lead_id, toolInput.user_id, 'visita_creada',
          `Visita creada por IA para ${toolInput.scheduled_at}`, { toolName, visitData });

        result = visitData;
        break;
      }

      case 'reagendar_visita': {
        const existingTasks = await all(
          'SELECT * FROM tasks WHERE lead_id = @lid AND completed = false ORDER BY created_at DESC LIMIT 1',
          { lid: toolInput.lead_id }
        );

        if (existingTasks.length) {
          await run('UPDATE tasks SET completed = true WHERE id = @id', { id: existingTasks[0].id });
        }

        const newTaskId = uuidv4();
        await run(
          `INSERT INTO tasks (id, lead_id, title, description, due_date, created_at)
           VALUES (@id, @lid, @title, @desc, @due, NOW())`,
          {
            id: newTaskId, lid: toolInput.lead_id,
            title: 'Visita reprogramada',
            desc: toolInput.reason ? `Reprogramado: ${toolInput.reason}` : 'Visita reprogramada por IA',
            due: toolInput.new_scheduled_at,
          }
        );

        result = { taskId: newTaskId, rescheduled: true, newDate: toolInput.new_scheduled_at, reason: toolInput.reason || '' };
        break;
      }

      case 'obtener_comparables_zona': {
        const params = {
          zone: `%${toolInput.zone}%`,
          city: `%${toolInput.city}%`,
          type: toolInput.property_type,
        };
        let sql = `SELECT * FROM properties WHERE status IN ('disponible', 'vendido')
                   AND (zone LIKE @zone OR city LIKE @city) AND type = @type`;

        if (toolInput.m2_min) { sql += ' AND surface >= @m2min'; params.m2min = Number(toolInput.m2_min); }
        if (toolInput.m2_max) { sql += ' AND surface <= @m2max'; params.m2max = Number(toolInput.m2_max); }
        sql += ' ORDER BY created_at DESC';
        if (toolInput.limit) { sql += ' LIMIT @lim'; params.lim = Number(toolInput.limit); }

        result = await all(sql, params);
        break;
      }

      case 'calcular_precio_mercado': {
        const properties = await all(
          `SELECT price, surface, type FROM properties
           WHERE (zone LIKE @zone OR city LIKE @city)
           AND status IN ('disponible', 'vendido')
           AND price > 0 AND surface > 0
           ${toolInput.property_type ? "AND type = @type" : ""}`,
          {
            zone: `%${toolInput.zone}%`,
            city: `%${toolInput.city}%`,
            type: toolInput.property_type || '',
          }
        );

        if (!properties.length) {
          result = { zone: toolInput.zone, city: toolInput.city, avgPricePerM2: null, sampleSize: 0 };
          break;
        }

        const pricesPerM2 = properties.map(p => p.price / p.surface).filter(v => v > 0 && v < 50000);
        if (!pricesPerM2.length) {
          result = { zone: toolInput.zone, city: toolInput.city, avgPricePerM2: null, sampleSize: 0 };
          break;
        }

        const avg = pricesPerM2.reduce((a, b) => a + b, 0) / pricesPerM2.length;
        const sorted = [...pricesPerM2].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];

        result = {
          zone: toolInput.zone,
          city: toolInput.city,
          propertyType: toolInput.property_type || 'todos',
          avgPricePerM2: Math.round(avg),
          medianPricePerM2: Math.round(median),
          sampleSize: pricesPerM2.length,
          minPricePerM2: Math.round(sorted[0]),
          maxPricePerM2: Math.round(sorted[sorted.length - 1]),
        };
        break;
      }

      default:
        throw new Error(`Tool desconocida: ${toolName}`);
    }

    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
