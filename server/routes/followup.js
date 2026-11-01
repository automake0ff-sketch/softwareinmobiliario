import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { all, get, run, transaction } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import {
  STALE_DAYS, GOALS, CHANNELS, OUTCOMES, TONES,
  daysBetween, scoreItem, defaultGoalForLead, normalizePhone, buildWhatsAppUrl,
  buildMessage, summarizeConversation, dueInDays, statusLabel,
} from '../services/followup-engine.js';
import { aiAvailable, consumeAiQuota, aiMessage, aiSummary } from '../services/followup-ai.js';

const router = Router();
router.use(auth);

const DEFAULT_TZ = 'Europe/Madrid';
const MAX_TEXT = 8000;

// Condición SQL de "abandonado": estado abierto + días sin contacto según el estado (STALE_DAYS)
const STALE_SQL = '(' + Object.entries(STALE_DAYS)
  .map(([st, d]) => `(l.status = '${st}' AND COALESCE(NULLIF(l.last_contact_at::text,'')::timestamptz, NULLIF(l.last_activity::text,'')::timestamptz, l.created_at) <= NOW() - interval '${Number(d)} day')`)
  .join(' OR ') + ')';

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
  const a = await get('SELECT name, timezone FROM agencies WHERE id = @id', { id: agencyId });
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

