import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { all, get, run, transaction } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import {
  STALE_DAYS, GOALS, CHANNELS, OUTCOMES, TONES, ALERT_CLASSES, mergeSettings, classifyAlert, buildFacts, recommend, firstImage,
  daysBetween, scoreItem, defaultGoalForLead, normalizePhone, buildWhatsAppUrl,
  buildMessage, summarizeConversation, dueInDays, statusLabel,
} from '../services/followup-engine.js';
import { aiAvailable, consumeAiQuota, aiMessage, aiSummary } from '../services/followup-ai.js';

const router = Router();
router.use(auth);

const DEFAULT_TZ = 'Europe/Madrid';
const MAX_TEXT = 8000;

const uuid = z.string().uuid();
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha no válida');

const validate = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) return res.status(400).json({ error: r.error.issues[0]?.message || 'Datos no válidos', field: r.error.issues[0]?.path?.join('.') });
  req.body = r.data;
  next();
};

const fail = (res, e, msg) => {
  console.error(`[followup] ${msg}:`, e.message);
  res.status(500).json({ error: msg });
};

// ── Helpers ──────────────────────────────────────────────────────────────

const LAST_TOUCH_SQL = `COALESCE(NULLIF(l.last_contact_at::text,'')::timestamptz, NULLIF(l.last_activity::text,'')::timestamptz, l.created_at)`;

async function getLead(leadId, agencyId) {
  return get(
    `SELECT l.id, l.name, l.phone, l.email, l.status, l.budget, l.zone, l.property_interest, l.urgency, l.ia_score,
            l.assigned_to, l.whatsapp_opt_out, ${LAST_TOUCH_SQL} AS last_touch
     FROM leads l WHERE l.id = @id AND l.agency_id = @agency_id`,
    { id: leadId, agency_id: agencyId }
  );
}

async function getProperty(propertyId, agencyId) {
  if (!propertyId) return null;
  return get('SELECT id, title, zone, city FROM properties WHERE id = @id AND agency_id = @agency_id', { id: propertyId, agency_id: agencyId });
}

async function agencyInfo(agencyId) {
  const a = await get(
    `SELECT a.name, COALESCE((SELECT z.name FROM pg_timezone_names z WHERE z.name = a.timezone LIMIT 1), @def) AS timezone FROM agencies a WHERE a.id = @id`,
    { id: agencyId, def: DEFAULT_TZ }
  );
  return { name: a?.name || null, tz: a?.timezone || DEFAULT_TZ };
}

async function dayBounds(tz) {
  const q = `SELECT (date_trunc('day', NOW() AT TIME ZONE @tz) AT TIME ZONE @tz) AS day_start,
                    ((date_trunc('day', NOW() AT TIME ZONE @tz) + interval '1 day') AT TIME ZONE @tz) AS day_end,
                    ((date_trunc('day', NOW() AT TIME ZONE @tz) + interval '8 day') AT TIME ZONE @tz) AS week_end`;
  try { return await get(q, { tz }); } catch { return get(q, { tz: DEFAULT_TZ }); }
}

function leadView(r) {
  return {
    id: r.lead_id, name: r.name, phone: r.phone, email: r.email, status: r.status, status_label: statusLabel(r.status),
    ia_score: r.ia_score, budget: r.budget, zone: r.zone, assigned_to: r.assigned_to,
    whatsapp_opt_out: !!r.whatsapp_opt_out, has_whatsapp: !!normalizePhone(r.phone),
  };
}

// ── GET /today — la lista diaria ─────────────────────────────────────────

// Caché corta de la lista diaria: a primera hora todos abren la app a la vez; recalcular por cada petición es
// innecesario. TTL pequeño + invalidación al escribir + deduplicación de cálculos simultáneos.
const TODAY_TTL_MS = parseInt(process.env.FOLLOWUP_CACHE_MS || '5000', 10);
const todayCache = new Map(); // clave -> { at, value }
const todayInflight = new Map(); // clave -> Promise

export function invalidateToday(agencyId) {
  for (const k of todayCache.keys()) if (k.startsWith(`${agencyId}:`)) todayCache.delete(k);
}

async function cachedToday({ agencyId, uid, mine, fresh }) {
  const key = `${agencyId}:${mine ? uid : '*'}`;
  const hit = todayCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TODAY_TTL_MS) return hit.value;
  if (todayInflight.has(key)) return todayInflight.get(key);
  const p = computeToday({ agencyId, uid, mine })
    .then((value) => {
      if (todayCache.size > 500) todayCache.clear();
      todayCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => todayInflight.delete(key));
  todayInflight.set(key, p);
  return p;
}

const APPT_TS = `(CASE WHEN a.starts_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN a.starts_at::timestamptz END)`;
const OPEN = `NOT IN ('cerrado','perdido')`;

