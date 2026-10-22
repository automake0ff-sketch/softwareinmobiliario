import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// Encargos de venta/alquiler (exclusivas): fechas, renovación automática y aviso
// antes de que se pase el plazo para comunicar la no renovación.
// El informe al propietario se genera desde las visitas firmadas y los interesados.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

function toDateOnly(v) {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  const d = new Date(s.slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmt(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}
function today() {
  return toDateOnly(new Date());
}

// Estado y aviso de un encargo respecto a hoy.
export function evaluateAgreement(a, now = today()) {
  const end = toDateOnly(a.end_date);
  const noticeDays = Number(a.notice_days || 0);
  const noticeDeadline = end ? new Date(end.getTime() - noticeDays * DAY) : null;
  const daysToEnd = end ? Math.round((end - now) / DAY) : null;
  const daysToNotice = noticeDeadline ? Math.round((noticeDeadline - now) / DAY) : null;

  let alert = 'ok';
  let alert_text = '';
  if (a.status !== 'activo') {
    alert = 'inactivo';
  } else if (daysToEnd < 0) {
    alert = 'vencido';
    alert_text = a.auto_renew
      ? `Venció hace ${Math.abs(daysToEnd)} días. Si nadie avisó, el contrato puede haberse renovado solo: revisa el contrato y actualiza las fechas.`
      : `Venció hace ${Math.abs(daysToEnd)} días. Renuévalo o ciérralo.`;
  } else if (a.auto_renew && daysToNotice < 0) {
    alert = 'renovada_auto';
    alert_text = `El plazo para avisar de la no renovación terminó hace ${Math.abs(daysToNotice)} días: se renovará salvo pacto distinto.`;
  } else if (a.auto_renew && daysToNotice <= 15) {
    alert = daysToNotice <= 3 ? 'urgente' : 'aviso';
    alert_text = `Quedan ${daysToNotice} días para comunicar (o no) la no renovación. Decide ya si quieres seguir con este encargo.`;
  } else if (!a.auto_renew && daysToEnd <= 30) {
    alert = daysToEnd <= 7 ? 'urgente' : 'aviso';
    alert_text = `El encargo termina en ${daysToEnd} días y no se renueva solo: habla con el propietario para renovarlo.`;
  }
  return { days_to_end: daysToEnd, notice_deadline: fmt(noticeDeadline), days_to_notice: daysToNotice, alert, alert_text };
}

function decorate(row) {
  return {
    ...row,
    start_date: fmt(toDateOnly(row.start_date)),
    end_date: fmt(toDateOnly(row.end_date)),
    ...evaluateAgreement(row),
  };
}

const SELECT = `
  SELECT g.*, p.title AS property_title, p.city AS property_city, p.reference AS property_reference
  FROM listing_agreements g
  JOIN properties p ON p.id = g.property_id`;

function validate(body, partial = false) {
  const errors = [];
  const out = {};
  const str = (k, max) => { if (body[k] !== undefined) out[k] = body[k] === null || body[k] === '' ? null : String(body[k]).slice(0, max); };
  str('owner_name', 200); str('owner_phone', 40); str('owner_email', 200); str('commission_text', 500); str('notes', 1000);
  if (!partial && !out.owner_name) errors.push('Indica el nombre del propietario.');
  if (body.owner_name !== undefined && !out.owner_name) errors.push('Indica el nombre del propietario.');
  if (out.owner_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.owner_email)) errors.push('El correo del propietario no es válido.');

  if (body.agreement_type !== undefined) {
    if (!['exclusiva', 'no_exclusiva'].includes(body.agreement_type)) errors.push('El tipo debe ser exclusiva o no exclusiva.');
    else out.agreement_type = body.agreement_type;
  }
  for (const k of ['start_date', 'end_date']) {
    if (body[k] !== undefined) {
      const d = toDateOnly(body[k]);
      if (!d) errors.push(`La fecha ${k === 'start_date' ? 'de inicio' : 'de fin'} no es válida.`); else out[k] = fmt(d);
    } else if (!partial) errors.push(`Falta la fecha ${k === 'start_date' ? 'de inicio' : 'de fin'}.`);
  }
  if (body.auto_renew !== undefined) out.auto_renew = body.auto_renew === true || body.auto_renew === 'true' || body.auto_renew === 1;
  if (body.notice_days !== undefined) {
    const n = Number(body.notice_days);
    if (!Number.isInteger(n) || n < 0 || n > 365) errors.push('Los días de preaviso deben estar entre 0 y 365.'); else out.notice_days = n;
  }
  if (body.status !== undefined) {
    if (!['activo', 'renovado', 'cancelado', 'cerrado'].includes(body.status)) errors.push('Estado no válido.'); else out.status = body.status;
  }
  return { errors, out };
}

// ── Rutas autenticadas ────────────────────────────────────────────────────────
const router = Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { property_id, status } = req.query;
    let sql = `${SELECT} WHERE g.agency_id = @agency_id`;
    const params = { agency_id: req.user.agency_id };
    if (property_id) { sql += ' AND g.property_id = @property_id'; params.property_id = String(property_id); }
    if (status) { sql += ' AND g.status = @status'; params.status = String(status); }
    sql += ' ORDER BY g.end_date ASC LIMIT 300';
    const rows = (await all(sql, params)).map(decorate);
    const needing = rows.filter((r) => ['urgente', 'aviso', 'vencido', 'renovada_auto'].includes(r.alert)).length;
    res.json({ agreements: rows, attention_count: needing });
  } catch (e) {
    console.error('Error listando encargos:', e);
    res.status(500).json({ error: 'Error al obtener los encargos.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { errors, out } = validate(req.body || {});
    const propertyId = req.body?.property_id;
    if (!propertyId) errors.push('Elige el inmueble.');
    if (out.start_date && out.end_date && out.end_date <= out.start_date) errors.push('La fecha de fin debe ser posterior a la de inicio.');
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const property = await get('SELECT id FROM properties WHERE id = @id AND agency_id = @agency_id', { id: propertyId, agency_id: req.user.agency_id });
    if (!property) return res.status(404).json({ error: 'Inmueble no encontrado.' });

    const id = uuidv4();
    await run(
      `INSERT INTO listing_agreements (id, agency_id, property_id, owner_name, owner_phone, owner_email, agreement_type,
         start_date, end_date, auto_renew, notice_days, commission_text, notes, status, report_token, created_at, updated_at)
       VALUES (@id, @agency_id, @property_id, @owner_name, @owner_phone, @owner_email, @agreement_type,
         @start_date, @end_date, @auto_renew, @notice_days, @commission_text, @notes, 'activo', @report_token, NOW(), NOW())`,
      {
        id, agency_id: req.user.agency_id, property_id: propertyId,
        owner_name: out.owner_name, owner_phone: out.owner_phone ?? null, owner_email: out.owner_email ?? null,
        agreement_type: out.agreement_type || 'exclusiva', start_date: out.start_date, end_date: out.end_date,
        auto_renew: out.auto_renew ?? true, notice_days: out.notice_days ?? 15,
        commission_text: out.commission_text ?? null, notes: out.notes ?? null,
        report_token: crypto.randomBytes(24).toString('hex'),
      }
    );
    const row = await get(`${SELECT} WHERE g.id = @id`, { id });
    res.status(201).json(decorate(row));
  } catch (e) {
    console.error('Error creando encargo:', e);
    res.status(500).json({ error: 'Error al crear el encargo.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await get('SELECT * FROM listing_agreements WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Encargo no encontrado.' });
    const { errors, out } = validate(req.body || {}, true);
    const start = out.start_date || fmt(toDateOnly(existing.start_date));
    const end = out.end_date || fmt(toDateOnly(existing.end_date));
    if (end <= start) errors.push('La fecha de fin debe ser posterior a la de inicio.');
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const keys = Object.keys(out);
    if (!keys.length) return res.status(400).json({ error: 'No hay cambios que guardar.' });
    const sets = keys.map((k) => `${k} = @${k}`).concat('updated_at = NOW()');
    await run(`UPDATE listing_agreements SET ${sets.join(', ')} WHERE id = @id AND agency_id = @agency_id`, { ...out, id: req.params.id, agency_id: req.user.agency_id });
    res.json(decorate(await get(`${SELECT} WHERE g.id = @id`, { id: req.params.id })));
  } catch (e) {
    console.error('Error actualizando encargo:', e);
    res.status(500).json({ error: 'Error al actualizar el encargo.' });
  }
});

// Renovar: alarga la fecha de fin desde la actual (o desde hoy si ya venció).
router.post('/:id/renew', async (req, res) => {
  try {
    const months = Number(req.body?.months || 3);
    if (!Number.isInteger(months) || months < 1 || months > 36) return res.status(400).json({ error: 'Indica entre 1 y 36 meses.' });
    const a = await get('SELECT * FROM listing_agreements WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!a) return res.status(404).json({ error: 'Encargo no encontrado.' });
    const base = toDateOnly(a.end_date) > today() ? toDateOnly(a.end_date) : today();
    const next = new Date(base); next.setUTCMonth(next.getUTCMonth() + months);
    await run(
      `UPDATE listing_agreements SET end_date = @end, status = 'activo', updated_at = NOW() WHERE id = @id AND agency_id = @agency_id`,
      { end: fmt(next), id: req.params.id, agency_id: req.user.agency_id }
    );
    res.json(decorate(await get(`${SELECT} WHERE g.id = @id`, { id: req.params.id })));
  } catch (e) {
    res.status(500).json({ error: 'Error al renovar el encargo.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await run('DELETE FROM listing_agreements WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!r.changes) return res.status(404).json({ error: 'Encargo no encontrado.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar el encargo.' });
  }
});

// ── Informe al propietario (enlace público sin datos personales de los visitantes) ──
export const publicRouter = Router();
publicRouter.use('/public/owner-report', rateLimit({
  windowMs: 10 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
}));

publicRouter.get('/public/owner-report/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (token.length < 32) return res.status(404).json({ error: 'Este enlace no es válido.' });
    const a = await get(
      `SELECT g.*, p.title AS property_title, p.city AS property_city, p.zone AS property_zone, p.price AS property_price,
              p.reference AS property_reference, p.operation_type AS property_operation, p.status AS property_status,
              ag.name AS agency_name, ag.logo_url AS agency_logo, ag.email AS agency_email, ag.phone AS agency_phone
       FROM listing_agreements g
       JOIN properties p ON p.id = g.property_id
       JOIN agencies ag ON ag.id = g.agency_id
       WHERE g.report_token = @t`,
      { t: token }
    );
    if (!a) return res.status(404).json({ error: 'Este enlace no es válido.' });

    const visits = await all(
      `SELECT visit_date, interest_level, feedback FROM visit_reports
       WHERE property_id = @pid AND agency_id = @aid AND status = 'signed' AND visit_date >= @since
       ORDER BY visit_date DESC LIMIT 100`,
      { pid: a.property_id, aid: a.agency_id, since: toDateOnly(a.start_date).toISOString() }
    );

    let interested = 0;
    try {
      const r = await get('SELECT COUNT(*)::int AS n FROM property_interests WHERE property_id = @pid AND agency_id = @aid', { pid: a.property_id, aid: a.agency_id });
      interested = r?.n || 0;
    } catch { /* la tabla puede no existir todavía en entornos nuevos */ }

    const count = (lvl) => visits.filter((v) => v.interest_level === lvl).length;
    res.json({
      agency: { name: a.agency_name, logo_url: a.agency_logo, email: a.agency_email, phone: a.agency_phone },
      property: {
        title: a.property_title, city: a.property_city, zone: a.property_zone, reference: a.property_reference,
        price: a.property_price, operation: a.property_operation, status: a.property_status,
      },
      agreement: { type: a.agreement_type, start_date: fmt(toDateOnly(a.start_date)), end_date: fmt(toDateOnly(a.end_date)), owner_name: a.owner_name },
      totals: { visits: visits.length, interested, interest_high: count('alto'), interest_medium: count('medio'), interest_low: count('bajo') },
      visits: visits.map((v, i) => ({
        label: `Visita ${visits.length - i}`,
        date: v.visit_date,
        interest_level: v.interest_level,
        feedback: v.feedback,
      })),
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Error generando informe de propietario:', e);
    res.status(500).json({ error: 'No se pudo cargar el informe.' });
  }
});

export default router;
