import { MCPServer, logActivity } from './framework.js';
import { all, get, run } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';

const server = new MCPServer('propia-calendar', '1.0.0');

server
  .resource('calendar://today/agenda', 'Agenda del día', 'Visitas y tareas programadas para hoy', async (agencyId) => {
    const visits = await all(
      `SELECT t.*, l.name AS lead_name, l.phone AS lead_phone, p.title AS property_title
       FROM tasks t
       JOIN leads l ON l.id = t.lead_id
       LEFT JOIN properties p ON p.id = t.property_id
       WHERE t.due_date >= DATE_TRUNC('day', NOW())
       AND t.due_date < DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
       AND t.completed = false
       ${agencyId ? 'AND l.agency_id = @aid' : ''}
       ORDER BY t.due_date ASC`,
      agencyId ? { aid: agencyId } : {}
    );
    return { date: new Date().toISOString().split('T')[0], visits, total: visits.length };
  })
  .resource('calendar://agents/availability', 'Disponibilidad de comerciales', 'Huecos libres de todos los comerciales', async (agencyId) => {
    const agents = await all(
      `SELECT u.id, u.name, u.email, u.phone,
              (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND completed = false AND due_date >= NOW()) as pending_tasks,
              (SELECT COUNT(*) FROM leads WHERE assigned_to = u.id AND status NOT IN ('cerrado', 'reserva')) as active_leads
       FROM users u WHERE u.role = 'comercial' AND u.active = true
       ${agencyId ? 'AND u.agency_id = @aid' : ''}
       ORDER BY active_leads ASC`,
      agencyId ? { aid: agencyId } : {}
    );
    return { date: new Date().toISOString().split('T')[0], agents };
  });

server
  .tool('get_free_slots', 'Obtiene huecos libres en el calendario de un comercial', {
    type: 'object',
    properties: {
      user_id: { type: 'string', description: 'ID del comercial' },
      days_ahead: { type: 'number', description: 'Días a futuro para buscar' },
      duration_minutes: { type: 'number', description: 'Duración de cada slot' },
    },
    required: ['user_id'],
  }, async (args) => {
    const user = await get('SELECT id, name FROM users WHERE id = @id', { id: args.user_id });
    if (!user) throw new Error('Usuario no encontrado');

    const daysAhead = args.days_ahead || 5;
    const duration = args.duration_minutes || 60;
    const slots = [];

    const existingTasks = await all(
      `SELECT due_date FROM tasks WHERE assigned_to = @uid AND completed = false AND due_date IS NOT NULL`,
      { uid: args.user_id }
    );
    const busyTimes = new Set(existingTasks.map(t => t.due_date?.substring(0, 16)));

    const now = new Date();
    for (let d = 0; d < daysAhead; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      const dayName = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][date.getDay()];
      if (dayName === 'domingo' || dayName === 'sábado') continue;

      for (let h = 10; h < 19; h++) {
        const slotDate = `${date.toISOString().split('T')[0]}T${String(h).padStart(2, '0')}:00`;
        if (!busyTimes.has(slotDate)) {
          slots.push({
            date: date.toISOString().split('T')[0],
            time: `${String(h).padStart(2, '0')}:00`,
            dayName,
            duration: `${duration} min`,
            datetime: slotDate,
          });
        }
      }
    }

    return { userId: args.user_id, userName: user.name, availableSlots: slots, totalFound: slots.length };
  })

  .tool('create_visit_event', 'Crea una visita en el CRM y asigna la tarea al comercial', {
    type: 'object',
    properties: {
      user_id: { type: 'string', description: 'ID del comercial' },
      lead_id: { type: 'string' },
      property_id: { type: 'string' },
      scheduled_at: { type: 'string', description: 'ISO 8601 datetime' },
      duration_minutes: { type: 'number' },
      notes: { type: 'string' },
    },
    required: ['user_id', 'lead_id', 'scheduled_at'],
  }, async (args, context) => {
    const lead = await get('SELECT * FROM leads WHERE id = @id', { id: args.lead_id });
    if (!lead) throw new Error('Lead no encontrado');
    const commercial = await get('SELECT name FROM users WHERE id = @id', { id: args.user_id });

    const taskId = uuidv4();
    await run(
      `INSERT INTO tasks (id, lead_id, assigned_to, title, description, due_date, created_at)
       VALUES (@id, @lid, @uid, @title, @desc, @due, NOW())`,
      {
        id: taskId, lid: args.lead_id, uid: args.user_id,
        title: 'Visita agendada',
        desc: args.notes || `Visita programada para ${args.scheduled_at}${args.property_id ? ' - propiedad: ' + args.property_id : ''}`,
        due: args.scheduled_at,
      }
    );

    await run("UPDATE leads SET status = 'visita_agendada', updated_at = NOW() WHERE id = @id", { id: args.lead_id });

    logActivity(context.agencyId, args.lead_id, args.user_id, 'visita_creada',
      `Visita creada para ${args.scheduled_at} con ${commercial?.name || 'comercial'}`, { taskId, scheduled_at: args.scheduled_at });

    const propertyTitle = args.property_id ? (await get('SELECT title FROM properties WHERE id = @id', { id: args.property_id }))?.title : null;

    return {
      success: true,
      taskId,
      leadName: lead.name,
      commercial: commercial?.name,
      propertyTitle,
      scheduledAt: args.scheduled_at,
      duration: args.duration_minutes || 60,
    };
  })

  .tool('cancel_event', 'Cancela una visita/tarea programada', {
    type: 'object',
    properties: {
      task_id: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['task_id'],
  }, async (args, context) => {
    const task = await get('SELECT * FROM tasks WHERE id = @id', { id: args.task_id });
    if (!task) throw new Error('Tarea no encontrada');

    await run('UPDATE tasks SET completed = true WHERE id = @id', { id: args.task_id });
    logActivity(context.agencyId, task.lead_id, context.userId, 'visita_cancelada',
      `Visita cancelada${args.reason ? ': ' + args.reason : ''}`, { taskId: args.task_id });

    return { success: true, taskId: args.task_id, cancelled: true, reason: args.reason || '' };
  })

  .tool('get_today_agenda', 'Obtiene la agenda del día para un comercial', {
    type: 'object',
    properties: {
      user_id: { type: 'string' },
    },
    required: ['user_id'],
  }, async (args) => {
    const tasks = await all(
      `SELECT t.*, l.name AS lead_name, l.phone AS lead_phone
       FROM tasks t
       JOIN leads l ON l.id = t.lead_id
       WHERE t.assigned_to = @uid AND t.completed = false
       AND t.due_date >= DATE_TRUNC('day', NOW())
       AND t.due_date < DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
       ORDER BY t.due_date ASC`,
      { uid: args.user_id }
    );

    return { userId: args.user_id, date: new Date().toISOString().split('T')[0], tasks, total: tasks.length };
  });

export default server;