// Ajustes de reglas por agencia (con caché corta; se invalida al guardar)
const settingsCache = new Map();
export async function getSettings(agencyId) {
  const hit = settingsCache.get(agencyId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const row = await get('SELECT stale_days, inactive_days, visit_followup_days FROM followup_settings WHERE agency_id = @a', { a: agencyId });
  const value = mergeSettings(row || {});
  settingsCache.set(agencyId, { at: Date.now(), value });
  return value;
}
export const invalidateSettings = (agencyId) => settingsCache.delete(agencyId);

function staleSql(staleDays) {
  return '(' + Object.entries(staleDays)
    .map(([st, d]) => `(l.status = '${st}' AND ${LAST_TOUCH_SQL} <= NOW() - interval '${Number(d)} day')`)
    .join(' OR ') + ')';
}

/** Lista diaria de un usuario/agencia + KPIs + alertas. La usan la pantalla y el resumen por email. */
export async function computeToday({ agencyId, uid, mine = false }) {
  const now = new Date();
  const [{ tz }, settings] = await Promise.all([agencyInfo(agencyId), getSettings(agencyId)]);
  const b = await dayBounds(tz);
  const STALE = staleSql(settings.stale_days);
  const mineF = mine ? 'AND (f.assigned_to = @uid OR l.assigned_to = @uid OR f.created_by = @uid)' : '';
  const mineL = mine ? 'AND l.assigned_to = @uid' : '';
  const base = { agency_id: agencyId, uid };

  const [fRows, cntRow, upcomingRow, cRows, vRows, uRows, kpiRow, visitsPendingRow] = await Promise.all([
    all(
      `SELECT f.id AS followup_id, f.due_at, f.channel, f.goal, f.note, f.snooze_count, f.property_id,
              l.id AS lead_id, l.name, l.phone, l.email, l.status, l.ia_score, l.budget, l.zone, l.urgency, l.priority, l.client_type,
              l.whatsapp_opt_out, l.assigned_to, (l.last_contact_at IS NOT NULL) AS has_contact, ${LAST_TOUCH_SQL} AS last_touch,
              p.title AS property_title, p.images AS property_images
       FROM followups f
       JOIN leads l ON l.id = f.lead_id AND l.agency_id = f.agency_id
       LEFT JOIN properties p ON p.id = f.property_id
       WHERE f.agency_id = @agency_id AND f.status = 'pending' AND f.due_at < @day_end AND l.status ${OPEN} ${mineF}
       ORDER BY f.due_at ASC LIMIT 80`,
      { ...base, day_end: b.day_end }
    ),
    get(
      `SELECT COALESCE(SUM(CASE WHEN f.due_at < @day_start THEN 1 ELSE 0 END),0) AS overdue,
              COALESCE(SUM(CASE WHEN f.due_at >= @day_start THEN 1 ELSE 0 END),0) AS today
       FROM followups f JOIN leads l ON l.id = f.lead_id AND l.agency_id = f.agency_id
       WHERE f.agency_id = @agency_id AND f.status = 'pending' AND f.due_at < @day_end AND l.status ${OPEN} ${mineF}`,
      { ...base, day_start: b.day_start, day_end: b.day_end }
    ),
    get(
      `SELECT COUNT(*) AS n FROM followups f JOIN leads l ON l.id = f.lead_id
       WHERE f.agency_id = @agency_id AND f.status = 'pending' AND f.due_at >= @day_end AND f.due_at < @week_end AND l.status ${OPEN} ${mineF}`,
      { ...base, day_end: b.day_end, week_end: b.week_end }
    ),
    all(
      `SELECT l.id AS lead_id, l.name, l.phone, l.email, l.status, l.ia_score, l.budget, l.zone, l.urgency, l.priority, l.client_type,
              l.whatsapp_opt_out, l.assigned_to, (l.last_contact_at IS NOT NULL) AS has_contact, ${LAST_TOUCH_SQL} AS last_touch,
              pi.property_id, p.title AS property_title, p.images AS property_images, COUNT(*) OVER() AS total_count
       FROM leads l
       LEFT JOIN LATERAL (SELECT pi2.property_id FROM property_interests pi2 WHERE pi2.lead_id = l.id ORDER BY pi2.created_at DESC LIMIT 1) pi ON true
       LEFT JOIN properties p ON p.id = pi.property_id
       WHERE l.agency_id = @agency_id AND l.status ${OPEN}
         AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.lead_id = l.id AND f.status = 'pending')
         AND ${STALE} ${mineL}
       ORDER BY ${LAST_TOUCH_SQL} ASC LIMIT 100`,
      base
    ),
    // Visitas ya pasadas, sin ningún contacto posterior registrado ni seguimiento pendiente
    all(
      `SELECT a.id AS appt_id, ${APPT_TS} AS visit_at, a.property_id,
              l.id AS lead_id, l.name, l.phone, l.email, l.status, l.ia_score, l.budget, l.zone, l.urgency, l.priority, l.client_type,
              l.whatsapp_opt_out, l.assigned_to, (l.last_contact_at IS NOT NULL) AS has_contact, ${LAST_TOUCH_SQL} AS last_touch,
              p.title AS property_title, p.images AS property_images
       FROM appointments a
       JOIN leads l ON l.id = a.lead_id AND l.agency_id = a.agency_id
       LEFT JOIN properties p ON p.id = a.property_id
       WHERE a.agency_id = @agency_id AND a.status IN ('scheduled','confirmed','completed')
         AND ${APPT_TS} <= NOW() - (@vdays::int * interval '1 day') AND ${APPT_TS} >= NOW() - interval '21 days'
         AND l.status ${OPEN} ${mineL}
         AND NOT EXISTS (SELECT 1 FROM activities ac WHERE ac.lead_id = l.id AND ac.type IN ('contact','summary') AND NULLIF(ac.created_at::text,'')::timestamptz > ${APPT_TS})
         AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.lead_id = l.id AND f.status = 'pending')
       ORDER BY visit_at ASC LIMIT 40`,
      { ...base, vdays: settings.visit_followup_days }
    ),
    // Visitas en las próximas 48 h que el cliente aún no ha confirmado
    all(
      `SELECT a.id AS appt_id, ${APPT_TS} AS visit_at, a.property_id,
              l.id AS lead_id, l.name, l.phone, l.email, l.status, l.ia_score, l.budget, l.zone, l.urgency, l.priority, l.client_type,
              l.whatsapp_opt_out, l.assigned_to, (l.last_contact_at IS NOT NULL) AS has_contact, ${LAST_TOUCH_SQL} AS last_touch,
              p.title AS property_title, p.images AS property_images
       FROM appointments a
       JOIN leads l ON l.id = a.lead_id AND l.agency_id = a.agency_id
       LEFT JOIN properties p ON p.id = a.property_id
       WHERE a.agency_id = @agency_id AND a.status = 'scheduled'
         AND ${APPT_TS} >= NOW() AND ${APPT_TS} <= NOW() + interval '48 hours' AND l.status ${OPEN} ${mineL}
       ORDER BY visit_at ASC LIMIT 20`,
      base
    ),
    get(
      `SELECT COUNT(*) FILTER (WHERE l.status ${OPEN}) AS active,
              COUNT(*) FILTER (WHERE l.created_at >= NOW() - interval '7 days') AS new_week,
              COUNT(*) FILTER (WHERE l.status = 'nuevo' AND l.last_contact_at IS NULL) AS to_contact,
              COUNT(*) FILTER (WHERE l.status ${OPEN} AND ${LAST_TOUCH_SQL} <= NOW() - (@inactive::int * interval '1 day')) AS inactive
       FROM leads l WHERE l.agency_id = @agency_id ${mineL}`,
      { ...base, inactive: settings.inactive_days }
    ),
    get(
      `SELECT COUNT(*) AS n FROM appointments a JOIN leads l ON l.id = a.lead_id AND l.agency_id = a.agency_id
       WHERE a.agency_id = @agency_id AND a.status IN ('scheduled','confirmed','reschedule_requested')
         AND ${APPT_TS} >= NOW() AND l.status ${OPEN} ${mineL}`,
      base
    ),
  ]);

  const abandonedTotal = Number(cRows[0]?.total_count || 0);
  const shownAband = cRows.slice(0, 30);
  const allRows = [...fRows, ...shownAband, ...vRows, ...uRows];
  const ids = [...new Set(allRows.map((r) => r.lead_id))];
  const lastMap = new Map();
  if (ids.length) {
    const acts = await all(
      `SELECT DISTINCT ON (a.lead_id) a.lead_id, a.type, a.description, a.created_at
       FROM activities a
       WHERE a.agency_id = @agency_id AND a.lead_id = ANY(@ids::uuid[]) AND a.type IN ('contact','summary','note')
       ORDER BY a.lead_id, a.created_at DESC`,
      { agency_id: agencyId, ids }
    );
    acts.forEach((a) => lastMap.set(a.lead_id, { type: a.type, description: String(a.description || '').slice(0, 160), at: a.created_at }));
  }

  const build = (r, kind) => {
    const dsc = daysBetween(r.last_touch, now);
    let daysOverdue = 0;
    if (kind === 'followup' && new Date(r.due_at) < new Date(b.day_start)) daysOverdue = Math.ceil((new Date(b.day_start).getTime() - new Date(r.due_at).getTime()) / 86400000);
    const property = r.property_id ? { id: r.property_id, title: r.property_title, photo: firstImage(r.property_images) } : null;
    const { priority, reasons } = scoreItem({ lead: r, daysSinceContact: dsc, daysOverdue, snoozeCount: r.snooze_count || 0, kind });
    const { alert_class, rule } = classifyAlert({ kind, lead: r, daysOverdue, daysSinceContact: dsc ?? 0, settings });
    const facts = buildFacts({ kind, lead: { ...r, status: r.status }, property, daysSinceContact: dsc, daysOverdue, visitAt: r.visit_at, hasLastContact: !!r.has_contact });
    const recommendation = recommend({ kind, lead: r, rule });
    return {
      kind,
      followup_id: r.followup_id || null,
      appointment_id: r.appt_id || null,
      visit_at: r.visit_at || null,
      lead: { ...leadView(r), priority: r.priority || 'media', client_type: r.client_type || null },
      property,
      due_at: r.due_at || null,
      channel: r.channel || (r.phone ? 'whatsapp' : 'call'),
      goal: r.goal || recommendation.goal || defaultGoalForLead(r, dsc),
      note: r.note || null,
      days_overdue: daysOverdue,
      days_since_contact: dsc,
      priority,
      reasons,
      alert_class,
      rule,
      facts,
      recommendation,
      last_interaction: lastMap.get(r.lead_id) || null,
    };
  };

  const followupItems = fRows.map((r) => build(r, 'followup'));
  const byPriority = (a, c) => c.priority - a.priority;
  const overdue = followupItems.filter((i) => new Date(i.due_at) < new Date(b.day_start)).sort(byPriority);
  const today = followupItems.filter((i) => new Date(i.due_at) >= new Date(b.day_start)).sort(byPriority);
  const abandoned = shownAband.map((r) => build(r, 'abandoned')).sort(byPriority);
  const visitsNoFollowup = vRows.map((r) => build(r, 'visit_no_followup')).sort(byPriority);
  const visitsUnconfirmed = uRows.map((r) => build(r, 'visit_unconfirmed'));

  const everything = [...overdue, ...today, ...abandoned, ...visitsNoFollowup, ...visitsUnconfirmed];
  const byClass = Object.fromEntries(Object.keys(ALERT_CLASSES).map((k) => [k, everything.filter((i) => i.alert_class === k).length]));
  const nOverdue = Number(cntRow?.overdue || 0);
  const nToday = Number(cntRow?.today || 0);

  return {
    generated_at: now.toISOString(),
    summary: {
      overdue: nOverdue,
      today: nToday,
      abandoned: abandonedTotal,
      upcoming_week: Number(upcomingRow?.n || 0),
      visits_no_followup: visitsNoFollowup.length,
      visits_unconfirmed: visitsUnconfirmed.length,
      attention_total: nOverdue + nToday + abandonedTotal + visitsNoFollowup.length,
    },
    kpis: {
      active_contacts: Number(kpiRow?.active || 0),
      new_week: Number(kpiRow?.new_week || 0),
      to_contact: Number(kpiRow?.to_contact || 0),
      overdue: nOverdue,
      today: nToday,
      visits_pending: Number(visitsPendingRow?.n || 0),
      visits_no_followup: visitsNoFollowup.length,
      inactive: Number(kpiRow?.inactive || 0),
      priority_opportunities: byClass.inmediata,
    },
    alert_counts: byClass,
    settings,
    overdue, today, abandoned,
    visits_no_followup: visitsNoFollowup,
    visits_unconfirmed: visitsUnconfirmed,
    abandoned_hidden: Math.max(0, abandonedTotal - shownAband.length),
    truncated: nOverdue + nToday > fRows.length || abandonedTotal > shownAband.length,
    ai_available: aiAvailable(),
  };
}

router.get('/today', async (req, res) => {
  try {
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    const fresh = req.query.fresh === '1';
    res.json(await cachedToday({ agencyId: req.user.agency_id, uid: req.user.id, mine, fresh }));
  } catch (e) { fail(res, e, 'No se pudo cargar el seguimiento de hoy.'); }
});

// ── Resumen diario por email: leer / activar / desactivar ──────────────
router.get('/digest', async (req, res) => {
  try {
    const u = await get('SELECT followup_digest FROM users WHERE id = @id AND agency_id = @a', { id: req.user.id, a: req.user.agency_id });
    res.json({ enabled: u ? u.followup_digest !== false : true, delivery_configured: !!process.env.SENDGRID_API_KEY });
  } catch (e) { fail(res, e, 'No se pudo leer el ajuste.'); }
});
router.put('/digest', validate(z.object({ enabled: z.boolean() })), async (req, res) => {
  try {
    await run('UPDATE users SET followup_digest = @e WHERE id = @id AND agency_id = @a', { e: req.body.enabled, id: req.user.id, a: req.user.agency_id });
    res.json({ enabled: req.body.enabled });
  } catch (e) { fail(res, e, 'No se pudo guardar el ajuste.'); }
});

// ── GET /leads/search?q= — buscador ligero para los formularios ─────────

router.get('/leads/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    const rows = await all(
      `SELECT id, name, phone, status FROM leads
       WHERE agency_id = @agency_id AND status NOT IN ('cerrado','perdido')
         ${q ? 'AND (name ILIKE @q OR phone ILIKE @q OR email ILIKE @q)' : ''}
       ORDER BY updated_at DESC LIMIT 8`,
      { agency_id: req.user.agency_id, q: `%${q}%` }
    );
    res.json(rows);
  } catch (e) { fail(res, e, 'No se pudo buscar.'); }
});

