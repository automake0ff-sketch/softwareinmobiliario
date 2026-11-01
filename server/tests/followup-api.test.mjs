// Prueba de integración de InmoFollow contra un servidor y una BD reales.
// Uso: DATABASE_URL=... SUPABASE_JWT_SECRET=... BASE_URL=http://localhost:3002 node tests/followup-api.test.mjs
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3002';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p) => pool.query(sql, p);
let ok = 0, ko = 0;
const t = async (name, fn) => { try { await fn(); ok++; console.log('  ✓', name); } catch (e) { ko++; console.error('  ✗', name, '\n   ', e.message); } };

async function mkAgency(label) {
  const id = randomUUID(); const email = `${label}-${Date.now()}@test.es`;
  await q(`INSERT INTO auth.users(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING`, [id, email]).catch(() => {});
  await q(`INSERT INTO agencies(id,name,slug,plan,plan_status) VALUES($1::uuid,$2,$3,'starter','active')`, [id, `Agencia ${label}`, `${label}-${id.slice(0, 6)}`]);
  await q(`INSERT INTO users(id,email,name,role,agency_id,active) VALUES($1,$2,$3,'admin',$1,true) ON CONFLICT (id) DO UPDATE SET agency_id=EXCLUDED.agency_id`, [id, email, `Laura ${label}`]);
  const token = jwt.sign({ sub: id, email }, process.env.SUPABASE_JWT_SECRET);
  return { id, token };
}
async function mkLead(agency, name, { status = 'nuevo', ageDays = 0, touchDays = null, phone = '600112233', optOut = false } = {}) {
  const id = randomUUID();
  await q(`INSERT INTO leads(id,agency_id,name,phone,status,created_at,updated_at,last_contact_at,whatsapp_opt_out)
           VALUES($1,$2,$3,$4,$5, NOW() - ($6::int * interval '1 day'), NOW(), CASE WHEN $7::int IS NULL THEN NULL ELSE NOW() - ($7::int * interval '1 day') END, $8)`,
    [id, agency, name, phone, status, ageDays, touchDays, optOut]);
  return id;
}
async function mkFollowup(agency, lead, dueOffsetDays, extra = {}) {
  const id = randomUUID();
  await q(`INSERT INTO followups(id,agency_id,lead_id,due_at,channel,goal,assigned_to) VALUES($1,$2,$3, NOW() + ($4::int * interval '1 day'), 'whatsapp', $5, $6)`,
    [id, agency, lead, dueOffsetDays, extra.goal || null, extra.assigned || null]);
  return id;
}
const call = (token) => async (method, path, body) => {
  const r = await fetch(BASE + '/api/followup' + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data; try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
};

const A = await mkAgency('a'); const B = await mkAgency('b');
const a = call(A.token); const b = call(B.token);
const prop = randomUUID();
await q(`INSERT INTO properties(id,agency_id,title,type,zone,city,price) VALUES($1,$2,'Piso luminoso en Triana','piso','Triana','Sevilla',185000)`, [prop, A.id]);
const L1 = await mkLead(A.id, 'Lucía Abandonada', { status: 'nuevo', ageDays: 3 });
const L2 = await mkLead(A.id, 'Marcos Vencido', { status: 'interesado', ageDays: 20, touchDays: 10 });
const L3 = await mkLead(A.id, 'Elena Hoy', { status: 'contactado', ageDays: 9, touchDays: 5 });
const L4 = await mkLead(A.id, 'Nuevo Reciente', { status: 'nuevo', ageDays: 0 });
const L5 = await mkLead(A.id, 'Optout Pedro', { status: 'contactado', ageDays: 9, touchDays: 8, optOut: true });
const LB = await mkLead(B.id, 'Cliente de otra agencia', { status: 'nuevo', ageDays: 5 });
await q(`INSERT INTO property_interests(id,property_id,lead_id,agency_id,status) VALUES($1,$2,$3,$4,'interested')`, [randomUUID(), prop, L1, A.id]).catch((e) => console.log('  (interest seed:', e.message, ')'));
const F2 = await mkFollowup(A.id, L2, -2, { goal: 'follow_up' });
const F3 = await mkFollowup(A.id, L3, 0, { goal: 'visit_proposal' });
await q(`UPDATE followups SET due_at = date_trunc('day', NOW()) + interval '10 hours' WHERE id = $1`, [F3]); // hoy a las 10:00 UTC
const FB = await mkFollowup(B.id, LB, -1);

console.log('InmoFollow API');
let today;
await t('GET /today clasifica vencidos, hoy y abandonados', async () => {
  const r = await a('GET', '/today?fresh=1'); assert.equal(r.status, 200); today = r.data;
  assert.deepEqual(today.overdue.map((i) => i.lead.name), ['Marcos Vencido']);
  assert.ok(today.today.some((i) => i.lead.name === 'Elena Hoy'));
  const ab = today.abandoned.map((i) => i.lead.name);
  assert.ok(ab.includes('Lucía Abandonada') && ab.includes('Optout Pedro'));
  assert.ok(!ab.includes('Nuevo Reciente'), 'un lead de hoy no es abandonado');
  assert.ok(!ab.includes('Marcos Vencido'), 'con seguimiento pendiente no es abandonado');
});
await t('caché: dos lecturas seguidas comparten resultado y una escritura lo invalida', async () => {
  const r1 = await a('GET', '/today?fresh=1'); const r2 = await a('GET', '/today'); assert.equal(r2.data.generated_at, r1.data.generated_at);
  const r3 = await a('GET', '/today?fresh=1'); assert.notEqual(r3.data.generated_at, r1.data.generated_at);
});
await t('abandonado muestra el inmueble de interés y motivos legibles', async () => {
  const i = today.abandoned.find((x) => x.lead.name === 'Lucía Abandonada');
  assert.equal(i.property?.title, 'Piso luminoso en Triana'); assert.ok(i.reasons.length >= 1 && i.priority > 0 && i.priority <= 100);
});
await t('vencido indica días de retraso', async () => assert.equal(today.overdue[0].days_overdue, 2));
await t('aislamiento: la otra agencia solo ve lo suyo', async () => {
  const r = await b('GET', '/today?fresh=1'); const names = [...r.data.overdue, ...r.data.today, ...r.data.abandoned].map((i) => i.lead.name);
  assert.ok(names.includes('Cliente de otra agencia')); assert.ok(!names.some((n) => n.includes('Marcos') || n.includes('Lucía')));
});
await t('registrar contacto: completa seguimiento, crea el siguiente y avanza el estado', async () => {
  const r = await a('POST', `/leads/${L2}/log`, { channel: 'call', outcome: 'visit_scheduled', note: 'Visita el viernes', followup_id: F2, next: { in_days: 2, goal: 'post_visit' } });
  assert.equal(r.status, 201); assert.equal(r.data.status, 'visita_agendada'); assert.ok(r.data.next_followup?.id);
  const f = (await q('SELECT status FROM followups WHERE id=$1', [F2])).rows[0]; assert.equal(f.status, 'done');
  const act = (await q(`SELECT description FROM activities WHERE lead_id=$1 AND type='contact'`, [L2])).rows; assert.equal(act.length, 1); assert.match(act[0].description, /Visita el viernes/);
  const again = await a('GET', '/today?fresh=1'); assert.equal(again.data.overdue.length, 0);
});
await t('posponer suma contador y saca el elemento de hoy', async () => {
  const r = await a('PATCH', `/followups/${F3}`, { action: 'snooze', days: 1 }); assert.equal(r.status, 200);
  const f = (await q('SELECT snooze_count, due_at FROM followups WHERE id=$1', [F3])).rows[0]; assert.equal(f.snooze_count, 1);
  const again = await a('GET', '/today?fresh=1'); assert.ok(!again.data.today.some((i) => i.lead.name === 'Elena Hoy'));
});
await t('crear seguimiento para un abandonado lo saca de abandonados', async () => {
  const r = await a('POST', '/followups', { lead_id: L1, in_days: 1, channel: 'whatsapp', goal: 'first_contact' }); assert.equal(r.status, 201);
  const again = await a('GET', '/today?fresh=1'); assert.ok(!again.data.abandoned.some((i) => i.lead.name === 'Lucía Abandonada'));
});
await t('seguridad: no se puede tocar datos de otra agencia', async () => {
  assert.equal((await a('POST', `/leads/${LB}/log`, { channel: 'call', outcome: 'other' })).status, 404);
  assert.equal((await a('PATCH', `/followups/${FB}`, { action: 'done' })).status, 404);
  assert.equal((await a('POST', '/followups', { lead_id: LB, in_days: 1 })).status, 404);
  assert.equal((await a('POST', '/ai/message', { lead_id: LB })).status, 404);
  assert.equal((await a('POST', '/ai/summarize', { lead_id: LB, text: 'x'.repeat(40) })).status, 404);
  assert.equal((await a('GET', `/leads/${LB}`)).status, 404);
  assert.equal((await q('SELECT status FROM followups WHERE id=$1', [FB])).rows[0].status, 'pending');
});
await t('seguridad: inmueble de otra agencia rechazado', async () => {
  const otherProp = randomUUID(); await q(`INSERT INTO properties(id,agency_id,title,type,price,city) VALUES($1,$2,'Ajeno','piso',100000,'Sevilla')`, [otherProp, B.id]);
  assert.equal((await a('POST', '/followups', { lead_id: L1, in_days: 1, property_id: otherProp })).status, 404);
});
await t('seguridad: sin token => 401', async () => { const r = await fetch(BASE + '/api/followup/today'); assert.equal(r.status, 401); });
await t('validación: datos inválidos => 400 con mensaje', async () => {
  assert.equal((await a('POST', `/leads/${L1}/log`, { channel: 'paloma' })).status, 400);
  assert.equal((await a('POST', '/leads/no-es-uuid/log', {})).status, 400);
  assert.equal((await a('POST', '/followups', { lead_id: L1 })).status, 400);
  assert.equal((await a('POST', '/followups', { lead_id: L1, due_at: 'ayer' })).status, 400);
  assert.equal((await a('PATCH', `/followups/${F2}`, { action: 'explotar' })).status, 400);
  const r = await a('POST', '/ai/summarize', { text: 'corto' }); assert.equal(r.status, 400); assert.ok(r.data.error);
  assert.equal((await a('POST', '/ai/summarize', { text: 'x'.repeat(8001) })).status, 400);
});
await t('un seguimiento ya hecho no se puede volver a modificar (409)', async () => assert.equal((await a('PATCH', `/followups/${F2}`, { action: 'snooze' })).status, 409));
await t('mensaje: plantilla con nombre, inmueble y enlace de WhatsApp', async () => {
  const r = await a('POST', '/ai/message', { lead_id: L1, goal: 'first_contact', tone: 'cercano', channel: 'whatsapp' });
  assert.equal(r.status, 200); assert.equal(r.data.source, 'template'); assert.match(r.data.message, /Lucía/);
  assert.match(r.data.wa_url, /^https:\/\/wa\.me\/34600112233\?text=/); assert.doesNotMatch(r.data.message, /undefined|null/);
});
await t('mensaje: pedir IA sin clave cae a plantilla con aviso', async () => {
  const r = await a('POST', '/ai/message', { lead_id: L1, use_ai: true }); assert.equal(r.status, 200);
  if (!r.data.ai_available) { assert.equal(r.data.source, 'template'); assert.ok(r.data.warnings.length >= 1); }
});
await t('mensaje: contacto que no quiere WhatsApp => sin enlace y con aviso', async () => {
  const r = await a('POST', '/ai/message', { lead_id: L5, channel: 'whatsapp' }); assert.equal(r.data.wa_url, null); assert.ok(r.data.warnings.some((w) => /WhatsApp/.test(w)));
});
await t('mensaje: email trae asunto', async () => { const r = await a('POST', '/ai/message', { lead_id: L1, channel: 'email' }); assert.ok(r.data.subject); });
await t('resumen: extrae señales y sugiere seguimiento', async () => {
  const r = await a('POST', '/ai/summarize', { text: 'Cliente: Me interesa pero es caro, lo hablo con mi pareja y os digo algo el viernes.\nAgente: ¿Os viene bien visitarlo?' });
  assert.equal(r.status, 200); assert.equal(r.data.source, 'basic'); assert.ok(r.data.signals.objections.includes('precio')); assert.ok(r.data.next_steps.length >= 2); assert.ok(r.data.suggested_followup.due_at);
});
await t('resumen: guardar + crear seguimiento deja rastro en BD', async () => {
  const r = await a('POST', '/ai/summarize', { text: 'Me interesa el piso, ¿podemos verlo mañana por la tarde?', lead_id: L4, save: true, create_followup: true });
  assert.equal(r.status, 200); assert.equal(r.data.saved, true); assert.ok(r.data.followup_id);
  assert.equal((await q(`SELECT count(*)::int n FROM activities WHERE lead_id=$1 AND type='summary'`, [L4])).rows[0].n, 1);
  assert.equal((await q(`SELECT count(*)::int n FROM followups WHERE lead_id=$1 AND status='pending'`, [L4])).rows[0].n, 1);
});
await t('buscador de contactos acotado a la agencia', async () => {
  const r = await a('GET', '/leads/search?q=Elena'); assert.equal(r.data.length, 1); const rb = await a('GET', '/leads/search?q=otra%20agencia'); assert.equal(rb.data.length, 0);
});
await t('inyección SQL en búsqueda no rompe ni filtra', async () => { const r = await a('GET', "/leads/search?q=' OR 1=1 --"); assert.equal(r.status, 200); assert.equal(r.data.length, 0); });
await t('rendimiento: /today con 3.000 contactos y 800 seguimientos', async () => {
  await q(`INSERT INTO leads(id,agency_id,name,phone,status,created_at,updated_at)
           SELECT gen_random_uuid(),$1,'Masivo '||g,'6'||lpad(g::text,8,'0'), (ARRAY['nuevo','contactado','interesado','visita_agendada','negociacion'])[1+g%5], NOW()-((g%30)||' days')::interval, NOW() FROM generate_series(1,3000) g`, [A.id]);
  await q(`INSERT INTO followups(id,agency_id,lead_id,due_at,channel) SELECT gen_random_uuid(),$1,id,NOW()-((random()*5)::int||' days')::interval,'call' FROM leads WHERE agency_id=$1 AND name LIKE 'Masivo %' LIMIT 800`, [A.id]);
  const t0 = performance.now(); const r = await a('GET', '/today?fresh=1'); const ms = Math.round(performance.now() - t0);
  console.log(`      /today: ${ms} ms · vencidos+hoy=${r.data.summary.overdue + r.data.summary.today} · abandonados=${r.data.summary.abandoned}`);
  assert.equal(r.status, 200); assert.ok(ms < 1500, `demasiado lento: ${ms} ms`);
});
await t('totales exactos aunque haya más elementos que los que se listan', async () => {
  const r = await a('GET', '/today?fresh=1');
  const due = (await q(`SELECT count(*)::int n FROM followups f JOIN leads l ON l.id=f.lead_id WHERE f.agency_id=$1 AND f.status='pending' AND l.status<>'cerrado'
                        AND f.due_at < ((date_trunc('day', NOW() AT TIME ZONE 'Europe/Madrid') + interval '1 day') AT TIME ZONE 'Europe/Madrid')`, [A.id])).rows[0].n;
  assert.equal(r.data.summary.overdue + r.data.summary.today, due);
  const ab = (await q(`SELECT count(*)::int n FROM leads l WHERE l.agency_id=$1 AND l.status<>'cerrado' AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.lead_id=l.id AND f.status='pending')
     AND COALESCE(l.last_contact_at, l.last_activity, l.created_at) <= NOW() - (CASE l.status WHEN 'nuevo' THEN 1 WHEN 'contactado' THEN 4 WHEN 'interesado' THEN 5 WHEN 'visita_agendada' THEN 3 WHEN 'negociacion' THEN 3 WHEN 'reserva' THEN 2 ELSE 99999 END) * interval '1 day'`, [A.id])).rows[0].n;
  assert.equal(r.data.summary.abandoned, ab);
  assert.ok(r.data.summary.overdue + r.data.summary.today > r.data.overdue.length + r.data.today.length || r.data.truncated === false);
  assert.ok(r.data.overdue.length + r.data.today.length <= 200 && r.data.abandoned.length <= 30);
  console.log(`      totales: vencidos+hoy=${r.data.summary.overdue + r.data.summary.today} (mostrados ${r.data.overdue.length + r.data.today.length}), abandonados=${r.data.summary.abandoned} (mostrados ${r.data.abandoned.length})`);
});

console.log(`\n${ok} OK, ${ko} fallos`);
await pool.end();
process.exit(ko ? 1 : 0);
