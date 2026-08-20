import { all, get, run } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';
import { executeAction, triggerAutomations } from './automation-engine.js';

// ═══════════════════════════════════════════════════════
// Worker que hace realmente funcionar los disparadores por
// tiempo (no_response_hours, time_schedule). Antes de esto no existia
// NINGUN mecanismo que los evaluara: se podian crear automatizaciones con
// estos triggers (tanto desde el constructor manual como desde el
// constructor con IA), se guardaban como activas, y nunca se ejecutaban.
// ═══════════════════════════════════════════════════════

// Coincide un patron cron de 5 campos (minuto hora dia-mes mes dia-semana)
// contra una fecha dada. Soporta: numero exacto, '*', listas 'a,b,c' y
// rangos 'a-b'. Suficiente para los patrones sencillos que usa la app
// (ver seeds en server/index.js: '0 10 1 * *', '0 8 * * 1-5', '30 8 * * 1').
function cronFieldMatches(field, value) {
  if (field === '*') return true;
  return field.split(',').some((part) => {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return value >= start && value <= end;
    }
    return Number(part) === value;
  });
}

function cronMatches(cronExpr, date) {
  const parts = (cronExpr || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, dom, month, dow] = parts;
  return (
    cronFieldMatches(min, date.getMinutes()) &&
    cronFieldMatches(hour, date.getHours()) &&
    cronFieldMatches(dom, date.getDate()) &&
    cronFieldMatches(month, date.getMonth() + 1) &&
    cronFieldMatches(dow, date.getDay())
  );
}

async function checkNoResponseAutomations() {
  const automations = await all(
    `SELECT * FROM automations WHERE is_active = true AND trigger_type = 'no_response_hours'`
  );

  for (const auto of automations) {
    let triggerConfig = {};
    try { triggerConfig = JSON.parse(auto.trigger_config || '{}'); } catch { /* config invalida, usa defaults */ }
    const hours = Number(triggerConfig.hours) || 24;

    let candidates;
    try {
      candidates = await all(
        `SELECT id, last_activity FROM leads
         WHERE agency_id = @agency_id
           AND status != 'cerrado'
           AND last_activity IS NOT NULL
           AND last_activity <= NOW() - (@hours || ' hours')::interval`,
        { agency_id: auto.agency_id, hours: String(hours) }
      );
    } catch (e) {
      console.error(`[Schedule Worker] Error buscando leads sin respuesta (automatizacion ${auto.id}):`, e.message);
      continue;
    }

    for (const lead of candidates) {
      // Evitar re-disparar la misma automatizacion para el mismo lead en cada
      // pasada del worker mientras sigue sin responder: solo se dispara si
      // no hay ya un log de esta automatizacion posterior a la ultima
      // actividad del lead. En cuanto el lead vuelve a escribir,
      // last_activity avanza y el "cooldown" se reinicia solo.
      let alreadyRun = null;
      try {
        alreadyRun = await get(
          `SELECT id FROM automation_logs
           WHERE automation_id = @aid AND lead_id = @lid AND created_at > @since
           LIMIT 1`,
          { aid: auto.id, lid: lead.id, since: lead.last_activity }
        );
      } catch { /* automation_logs no listo aun, seguir sin dedup */ }
      if (alreadyRun) continue;

      try {
        await triggerAutomations({
          trigger_type: 'no_response_hours',
          lead_id: lead.id,
          agency_id: auto.agency_id,
          trigger_payload: {},
        });
      } catch (e) {
        console.error(`[Schedule Worker] Error ejecutando no_response_hours (automatizacion ${auto.id}, lead ${lead.id}):`, e.message);
      }
    }
  }
}

async function checkTimeScheduleAutomations() {
  const automations = await all(
    `SELECT * FROM automations WHERE is_active = true AND trigger_type = 'time_schedule'`
  );
  const now = new Date();

  for (const auto of automations) {
    let triggerConfig = {};
    try { triggerConfig = JSON.parse(auto.trigger_config || '{}'); } catch { continue; }
    if (!triggerConfig.cron || !cronMatches(triggerConfig.cron, now)) continue;

    // Evitar doble disparo dentro del mismo minuto (p.ej. si el worker se
    // reinicia justo cuando toca ejecutar)
    if (auto.last_run_at) {
      const lastRun = new Date(auto.last_run_at);
      if (Math.abs(now - lastRun) < 60 * 1000) continue;
    }

    // time_schedule es una automatizacion a nivel de agencia, no de un lead
    // concreto (informes periodicos, notificaciones al equipo...), asi que
    // no encaja con triggerAutomations (exige lead_id). Se ejecutan sus
    // acciones directamente con un contexto de agencia.
    let actions = [];
    try { actions = JSON.parse(auto.actions || '[]'); } catch { actions = []; }

    const agency = await get('SELECT name FROM agencies WHERE id = @id', { id: auto.agency_id });
    const agencyContext = { agency_id: auto.agency_id, agency_name: agency?.name };

    const actionResults = [];
    for (const action of actions) {
      try {
        const result = await executeAction(action, agencyContext, { agencyId: auto.agency_id });
        actionResults.push({ action_type: action.type, ...result });
      } catch (e) {
        actionResults.push({ action_type: action.type, success: false, result: e.message });
      }
    }

    await run(
      `UPDATE automations SET run_count = COALESCE(run_count, 0) + 1, last_run_at = NOW() WHERE id = @id`,
      { id: auto.id }
    );
    try {
      await run(
        `INSERT INTO automation_logs (id, automation_id, lead_id, agency_id, status, actions_executed, created_at)
         VALUES (@id, @automation_id, NULL, @agency_id, 'success', @actions_executed, NOW())`,
        { id: uuidv4(), automation_id: auto.id, agency_id: auto.agency_id, actions_executed: JSON.stringify(actionResults) }
      );
    } catch (e) {
      console.error('[Schedule Worker] No se pudo guardar log de time_schedule:', e.message);
    }
  }
}

export async function checkScheduledAutomations() {
  try {
    await checkNoResponseAutomations();
  } catch (e) {
    console.error('[Schedule Worker] Error en no_response_hours:', e.message);
  }
  try {
    await checkTimeScheduleAutomations();
  } catch (e) {
    console.error('[Schedule Worker] Error en time_schedule:', e.message);
  }
}

let workerIntervalId = null;

export function startAutomationScheduleWorker(intervalMs = 15 * 60 * 1000) {
  if (workerIntervalId) clearInterval(workerIntervalId);
  checkScheduledAutomations().catch((e) => console.error('[Schedule Worker] Unexpected error:', e.message));
  workerIntervalId = setInterval(
    () => checkScheduledAutomations().catch((e) => console.error('[Schedule Worker] Periodic error:', e.message)),
    intervalMs
  );
  console.log(`[Schedule Worker] Iniciado, comprobando cada ${Math.round(intervalMs / 60000)} minutos.`);
}

export function stopAutomationScheduleWorker() {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
}