// ── GET /leads/:id — ficha corta + línea de tiempo ─────────────────────

router.get('/leads/:id', async (req, res) => {
  try {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Identificador no válido.' });
    const lead = await getLead(req.params.id, req.user.agency_id);
    if (!lead) return res.status(404).json({ error: 'Contacto no encontrado.' });
    const timeline = await all(
      `SELECT id, type, description, metadata, created_at FROM activities
       WHERE agency_id = @agency_id AND lead_id = @id AND type IN ('contact','summary','note')
       ORDER BY created_at DESC LIMIT 30`,
      { agency_id: req.user.agency_id, id: lead.id }
    );
    const pending = await all(
      `SELECT f.id, f.due_at, f.channel, f.goal, f.note, f.snooze_count, p.title AS property_title
       FROM followups f LEFT JOIN properties p ON p.id = f.property_id
       WHERE f.agency_id = @agency_id AND f.lead_id = @id AND f.status = 'pending' ORDER BY f.due_at`,
      { agency_id: req.user.agency_id, id: lead.id }
    );
    const meta = await get('SELECT priority, client_type, budget, zone, property_interest FROM leads WHERE id = @id AND agency_id = @a', { id: lead.id, a: req.user.agency_id });
    const appts = await all(
      `SELECT a.id, a.status, a.type, a.location, ${APPT_TS} AS starts_at, p.title AS property_title
       FROM appointments a LEFT JOIN properties p ON p.id = a.property_id
       WHERE a.agency_id = @a AND a.lead_id = @id ORDER BY ${APPT_TS} DESC NULLS LAST LIMIT 6`,
      { a: req.user.agency_id, id: lead.id }
    );
    res.json({
      lead: { ...lead, ...meta, priority: meta?.priority || 'media', status_label: statusLabel(lead.status), has_whatsapp: !!normalizePhone(lead.phone), whatsapp_opt_out: !!lead.whatsapp_opt_out },
      timeline: timeline.map((t) => ({ ...t, metadata: safeJson(t.metadata) })),
      pending_followups: pending,
      appointments: appts,
    });
  } catch (e) { fail(res, e, 'No se pudo cargar el contacto.'); }
});