/** Lista diaria de un usuario/agencia. La usan la pantalla y el resumen por email. */
export async function computeToday({ agencyId, uid, mine = false }) {
  {
    const now = new Date();
    const { tz } = await agencyInfo(agencyId);
    const b = await dayBounds(tz);

    const fRows = await all(
      `SELECT f.id AS followup_id, f.due_at, f.channel, f.goal, f.note, f.snooze_count, f.property_id,
              l.id AS lead_id, l.name, l.phone, l.email, l.status, l.ia_score, l.budget, l.zone, l.urgency,
              l.whatsapp_opt_out, l.assigned_to, ${LAST_TOUCH_SQL} AS last_touch, p.title AS property_title
       FROM followups f
       JOIN leads l ON l.id = f.lead_id AND l.agency_id = f.agency_id
       LEFT JOIN properties p ON p.id = f.property_id
       WHERE f.agency_id = @agency_id AND f.status = 'pending' AND f.due_at < @day_end
         AND l.status <> 'cerrado'
         ${mine ? 'AND (f.assigned_to = @uid OR l.assigned_to = @uid OR f.created_by = @uid)' : ''}
       ORDER BY f.due_at ASC LIMIT 80`,
      { agency_id: agencyId, day_end: b.day_end, uid }
    );

    const cntRow = await get(
      `SELECT COALESCE(SUM(CASE WHEN f.due_at < @day_start THEN 1 ELSE 0 END),0) AS overdue,
              COALESCE(SUM(CASE WHEN f.due_at >= @day_start THEN 1 ELSE 0 END),0) AS today
       FROM followups f JOIN leads l ON l.id = f.lead_id AND l.agency_id = f.agency_id
       WHERE f.agency_id = @agency_id AND f.status = 'pending' AND f.due_at < @day_end AND l.status <> 'cerrado'
         ${mine ? 'AND (f.assigned_to = @uid OR l.assigned_to = @uid OR f.created_by = @uid)' : ''}`,
      { agency_id: agencyId, day_start: b.day_start, day_end: b.day_end, uid }
    );

    const upcomingRow = await get(
      `SELECT COUNT(*) AS n FROM followups f JOIN leads l ON l.id = f.lead_id
       WHERE f.agency_id = @agency_id AND f.status = 'pending' AND f.due_at >= @day_end AND f.due_at < @week_end
         ${mine ? 'AND (f.assigned_to = @uid OR l.assigned_to = @uid OR f.created_by = @uid)' : ''}`,
      { agency_id: agencyId, day_end: b.day_end, week_end: b.week_end, uid }
    );

    // Leads abiertos, sin seguimiento pendiente y sin contacto reciente
    const cRows = await all(
      `SELECT l.id AS lead_id, l.name, l.phone, l.email, l.status, l.ia_score, l.budget, l.zone, l.urgency,
              l.whatsapp_opt_out, l.assigned_to, ${LAST_TOUCH_SQL} AS last_touch,
              pi.property_id, p.title AS property_title, COUNT(*) OVER() AS total_count
       FROM leads l
       LEFT JOIN LATERAL (SELECT pi2.property_id FROM property_interests pi2 WHERE pi2.lead_id = l.id ORDER BY pi2.created_at DESC LIMIT 1) pi ON true
       LEFT JOIN properties p ON p.id = pi.property_id
       WHERE l.agency_id = @agency_id AND l.status <> 'cerrado'
         AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.lead_id = l.id AND f.status = 'pending')
         AND ${STALE_SQL}
         ${mine ? 'AND l.assigned_to = @uid' : ''}
       ORDER BY ${LAST_TOUCH_SQL} ASC LIMIT 100`,
      { agency_id: agencyId, uid }
    );
    const abandonedTotal = Number(cRows[0]?.total_count || 0);
    const abandonedAll = cRows;

    // Último contacto registrado de cada lead mostrado
    const shownAband = abandonedAll.slice(0, 30);
    const ids = [...new Set([...fRows, ...shownAband].map((r) => r.lead_id))];
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
      const { priority, reasons } = scoreItem({ lead: r, daysSinceContact: dsc, daysOverdue, snoozeCount: r.snooze_count || 0, kind });
      return {
        kind,
        followup_id: r.followup_id || null,
        lead: leadView(r),
        property: r.property_id ? { id: r.property_id, title: r.property_title } : null,
        due_at: r.due_at || null,
        channel: r.channel || (r.phone ? 'whatsapp' : 'call'),
        goal: r.goal || defaultGoalForLead(r, dsc),
        note: r.note || null,
        days_overdue: daysOverdue,
        days_since_contact: dsc,
        priority,
        reasons,
        last_interaction: lastMap.get(r.lead_id) || null,
      };
    };

    const followupItems = fRows.map((r) => build(r, 'followup'));
    const overdue = followupItems.filter((i) => new Date(i.due_at) < new Date(b.day_start)).sort((a, c) => c.priority - a.priority);
    const today = followupItems.filter((i) => new Date(i.due_at) >= new Date(b.day_start)).sort((a, c) => c.priority - a.priority);
    const abandoned = shownAband.map((r) => build(r, 'abandoned')).sort((a, c) => c.priority - a.priority);

    return {
      generated_at: now.toISOString(),
      summary: {
        overdue: Number(cntRow?.overdue || 0),
        today: Number(cntRow?.today || 0),
        abandoned: abandonedTotal,
        upcoming_week: Number(upcomingRow?.n || 0),
        attention_total: Number(cntRow?.overdue || 0) + Number(cntRow?.today || 0) + abandonedTotal,
      },
      overdue, today, abandoned,
      abandoned_hidden: Math.max(0, abandonedTotal - shownAband.length),
      truncated: Number(cntRow?.overdue || 0) + Number(cntRow?.today || 0) > fRows.length || abandonedTotal > shownAband.length,
      ai_available: aiAvailable(),
    };
  }
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
       WHERE agency_id = @agency_id AND status <> 'cerrado'
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
    res.json({
      lead: { ...lead, status_label: statusLabel(lead.status), has_whatsapp: !!normalizePhone(lead.phone), whatsapp_opt_out: !!lead.whatsapp_opt_out },
      timeline: timeline.map((t) => ({ ...t, metadata: safeJson(t.metadata) })),
      pending_followups: pending,
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

router.get('/status', (req, res) => res.json({ ai_available: aiAvailable(), goals: GOALS }));

export default router;
