import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// Parte de visita digital: constancia fechada y firmada de que la agencia enseñó
// el inmueble a una persona concreta. Sirve como prueba si luego intentan saltarse
// la intermediación. NO sustituye el asesoramiento legal.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SIGNATURE_BYTES = 150 * 1024;

export function defaultTerms({ agency, property, visitDate }) {
  const fecha = new Date(visitDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const ref = property.reference ? `, ref. ${property.reference}` : '';
  const contacto = agency.email ? ` escribiendo a ${agency.email}` : ' contactando con la agencia';
  return [
    `Declaro que el día ${fecha} la agencia ${agency.name} me ha mostrado el inmueble "${property.title}" (${property.city || 'ubicación indicada por la agencia'}${ref}).`,
    `Reconozco que he conocido este inmueble a través de ${agency.name} y que esta visita queda registrada, con mi identidad y la fecha, como constancia de la misma.`,
    `Información básica sobre protección de datos. Responsable: ${agency.name}. Finalidad: gestionar la visita, el seguimiento de mi interés y dejar constancia de ella. Base jurídica: mi consentimiento y la gestión de la relación precontractual. Conservación: el tiempo necesario para estas finalidades y los plazos legales. Puedo ejercer mis derechos de acceso, rectificación, supresión y demás${contacto}.`,
  ].join('\n\n');
}

function resolveTemplate(tpl, { agency, property, visitDate }) {
  const fecha = new Date(visitDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  return String(tpl)
    .replaceAll('{agencia}', agency.name || '')
    .replaceAll('{inmueble}', property.title || '')
    .replaceAll('{ciudad}', property.city || '')
    .replaceAll('{referencia}', property.reference || '')
    .replaceAll('{fecha}', fecha);
}

export function computeHash(r) {
  const payload = JSON.stringify({
    id: r.id,
    agency_id: r.agency_id,
    property_id: r.property_id,
    visit_date: new Date(r.visit_date).toISOString(),
    terms_text: r.terms_text,
    visitor_name: r.visitor_name,
    visitor_doc: r.visitor_doc || '',
    visitor_phone: r.visitor_phone || '',
    visitor_email: r.visitor_email || '',
    signature_name: r.signature_name || '',
    signature_image_sha: r.signature_image ? crypto.createHash('sha256').update(r.signature_image).digest('hex') : '',
    signed_at: r.signed_at ? new Date(r.signed_at).toISOString() : '',
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function logActivity(agencyId, leadId, userId, type, description, metadata = null) {
  if (!leadId) return;
  try {
    await run(
      `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
       VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, @metadata, NOW())`,
      { id: uuidv4(), agency_id: agencyId, lead_id: leadId, user_id: userId, type, description, metadata: metadata ? JSON.stringify(metadata) : null }
    );
  } catch (e) {
    console.warn('[visits] no se pudo registrar la actividad:', e.message);
  }
}

const LIST_SQL = `
  SELECT v.*, p.title AS property_title, p.city AS property_city, p.reference AS property_reference,
         l.name AS lead_name
  FROM visit_reports v
  JOIN properties p ON p.id = v.property_id
  LEFT JOIN leads l ON l.id = v.lead_id`;

// El dibujo de la firma y los datos técnicos solo salen en el detalle de evidencia.
function toListItem(r) {
  const { signature_image, signed_ip, signed_user_agent, terms_text, ...rest } = r;
  return { ...rest, has_signature_image: !!signature_image };
}

// ── Rutas autenticadas ────────────────────────────────────────────────────────
const router = Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { status, property_id, lead_id } = req.query;
    let sql = `${LIST_SQL} WHERE v.agency_id = @agency_id`;
    const params = { agency_id: req.user.agency_id };
    if (status) { sql += ' AND v.status = @status'; params.status = String(status); }
    if (property_id) { sql += ' AND v.property_id = @property_id'; params.property_id = String(property_id); }
    if (lead_id) { sql += ' AND v.lead_id = @lead_id'; params.lead_id = String(lead_id); }
    sql += ' ORDER BY v.visit_date DESC, v.created_at DESC LIMIT 200';
    const rows = await all(sql, params);
    res.json(rows.map(toListItem));
  } catch (e) {
    console.error('Error listando partes de visita:', e);
    res.status(500).json({ error: 'Error al obtener los partes de visita.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { property_id, lead_id, visitor_name, visitor_phone, visitor_email, visit_date } = req.body || {};
    if (!property_id) return res.status(400).json({ error: 'Elige el inmueble visitado.' });

    const agencyId = req.user.agency_id;
    const property = await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: property_id, agency_id: agencyId });
    if (!property) return res.status(404).json({ error: 'Inmueble no encontrado.' });

    let lead = null;
    if (lead_id) {
      lead = await get('SELECT id, name, email, phone FROM leads WHERE id = @id AND agency_id = @agency_id', { id: lead_id, agency_id: agencyId });
      if (!lead) return res.status(404).json({ error: 'Contacto no encontrado.' });
    }

    const when = visit_date ? new Date(visit_date) : new Date();
    if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'La fecha de la visita no es válida.' });

    const agency = await get('SELECT name, email, visit_terms FROM agencies WHERE id = @id', { id: agencyId });
    const ctx = { agency, property, visitDate: when };
    const terms = agency.visit_terms && agency.visit_terms.trim()
      ? resolveTemplate(agency.visit_terms, ctx)
      : defaultTerms(ctx);

    const id = uuidv4();
    const token = crypto.randomBytes(24).toString('hex');
    await run(
      `INSERT INTO visit_reports (id, agency_id, property_id, lead_id, agent_user_id, token, status, visit_date,
         visitor_name, visitor_phone, visitor_email, terms_text, created_at)
       VALUES (@id, @agency_id, @property_id, @lead_id, @agent_user_id, @token, 'pending', @visit_date,
         @visitor_name, @visitor_phone, @visitor_email, @terms_text, NOW())`,
      {
        id, agency_id: agencyId, property_id, lead_id: lead?.id || null, agent_user_id: req.user.id, token,
        visit_date: when.toISOString(),
        visitor_name: (visitor_name || lead?.name || '').toString().slice(0, 200) || null,
        visitor_phone: (visitor_phone || lead?.phone || '').toString().slice(0, 40) || null,
        visitor_email: (visitor_email || lead?.email || '').toString().slice(0, 200) || null,
        terms_text: terms,
      }
    );
    await logActivity(agencyId, lead?.id, req.user.id, 'visit_report_created', `Parte de visita creado para ${property.title}`, { property_id });

    const row = await get(`${LIST_SQL} WHERE v.id = @id`, { id });
    res.status(201).json({ ...toListItem(row), token, public_path: `/visita/${token}` });
  } catch (e) {
    console.error('Error creando parte de visita:', e);
    res.status(500).json({ error: 'Error al crear el parte de visita.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await get(`${LIST_SQL} WHERE v.id = @id AND v.agency_id = @agency_id`, { id: req.params.id, agency_id: req.user.agency_id });
    if (!row) return res.status(404).json({ error: 'Parte de visita no encontrado.' });
    res.json({ ...toListItem(row), token: row.token, public_path: `/visita/${row.token}` });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener el parte de visita.' });
  }
});

// Constancia completa (firma, huella y comprobación de integridad) para imprimir o guardar.
router.get('/:id/evidence', async (req, res) => {
  try {
    const row = await get(`${LIST_SQL} WHERE v.id = @id AND v.agency_id = @agency_id`, { id: req.params.id, agency_id: req.user.agency_id });
    if (!row) return res.status(404).json({ error: 'Parte de visita no encontrado.' });
    if (row.status !== 'signed') return res.status(409).json({ error: 'El parte todavía no está firmado.' });
    const agency = await get('SELECT name, email, logo_url FROM agencies WHERE id = @id', { id: req.user.agency_id });
    res.json({
      agency,
      report: row,
      integrity_ok: computeHash(row) === row.content_hash,
    });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener la constancia.' });
  }
});

// Valoración interna tras la visita (alimenta el informe al propietario).
router.patch('/:id', async (req, res) => {
  try {
    const { interest_level, feedback } = req.body || {};
    if (interest_level && !['alto', 'medio', 'bajo'].includes(interest_level)) {
      return res.status(400).json({ error: 'El interés debe ser alto, medio o bajo.' });
    }
    const existing = await get('SELECT id FROM visit_reports WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Parte de visita no encontrado.' });
    await run(
      `UPDATE visit_reports SET interest_level = @interest_level, feedback = @feedback WHERE id = @id AND agency_id = @agency_id`,
      { id: req.params.id, agency_id: req.user.agency_id, interest_level: interest_level || null, feedback: feedback ? String(feedback).slice(0, 1000) : null }
    );
    const row = await get(`${LIST_SQL} WHERE v.id = @id`, { id: req.params.id });
    res.json(toListItem(row));
  } catch (e) {
    res.status(500).json({ error: 'Error al guardar la valoración.' });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const row = await get('SELECT status FROM visit_reports WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!row) return res.status(404).json({ error: 'Parte de visita no encontrado.' });
    if (row.status !== 'pending') return res.status(409).json({ error: 'Solo se pueden anular partes pendientes de firma. Un parte firmado queda como constancia.' });
    await run("UPDATE visit_reports SET status = 'cancelled' WHERE id = @id", { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al anular el parte.' });
  }
});

// ── Rutas públicas (el visitante firma desde su móvil) ────────────────────────
export const publicRouter = Router();
const publicLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
publicRouter.use('/public/visit', publicLimiter);

async function loadByToken(token) {
  const t = String(token || '');
  if (t.length < 32) return null;
  return get(
    `SELECT v.*, a.name AS agency_name, a.logo_url AS agency_logo, a.primary_color AS agency_color,
            p.title AS property_title, p.city AS property_city, p.zone AS property_zone, p.reference AS property_reference
     FROM visit_reports v
     JOIN agencies a ON a.id = v.agency_id
     JOIN properties p ON p.id = v.property_id
     WHERE v.token = @t`,
    { t }
  );
}

publicRouter.get('/public/visit/:token', async (req, res) => {
  try {
    const r = await loadByToken(req.params.token);
    if (!r || r.status === 'cancelled') return res.status(404).json({ error: 'Este enlace no es válido.' });
    res.json({
      status: r.status,
      agency: { name: r.agency_name, logo_url: r.agency_logo, color: r.agency_color },
      property: { title: r.property_title, city: r.property_city, zone: r.property_zone, reference: r.property_reference },
      visit_date: r.visit_date,
      terms_text: r.terms_text,
      signed_at: r.signed_at,
      prefill: r.status === 'pending'
        ? { visitor_name: r.visitor_name || '', visitor_phone: r.visitor_phone || '', visitor_email: r.visitor_email || '' }
        : null,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo cargar el parte.' });
  }
});

publicRouter.post('/public/visit/:token/sign', async (req, res) => {
  try {
    const r = await loadByToken(req.params.token);
    if (!r || r.status === 'cancelled') return res.status(404).json({ error: 'Este enlace no es válido.' });
    if (r.status === 'signed') return res.status(409).json({ error: 'Este parte ya está firmado.' });

    const b = req.body || {};
    const name = String(b.visitor_name || '').trim();
    if (name.length < 3) return res.status(400).json({ error: 'Escribe tu nombre y apellidos.' });
    if (b.consent_data !== true) return res.status(400).json({ error: 'Debes aceptar el tratamiento de tus datos para firmar.' });

    const email = String(b.visitor_email || '').trim();
    const phone = String(b.visitor_phone || '').trim();
    if (!email && !phone) return res.status(400).json({ error: 'Indica un teléfono o un correo de contacto.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El correo no es válido.' });

    let image = null;
    if (b.signature_image) {
      image = String(b.signature_image);
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)) return res.status(400).json({ error: 'La firma no es válida.' });
      if (Buffer.byteLength(image) > MAX_SIGNATURE_BYTES) return res.status(400).json({ error: 'La firma es demasiado grande.' });
    }
    const typed = String(b.signature_name || '').trim();
    if (!image && typed.length < 3) return res.status(400).json({ error: 'Dibuja tu firma o escribe tu nombre completo como firma.' });

    const signedAt = new Date();
    const record = {
      id: r.id, agency_id: r.agency_id, property_id: r.property_id, visit_date: r.visit_date, terms_text: r.terms_text,
      visitor_name: name.slice(0, 200), visitor_doc: String(b.visitor_doc || '').trim().slice(0, 40),
      visitor_phone: phone.slice(0, 40), visitor_email: email.slice(0, 200),
      signature_name: typed.slice(0, 200), signature_image: image, signed_at: signedAt,
    };
    const hash = computeHash(record);

    // Solo firma si sigue pendiente (evita doble firma por carreras).
    const upd = await run(
      `UPDATE visit_reports SET status = 'signed', visitor_name = @visitor_name, visitor_doc = @visitor_doc,
         visitor_phone = @visitor_phone, visitor_email = @visitor_email, consent_data = true,
         signature_name = @signature_name, signature_image = @signature_image, signed_at = @signed_at,
         signed_ip = @ip, signed_user_agent = @ua, content_hash = @hash
       WHERE id = @id AND status = 'pending'`,
      {
        id: r.id, visitor_name: record.visitor_name, visitor_doc: record.visitor_doc || null,
        visitor_phone: record.visitor_phone || null, visitor_email: record.visitor_email || null,
        signature_name: record.signature_name || null, signature_image: image, signed_at: signedAt.toISOString(),
        ip: String(req.ip || '').slice(0, 64), ua: String(req.headers['user-agent'] || '').slice(0, 300), hash,
      }
    );
    if (upd && upd.changes === 0) return res.status(409).json({ error: 'Este parte ya está firmado.' });

    await logActivity(r.agency_id, r.lead_id, r.agent_user_id, 'visit_signed', `${name} firmó el parte de visita de ${r.property_title}`, { visit_report_id: r.id });
    res.json({ ok: true, signed_at: signedAt.toISOString() });
  } catch (e) {
    console.error('Error firmando parte de visita:', e);
    res.status(500).json({ error: 'No se pudo registrar la firma.' });
  }
});

export default router;