function safeJson(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

// ── POST /leads/:id/log — registrar un contacto (+ siguiente paso) ──────

const nextSchema = z.object({
  in_days: z.number().int().min(0).max(365).optional(),
  due_at: isoDate.optional(),
  channel: z.enum(CHANNELS).optional(),
  goal: z.enum(Object.keys(GOALS)).optional(),
  note: z.string().max(500).optional(),
}).refine((n) => n.in_days != null || n.due_at, 'Indica cuándo es el siguiente seguimiento.');

const logSchema = z.object({
  channel: z.enum(CHANNELS).default('whatsapp'),
  outcome: z.enum(OUTCOMES).default('other'),
  note: z.string().max(2000).optional().default(''),
  followup_id: uuid.optional(),
  property_id: uuid.optional(),
  next: nextSchema.nullable().optional(),
});

const OUTCOME_LABEL = {
  answered: 'Habló con el cliente', no_answer: 'No contestó', interested: 'Mostró interés',
  not_interested: 'No le interesa', visit_scheduled: 'Visita acordada', other: 'Contacto realizado',
};
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', call: 'Llamada', email: 'Email', visit: 'Visita', other: 'Contacto' };

function statusAfter(status, outcome) {
  if (outcome === 'visit_scheduled' && ['nuevo', 'contactado', 'interesado'].includes(status)) return 'visita_agendada';
  if (outcome === 'interested' && ['nuevo', 'contactado'].includes(status)) return 'interesado';
  if (status === 'nuevo' && outcome !== 'no_answer') return 'contactado';
  return status;
}

router.post('/leads/:id/log', validate(logSchema), async (req, res) => {
  try {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Identificador no válido.' });
    const agencyId = req.user.agency_id;
    const lead = await getLead(req.params.id, agencyId);
    if (!lead) return res.status(404).json({ error: 'Contacto no encontrado.' });
    const { channel, outcome, note, followup_id, property_id, next } = req.body;
    if (property_id && !(await getProperty(property_id, agencyId))) return res.status(404).json({ error: 'Inmueble no encontrado.' });

    const newStatus = statusAfter(lead.status, outcome);
    const description = `${CHANNEL_LABEL[channel]} · ${OUTCOME_LABEL[outcome]}${note ? `: ${note}` : ''}`;
    let createdFollowup = null;

    await transaction(async (tx) => {
      await tx.run(
        `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
         VALUES (@id, @agency_id, @lead_id, @user_id, 'contact', @description, @metadata, NOW())`,
        { id: uuidv4(), agency_id: agencyId, lead_id: lead.id, user_id: req.user.id, description, metadata: JSON.stringify({ channel, outcome, followup_id: followup_id || null, property_id: property_id || null }) }
      );
      await tx.run(
        `UPDATE leads SET last_contact_at = NOW(), last_activity = NOW(), updated_at = NOW(), last_channel = @channel,
           pipeline_stage = CASE WHEN @status <> status AND (pipeline_stage IS NULL OR pipeline_stage = status) THEN @status ELSE pipeline_stage END,
           pipeline_stage_updated_at = CASE WHEN @status <> status THEN NOW() ELSE pipeline_stage_updated_at END,
           status = @status
         WHERE id = @id AND agency_id = @agency_id`,
        { id: lead.id, agency_id: agencyId, status: newStatus, channel }
      );
      if (followup_id) {
        await tx.run(
          `UPDATE followups SET status = 'done', completed_at = NOW(), updated_at = NOW()
           WHERE id = @fid AND agency_id = @agency_id AND lead_id = @lid AND status = 'pending'`,
          { fid: followup_id, agency_id: agencyId, lid: lead.id }
        );
      }
      if (next) {
        // El nuevo paso sustituye a los pendientes ya vencidos de este contacto (evita duplicados)
        await tx.run(
          `UPDATE followups SET status = 'cancelled', updated_at = NOW()
           WHERE agency_id = @agency_id AND lead_id = @lid AND status = 'pending' AND due_at <= NOW() + interval '1 day'`,
          { agency_id: agencyId, lid: lead.id }
        );
        const due = next.due_at ? new Date(next.due_at) : dueInDays(next.in_days);
        const fid = uuidv4();
        await tx.run(
          `INSERT INTO followups (id, agency_id, lead_id, property_id, assigned_to, due_at, channel, goal, note, created_by)
           VALUES (@id, @agency_id, @lead_id, @property_id, @assigned_to, @due_at, @channel, @goal, @note, @created_by)`,
          { id: fid, agency_id: agencyId, lead_id: lead.id, property_id: property_id || null, assigned_to: lead.assigned_to || req.user.id, due_at: due.toISOString(), channel: next.channel || channel, goal: next.goal || null, note: next.note || null, created_by: req.user.id }
        );
        createdFollowup = { id: fid, due_at: due.toISOString() };
      }
    });

    invalidateToday(agencyId);
    res.status(201).json({ ok: true, status: newStatus, status_changed: newStatus !== lead.status, next_followup: createdFollowup, suggest_close: outcome === 'not_interested' });
  } catch (e) { fail(res, e, 'No se pudo registrar el contacto.'); }
});

// ── Seguimientos: crear / actualizar ──────────────────────────────────

const createSchema = z.object({
  lead_id: uuid,
  property_id: uuid.optional(),
  in_days: z.number().int().min(0).max(365).optional(),
  due_at: isoDate.optional(),
  channel: z.enum(CHANNELS).default('whatsapp'),
  goal: z.enum(Object.keys(GOALS)).optional(),
  note: z.string().max(500).optional(),
}).refine((d) => d.in_days != null || d.due_at, { message: 'Indica cuándo es el seguimiento.', path: ['due_at'] });

router.post('/followups', validate(createSchema), async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    const d = req.body;
    const lead = await getLead(d.lead_id, agencyId);
    if (!lead) return res.status(404).json({ error: 'Contacto no encontrado.' });
    if (d.property_id && !(await getProperty(d.property_id, agencyId))) return res.status(404).json({ error: 'Inmueble no encontrado.' });
    const due = d.due_at ? new Date(d.due_at) : dueInDays(d.in_days);
    const id = uuidv4();
    await run(
      `INSERT INTO followups (id, agency_id, lead_id, property_id, assigned_to, due_at, channel, goal, note, created_by)
       VALUES (@id, @agency_id, @lead_id, @property_id, @assigned_to, @due_at, @channel, @goal, @note, @created_by)`,
      { id, agency_id: agencyId, lead_id: lead.id, property_id: d.property_id || null, assigned_to: lead.assigned_to || req.user.id, due_at: due.toISOString(), channel: d.channel, goal: d.goal || null, note: d.note || null, created_by: req.user.id }
    );
    invalidateToday(agencyId);
    res.status(201).json({ id, due_at: due.toISOString() });
  } catch (e) { fail(res, e, 'No se pudo crear el seguimiento.'); }
});

const patchSchema = z.object({
  action: z.enum(['done', 'snooze', 'reschedule', 'cancel']),
  days: z.number().int().min(0).max(365).optional(),
  due_at: isoDate.optional(),
});

router.patch('/followups/:id', validate(patchSchema), async (req, res) => {
  try {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Identificador no válido.' });
    const agencyId = req.user.agency_id;
    const f = await get(`SELECT id, status FROM followups WHERE id = @id AND agency_id = @agency_id`, { id: req.params.id, agency_id: agencyId });
    if (!f) return res.status(404).json({ error: 'Seguimiento no encontrado.' });
    if (f.status !== 'pending') return res.status(409).json({ error: 'Este seguimiento ya no está pendiente.' });
    const { action, days, due_at } = req.body;

    if (action === 'done' || action === 'cancel') {
      await run(`UPDATE followups SET status = @st, completed_at = ${action === 'done' ? 'NOW()' : 'NULL'}, updated_at = NOW() WHERE id = @id AND agency_id = @agency_id`,
        { st: action === 'done' ? 'done' : 'cancelled', id: f.id, agency_id: agencyId });
      invalidateToday(agencyId);
      return res.json({ ok: true });
    }
    const due = due_at ? new Date(due_at) : dueInDays(days ?? 1);
    await run(`UPDATE followups SET due_at = @due, snooze_count = snooze_count + @inc, updated_at = NOW() WHERE id = @id AND agency_id = @agency_id`,
      { due: due.toISOString(), inc: action === 'snooze' ? 1 : 0, id: f.id, agency_id: agencyId });
    invalidateToday(agencyId);
    res.json({ ok: true, due_at: due.toISOString() });
  } catch (e) { fail(res, e, 'No se pudo actualizar el seguimiento.'); }
});

// ── POST /ai/message — borrador de mensaje (IA opcional, plantillas de respaldo) ──

const messageSchema = z.object({
  lead_id: uuid,
  goal: z.enum(Object.keys(GOALS)).optional(),
  tone: z.enum(TONES).default('cercano'),
  channel: z.enum(['whatsapp', 'email']).default('whatsapp'),
  property_id: uuid.optional(),
  variant: z.number().int().min(0).max(50).default(0),
  use_ai: z.boolean().default(false),
});

router.post('/ai/message', validate(messageSchema), async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    const d = req.body;
    const lead = await getLead(d.lead_id, agencyId);
    if (!lead) return res.status(404).json({ error: 'Contacto no encontrado.' });

    let property = await getProperty(d.property_id, agencyId);
    if (!property) {
      property = await get(
        `SELECT p.id, p.title, p.zone, p.city FROM property_interests pi JOIN properties p ON p.id = pi.property_id
         WHERE pi.lead_id = @lid AND pi.agency_id = @agency_id ORDER BY pi.created_at DESC LIMIT 1`,
        { lid: lead.id, agency_id: agencyId }
      );
    }
    const [agency, me] = await Promise.all([agencyInfo(agencyId), get('SELECT name FROM users WHERE id = @id', { id: req.user.id })]);
    const dsc = daysBetween(lead.last_touch);
    const goal = d.goal || defaultGoalForLead(lead, dsc);
    const base = buildMessage(lead, { goal, tone: d.tone, channel: d.channel, variant: d.variant, property: property && { title: property.title, zone: property.zone || property.city }, agentName: me?.name, agencyName: agency.name });

    let out = { message: base.message, subject: base.subject, source: 'template' };
    const warnings = [];
    if (d.use_ai) {
      if (!aiAvailable()) warnings.push('La IA no está activada en este servidor: se usa una plantilla.');
      else if (!consumeAiQuota(agencyId)) warnings.push('Has alcanzado el límite de mensajes con IA por hora: se usa una plantilla.');
      else {
        try {
          const last = await get(`SELECT description FROM activities WHERE agency_id = @a AND lead_id = @l AND type IN ('contact','summary') ORDER BY created_at DESC LIMIT 1`, { a: agencyId, l: lead.id });
          const ai = await aiMessage({ lead, property, goalLabel: GOALS[goal], tone: d.tone, channel: d.channel, agentName: me?.name, agencyName: agency.name, context: last?.description });
          out = { message: ai.message, subject: d.channel === 'email' ? (ai.subject || base.subject) : null, source: 'ai' };
        } catch (e) {
          console.error('[followup] IA no disponible, uso plantilla:', e.message);
          warnings.push('La IA no respondió: se usa una plantilla.');
        }
      }
    }

    if (lead.whatsapp_opt_out && d.channel === 'whatsapp') warnings.push('Este contacto pidió no recibir WhatsApp. Usa llamada o email.');
    if (d.channel === 'whatsapp' && !normalizePhone(lead.phone)) warnings.push('No hay un teléfono válido para WhatsApp.');

    res.json({
      ...out, goal, goal_label: GOALS[goal], tone: d.tone, channel: d.channel, variant: base.variant, variants: base.variants,
      wa_phone: lead.whatsapp_opt_out ? null : normalizePhone(lead.phone),
      wa_url: lead.whatsapp_opt_out ? null : buildWhatsAppUrl(lead.phone, out.message),
      warnings,
      ai_available: aiAvailable(),
    });
  } catch (e) { fail(res, e, 'No se pudo generar el mensaje.'); }
});

// ── POST /ai/summarize — resume una conversación pegada ────────────────

const summarizeSchema = z.object({
  text: z.string().trim().min(20, 'Pega al menos unas líneas de la conversación.').max(MAX_TEXT, `Máximo ${MAX_TEXT} caracteres.`),
  lead_id: uuid.optional(),
  use_ai: z.boolean().default(false),
  save: z.boolean().default(false),
  create_followup: z.boolean().default(false),
});

router.post('/ai/summarize', validate(summarizeSchema), async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    const d = req.body;
    const lead = d.lead_id ? await getLead(d.lead_id, agencyId) : null;
    if (d.lead_id && !lead) return res.status(404).json({ error: 'Contacto no encontrado.' });
    if ((d.save || d.create_followup) && !lead) return res.status(400).json({ error: 'Elige un contacto para guardar el resumen.' });

    const basic = summarizeConversation(d.text, { leadName: lead?.name || null });
    let result = basic;
    const warnings = [];
    if (d.use_ai) {
      if (!aiAvailable()) warnings.push('La IA no está activada en este servidor: se usa el resumen básico.');
      else if (!consumeAiQuota(agencyId)) warnings.push('Has alcanzado el límite de IA por hora: se usa el resumen básico.');
      else {
        try {
          const ai = await aiSummary({ text: d.text, leadName: lead?.name });
          result = {
            summary: ai.summary, next_steps: ai.next_steps,
            suggested_followup: { due_at: dueInDays(ai.suggested_days).toISOString(), channel: 'whatsapp', goal: ai.suggested_goal, reason: ai.reason },
            signals: { ...basic.signals, interest: ai.interest, objections: ai.objections },
            source: 'ai',
          };
        } catch (e) {
          console.error('[followup] IA no disponible, uso resumen básico:', e.message);
          warnings.push('La IA no respondió: se usa el resumen básico.');
        }
      }
    }

    let saved = false;
    let followupId = null;
    if (lead && (d.save || d.create_followup)) {
      await transaction(async (tx) => {
        if (d.save) {
          await tx.run(
            `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
             VALUES (@id, @agency_id, @lead_id, @user_id, 'summary', @description, @metadata, NOW())`,
            { id: uuidv4(), agency_id: agencyId, lead_id: lead.id, user_id: req.user.id, description: `Resumen: ${result.summary}`.slice(0, 1500), metadata: JSON.stringify({ next_steps: result.next_steps, source: result.source }) }
          );
          saved = true;
        }
        if (d.create_followup) {
          followupId = uuidv4();
          await tx.run(
            `INSERT INTO followups (id, agency_id, lead_id, assigned_to, due_at, channel, goal, note, created_by)
             VALUES (@id, @agency_id, @lead_id, @assigned_to, @due_at, @channel, @goal, @note, @created_by)`,
            { id: followupId, agency_id: agencyId, lead_id: lead.id, assigned_to: lead.assigned_to || req.user.id, due_at: result.suggested_followup.due_at, channel: result.suggested_followup.channel, goal: result.suggested_followup.goal, note: (result.next_steps[0] || '').slice(0, 500), created_by: req.user.id }
          );
        }
      });
    }

    if (saved || followupId) invalidateToday(agencyId);
    res.json({ ...result, warnings, saved, followup_id: followupId, ai_available: aiAvailable() });
  } catch (e) { fail(res, e, 'No se pudo resumir la conversación.'); }
});


// ── Ajustes de reglas de alerta (por agencia) ─────────────────────────────

const settingsSchema = z.object({
  stale_days: z.object(Object.fromEntries(Object.keys(STALE_DAYS).map((k) => [k, z.number().int().min(1).max(120).optional()]))).partial().optional(),
  inactive_days: z.number().int().min(7).max(365).optional(),
  visit_followup_days: z.number().int().min(0).max(30).optional(),
});

router.get('/settings', async (req, res) => {
  try {
    res.json({ settings: await getSettings(req.user.agency_id), can_edit: ['admin', 'manager'].includes(req.user.role), alert_classes: ALERT_CLASSES });
  } catch (e) { fail(res, e, 'No se pudieron leer las reglas.'); }
});

router.put('/settings', validate(settingsSchema), async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Solo un administrador puede cambiar las reglas.' });
    const agencyId = req.user.agency_id;
    const cur = await getSettings(agencyId);
    const next = mergeSettings({
      stale_days: { ...cur.stale_days, ...(req.body.stale_days || {}) },
      inactive_days: req.body.inactive_days ?? cur.inactive_days,
      visit_followup_days: req.body.visit_followup_days ?? cur.visit_followup_days,
    });
    await run(
      `INSERT INTO followup_settings (agency_id, stale_days, inactive_days, visit_followup_days, updated_at)
       VALUES (@a, @stale::jsonb, @inactive, @visit, NOW())
       ON CONFLICT (agency_id) DO UPDATE SET stale_days = EXCLUDED.stale_days, inactive_days = EXCLUDED.inactive_days,
         visit_followup_days = EXCLUDED.visit_followup_days, updated_at = NOW()`,
      { a: agencyId, stale: JSON.stringify(next.stale_days), inactive: next.inactive_days, visit: next.visit_followup_days }
    );
    invalidateSettings(agencyId); invalidateToday(agencyId);
    res.json({ settings: next });
  } catch (e) { fail(res, e, 'No se pudieron guardar las reglas.'); }
});

router.post('/settings/reset', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Solo un administrador puede cambiar las reglas.' });
    await run('DELETE FROM followup_settings WHERE agency_id = @a', { a: req.user.agency_id });
    invalidateSettings(req.user.agency_id); invalidateToday(req.user.agency_id);
    res.json({ settings: await getSettings(req.user.agency_id) });
  } catch (e) { fail(res, e, 'No se pudieron restablecer las reglas.'); }
});

// ── Prioridad y tipo de cliente de un contacto ────────────────────────────

const metaSchema = z.object({
  priority: z.enum(['alta', 'media', 'baja']).optional(),
  client_type: z.enum(['comprador', 'vendedor', 'propietario', 'inquilino', 'otro']).nullable().optional(),
}).refine((d) => d.priority !== undefined || d.client_type !== undefined, 'Nada que actualizar.');

router.patch('/leads/:id/meta', validate(metaSchema), async (req, res) => {
  try {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Identificador no válido.' });
    const lead = await getLead(req.params.id, req.user.agency_id);
    if (!lead) return res.status(404).json({ error: 'Contacto no encontrado.' });
    const sets = []; const p = { id: lead.id, a: req.user.agency_id };
    if (req.body.priority !== undefined) { sets.push('priority = @priority'); p.priority = req.body.priority; }
    if (req.body.client_type !== undefined) { sets.push('client_type = @client_type'); p.client_type = req.body.client_type; }
    await run(`UPDATE leads SET ${sets.join(', ')}, updated_at = NOW() WHERE id = @id AND agency_id = @a`, p);
    invalidateToday(req.user.agency_id);
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'No se pudo actualizar el contacto.'); }
});

// ── Agenda: próximos, completados, por día, por agente ───────────────────

const AGENDA_SELECT = `f.id AS followup_id, f.due_at, f.completed_at, f.status AS followup_status, f.channel, f.goal, f.note, f.snooze_count, f.assigned_to,
       l.id AS lead_id, l.name, l.phone, l.email, l.status, l.priority, l.client_type, l.whatsapp_opt_out,
       p.id AS property_id, p.title AS property_title, p.images AS property_images, u.name AS assigned_name`;
const AGENDA_FROM = `FROM followups f
       JOIN leads l ON l.id = f.lead_id AND l.agency_id = f.agency_id
       LEFT JOIN properties p ON p.id = f.property_id
       LEFT JOIN users u ON u.id = f.assigned_to`;

function agendaItem(r) {
  return {
    followup_id: r.followup_id, due_at: r.due_at, completed_at: r.completed_at, status: r.followup_status,
    channel: r.channel, goal: r.goal, note: r.note, assigned_to: r.assigned_to, assigned_name: r.assigned_name || null,
    lead: { id: r.lead_id, name: r.name, phone: r.phone, email: r.email, status: r.status, status_label: statusLabel(r.status), priority: r.priority || 'media', client_type: r.client_type || null, has_whatsapp: !!normalizePhone(r.phone), whatsapp_opt_out: !!r.whatsapp_opt_out },
    property: r.property_id ? { id: r.property_id, title: r.property_title, photo: firstImage(r.property_images) } : null,
  };
}

router.get('/agenda', async (req, res) => {
  try {
    const agencyId = req.user.agency_id; const uid = req.user.id;
    const view = String(req.query.view || 'upcoming');
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    const mineF = mine ? 'AND (f.assigned_to = @uid OR l.assigned_to = @uid OR f.created_by = @uid)' : '';
    const { tz } = await agencyInfo(agencyId);
    const b = await dayBounds(tz);
    const base = { agency_id: agencyId, uid };

    if (view === 'upcoming') {
      const rows = await all(`SELECT ${AGENDA_SELECT} ${AGENDA_FROM} WHERE f.agency_id = @agency_id AND f.status = 'pending' AND f.due_at >= @day_end AND l.status ${OPEN} ${mineF} ORDER BY f.due_at ASC LIMIT 100`, { ...base, day_end: b.day_end });
      return res.json({ view, items: rows.map(agendaItem) });
    }
    if (view === 'completed') {
      const rows = await all(`SELECT ${AGENDA_SELECT} ${AGENDA_FROM} WHERE f.agency_id = @agency_id AND f.status = 'done' AND f.completed_at >= NOW() - interval '60 days' ${mineF} ORDER BY f.completed_at DESC LIMIT 100`, base);
      return res.json({ view, items: rows.map(agendaItem) });
    }
    if (view === 'day') {
      const date = String(req.query.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Fecha no válida (AAAA-MM-DD).' });
      const rows = await all(
        `SELECT ${AGENDA_SELECT} ${AGENDA_FROM}
         WHERE f.agency_id = @agency_id AND f.status IN ('pending','done') ${mineF}
           AND f.due_at >= (@d::date)::timestamp AT TIME ZONE @tz AND f.due_at < ((@d::date + 1)::timestamp AT TIME ZONE @tz)
         ORDER BY f.due_at ASC LIMIT 100`, { ...base, d: date, tz });
      const visits = await all(
        `SELECT a.id, a.status, a.type, a.location, ${APPT_TS} AS starts_at, l.id AS lead_id, l.name, p.title AS property_title
         FROM appointments a JOIN leads l ON l.id = a.lead_id AND l.agency_id = a.agency_id LEFT JOIN properties p ON p.id = a.property_id
         WHERE a.agency_id = @agency_id AND a.status <> 'cancelled'
           AND ${APPT_TS} >= (@d::date)::timestamp AT TIME ZONE @tz AND ${APPT_TS} < ((@d::date + 1)::timestamp AT TIME ZONE @tz)
         ORDER BY ${APPT_TS} ASC LIMIT 50`, { agency_id: agencyId, d: date, tz });
      return res.json({ view, date, items: rows.map(agendaItem), visits });
    }
    if (view === 'agents') {
      const rows = await all(
        `SELECT f.assigned_to AS user_id, u.name,
                COUNT(*) FILTER (WHERE f.due_at < @day_start) AS overdue,
                COUNT(*) FILTER (WHERE f.due_at >= @day_start AND f.due_at < @day_end) AS today,
                COUNT(*) FILTER (WHERE f.due_at >= @day_end) AS upcoming
         FROM followups f JOIN leads l ON l.id = f.lead_id AND l.agency_id = f.agency_id LEFT JOIN users u ON u.id = f.assigned_to
         WHERE f.agency_id = @agency_id AND f.status = 'pending' AND l.status ${OPEN}
         GROUP BY f.assigned_to, u.name ORDER BY 3 DESC, 4 DESC`, { ...base, day_start: b.day_start, day_end: b.day_end });
      const open = await all(`SELECT assigned_to AS user_id, COUNT(*) AS n FROM leads WHERE agency_id = @agency_id AND status ${OPEN} GROUP BY assigned_to`, base);
      const openMap = new Map(open.map((o) => [o.user_id, Number(o.n)]));
      const agents = rows.map((r) => ({ user_id: r.user_id, name: r.name || 'Sin asignar', overdue: Number(r.overdue), today: Number(r.today), upcoming: Number(r.upcoming), open_contacts: openMap.get(r.user_id) || 0 }));
      return res.json({ view, agents });
    }
    return res.status(400).json({ error: 'Vista no válida.' });
  } catch (e) { fail(res, e, 'No se pudo cargar la agenda.'); }
});

router.get('/calendar', async (req, res) => {
  try {
    const month = String(req.query.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Mes no válido (AAAA-MM).' });
    const agencyId = req.user.agency_id;
    const { tz } = await agencyInfo(agencyId);
    const first = `${month}-01`;
    const range = `>= (@m::date)::timestamp AT TIME ZONE @tz AND`;
    const rows = await all(
      `SELECT to_char(f.due_at AT TIME ZONE @tz, 'YYYY-MM-DD') AS d, f.status, COUNT(*) AS n
       FROM followups f JOIN leads l ON l.id = f.lead_id AND l.agency_id = f.agency_id
       WHERE f.agency_id = @a AND f.status IN ('pending','done') AND f.due_at ${range} f.due_at < ((@m::date + interval '1 month')::timestamp AT TIME ZONE @tz)
       GROUP BY 1, 2`, { a: agencyId, m: first, tz });
    const vrows = await all(
      `SELECT to_char(${APPT_TS} AT TIME ZONE @tz, 'YYYY-MM-DD') AS d, COUNT(*) AS n
       FROM appointments a WHERE a.agency_id = @a AND a.status <> 'cancelled'
         AND ${APPT_TS} >= (@m::date)::timestamp AT TIME ZONE @tz AND ${APPT_TS} < ((@m::date + interval '1 month')::timestamp AT TIME ZONE @tz)
       GROUP BY 1`, { a: agencyId, m: first, tz });
    const days = {};
    for (const r of rows) { days[r.d] = days[r.d] || { pending: 0, done: 0, visits: 0 }; days[r.d][r.status] = Number(r.n); }
    for (const r of vrows) { days[r.d] = days[r.d] || { pending: 0, done: 0, visits: 0 }; days[r.d].visits = Number(r.n); }
    res.json({ month, days });
  } catch (e) { fail(res, e, 'No se pudo cargar el calendario.'); }
});

// ── Ficha de inmueble: interesados, consultas, visitas, seguimientos ──────

router.get('/property/:id', async (req, res) => {
  try {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Identificador no válido.' });
    const a = req.user.agency_id;
    const prop = await get('SELECT id, title, zone, city, status, images FROM properties WHERE id = @id AND agency_id = @a', { id: req.params.id, a });
    if (!prop) return res.status(404).json({ error: 'Inmueble no encontrado.' });
    const [interested, visits, pending, last] = await Promise.all([
      all(`SELECT l.id, l.name, l.status, l.priority, pi.status AS interest_status, ${LAST_TOUCH_SQL} AS last_touch
           FROM property_interests pi JOIN leads l ON l.id = pi.lead_id AND l.agency_id = @a
           WHERE pi.property_id = @id AND pi.agency_id = @a ORDER BY pi.created_at DESC LIMIT 50`, { id: prop.id, a }),
      all(`SELECT a.id, a.status, ${APPT_TS} AS starts_at, l.id AS lead_id, l.name
           FROM appointments a JOIN leads l ON l.id = a.lead_id AND l.agency_id = a.agency_id
           WHERE a.agency_id = @a AND a.property_id = @id ORDER BY ${APPT_TS} DESC NULLS LAST LIMIT 30`, { id: prop.id, a }),
      all(`SELECT f.id, f.due_at, f.channel, f.goal, l.id AS lead_id, l.name
           FROM followups f JOIN leads l ON l.id = f.lead_id AND l.agency_id = f.agency_id
           WHERE f.agency_id = @a AND f.property_id = @id AND f.status = 'pending' ORDER BY f.due_at ASC LIMIT 30`, { id: prop.id, a }),
      all(`SELECT ac.lead_id, l.name, ac.type, ac.description, ac.created_at
           FROM activities ac JOIN leads l ON l.id = ac.lead_id AND l.agency_id = ac.agency_id
           WHERE ac.agency_id = @a AND ac.type IN ('contact','summary')
             AND ac.lead_id IN (SELECT lead_id FROM property_interests WHERE property_id = @id AND agency_id = @a)
           ORDER BY ac.created_at DESC LIMIT 8`, { id: prop.id, a }),
    ]);
    const now = Date.now();
    const done = visits.filter((v) => v.starts_at && new Date(v.starts_at).getTime() < now && v.status !== 'cancelled').length;
    const upcoming = visits.filter((v) => v.starts_at && new Date(v.starts_at).getTime() >= now && v.status !== 'cancelled');
    res.json({
      property: { id: prop.id, title: prop.title, zone: prop.zone, city: prop.city, status: prop.status, photo: firstImage(prop.images) },
      counts: { interested: interested.length, consultations: interested.length, visits_done: done, visits_upcoming: upcoming.length, pending_followups: pending.length },
      interested: interested.map((i) => ({ ...i, status_label: statusLabel(i.status) })),
      visits: visits.map((v) => ({ id: v.id, status: v.status, starts_at: v.starts_at, lead_id: v.lead_id, name: v.name })),
      pending_followups: pending,
      last_interactions: last.map((x) => ({ ...x, description: String(x.description || '').slice(0, 160) })),
    });
  } catch (e) { fail(res, e, 'No se pudo cargar la actividad del inmueble.'); }
});

router.get('/status', (req, res) => res.json({ ai_available: aiAvailable(), goals: GOALS }));

export default router;
