// Fase 2-4: KPIs, visitas, alertas por clase, reglas configurables, agenda, calendario, ficha de inmueble y permisos.
// Uso: DATABASE_URL=... SUPABASE_JWT_SECRET=... BASE_URL=http://localhost:3002 node tests/followup-fase2.test.mjs
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3002';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p);
let ok = 0, ko = 0;
const t = async (n, fn) => { try { await fn(); ok++; console.log('  ✓', n); } catch (e) { ko++; console.error('  ✗', n, '\n   ', e.message); } };
const stamp = Date.now();

async function mkAgency(label) { const id = randomUUID(); await q(`INSERT INTO agencies(id,name,slug,plan,plan_status) VALUES($1::uuid,$2,$3,'starter','active')`, [id, `Agencia ${label}`, `${label}-${id.slice(0, 6)}`]); return id; }
async function mkUser(agency, label, role = 'admin') {
  const id = randomUUID(); const email = `${label}-${stamp}@test.es`;
  await q(`INSERT INTO auth.users(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING`, [id, email]).catch(() => {});
  await q(`INSERT INTO users(id,email,name,role,agency_id,active) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT (id) DO UPDATE SET agency_id=EXCLUDED.agency_id, role=EXCLUDED.role, name=EXCLUDED.name, active=true`, [id, email, `Agente ${label}`, role, agency]);
  return { id, token: jwt.sign({ sub: id, email }, process.env.SUPABASE_JWT_SECRET) };
}
const client = (token) => async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); let d; try { d = await r.json(); } catch { d = null; } return { status: r.status, data: d }; };
async function mkLead(agency, name, { status = 'nuevo', ageDays = 0, touchDays = null, priority = 'media', assigned = null } = {}) {
  const id = randomUUID();
  await q(`INSERT INTO leads(id,agency_id,name,phone,status,priority,assigned_to,created_at,updated_at,last_contact_at)
           VALUES($1,$2,$3,'600112233',$4,$5,$6, NOW() - ($7::int * interval '1 day'), NOW(), CASE WHEN $8::int IS NULL THEN NULL ELSE NOW() - ($8::int * interval '1 day') END)`,
    [id, agency, name, status, priority, assigned, ageDays, touchDays]);
  return id;
}
async function mkAppt(agency, lead, { offsetHours, status = 'scheduled', property = null, type = 'physical' }) {
  const id = randomUUID(); const start = new Date(Date.now() + offsetHours * 3600000); const end = new Date(start.getTime() + 3600000);
  await q(`INSERT INTO appointments(id,agency_id,lead_id,type,status,starts_at,ends_at,timezone,property_id,client_token) VALUES($1,$2,$3,$4,$5,$6,$7,'Europe/Madrid',$8,$9)`, [id, agency, lead, type, status, start.toISOString(), end.toISOString(), property, randomUUID()]);
  return id;
}
async function mkFollowup(agency, lead, dueDays, { status = 'pending', assigned = null, property = null } = {}) {
  const id = randomUUID();
  await q(`INSERT INTO followups(id,agency_id,lead_id,property_id,assigned_to,due_at,channel,status,completed_at) VALUES($1,$2,$3,$4,$5, NOW() + ($6::numeric * interval '1 day'),'whatsapp',$7, CASE WHEN $7='done' THEN NOW() ELSE NULL END)`, [id, agency, lead, property, assigned, dueDays, status]);
  return id;
}
const all = (d) => [...d.overdue, ...d.today, ...d.abandoned, ...d.visits_no_followup, ...d.visits_unconfirmed];
const byName = (d, n) => all(d).find((i) => i.lead.name === n);

const AG = await mkAgency('f2'); const admin = await mkUser(AG, 'f2admin', 'admin'); const agent = await mkUser(AG, 'f2agent', 'comercial');
const AG2 = await mkAgency('f2b'); const other = await mkUser(AG2, 'f2other', 'admin');
const a = client(admin.token); const ag = client(agent.token); const o = client(other.token);

const prop = randomUUID();
await q(`INSERT INTO properties(id,agency_id,title,type,city,zone,price,images) VALUES($1,$2,'Ático con terraza','piso','Sevilla','Triana',250000,$3)`, [prop, AG, '["https://fotos.test/atico.jpg","https://fotos.test/2.jpg"]']);
const propBad = randomUUID();
await q(`INSERT INTO properties(id,agency_id,title,type,city,price,images) VALUES($1,$2,'Foto peligrosa','piso','Sevilla',100000,$3)`, [propBad, AG, '["javascript:alert(1)"]']);
const propOther = randomUUID();
await q(`INSERT INTO properties(id,agency_id,title,type,city,price) VALUES($1,$2,'Ajeno','piso','Sevilla',100000)`, [propOther, AG2]);

const Lvencido = await mkLead(AG, 'Vencido tres días', { status: 'interesado', ageDays: 20, touchDays: 9 });
const Lhoy = await mkLead(AG, 'Toca hoy', { status: 'interesado', ageDays: 10, touchDays: 4 });
const Lneg = await mkLead(AG, 'En negociación parado', { status: 'negociacion', ageDays: 20, touchDays: 5 });
const Linact = await mkLead(AG, 'Inactivo mucho', { status: 'contactado', ageDays: 90, touchDays: 45 });
const Lalta = await mkLead(AG, 'Prioridad alta parado', { status: 'contactado', ageDays: 20, touchDays: 6, priority: 'alta' });
const Lnuevo = await mkLead(AG, 'Nuevo sin tocar', { status: 'nuevo', ageDays: 3 });
const Lperdido = await mkLead(AG, 'Contacto perdido', { status: 'perdido', ageDays: 30, touchDays: 20 });
const Lcerrado = await mkLead(AG, 'Contacto cerrado', { status: 'cerrado', ageDays: 30, touchDays: 20 });
const Lvisita = await mkLead(AG, 'Visitó y nadie llamó', { status: 'visita_agendada', ageDays: 15, touchDays: 8 });
const Lvisita2 = await mkLead(AG, 'Visitó pero ya se le llamó', { status: 'visita_agendada', ageDays: 15, touchDays: 8 });
const Lconf = await mkLead(AG, 'Visita mañana sin confirmar', { status: 'visita_agendada', ageDays: 5, touchDays: 1 });
const Lconf2 = await mkLead(AG, 'Visita mañana confirmada', { status: 'visita_agendada', ageDays: 5, touchDays: 1 });
const Lcanc = await mkLead(AG, 'Visita cancelada', { status: 'visita_agendada', ageDays: 15, touchDays: 8 });
const Lagente = await mkLead(AG, 'Asignado a la agente', { status: 'interesado', ageDays: 10, touchDays: 4, assigned: agent.id });
const LB = await mkLead(AG2, 'Otra agencia', { status: 'nuevo', ageDays: 5 });

const Fvencido = await mkFollowup(AG, Lvencido, -3); await mkFollowup(AG, Lhoy, 0.001, { property: prop });
await q(`UPDATE followups SET due_at = date_trunc('day', NOW()) + interval '10 hours' WHERE lead_id=$1`, [Lhoy]);
await mkFollowup(AG, Lperdido, -2); await mkFollowup(AG, Lcerrado, -2);
await mkFollowup(AG, Lagente, 3, { assigned: agent.id }); await mkFollowup(AG, Lneg, 5);
await mkFollowup(AG, Lalta, -1, { status: 'done' }); // completado
await q(`UPDATE followups SET due_at = NOW() + interval '5 days' WHERE lead_id=$1 AND status='pending'`, [Lneg]);
await q(`INSERT INTO property_interests(id,property_id,lead_id,agency_id,status) VALUES($1,$2,$3,$4,'interested')`, [randomUUID(), prop, Lnuevo, AG]).catch(() => {});
await mkAppt(AG, Lvisita, { offsetHours: -72, property: prop }); await mkAppt(AG, Lvisita2, { offsetHours: -72 }); await mkAppt(AG, Lcanc, { offsetHours: -72, status: 'cancelled' });
await q(`INSERT INTO activities(id,agency_id,lead_id,type,description,created_at) VALUES($1,$2,$3,'contact','Llamada posterior',NOW() - interval '1 day')`, [randomUUID(), AG, Lvisita2]);
await mkAppt(AG, Lconf, { offsetHours: 20, status: 'scheduled' }); await mkAppt(AG, Lconf2, { offsetHours: 20, status: 'confirmed' });
const Lcomp = await mkLead(AG, 'Visita completada sin llamada', { status: 'visita_agendada', ageDays: 15, touchDays: 8 }); await mkAppt(AG, Lcomp, { offsetHours: -48, status: 'completed', type: 'online' });
const Lnoshow = await mkLead(AG, 'No se presentó', { status: 'visita_agendada', ageDays: 15, touchDays: 8 }); await mkAppt(AG, Lnoshow, { offsetHours: -48, status: 'no_show' });

console.log('Fase 2-4: agenda, reglas y KPIs');
let d;
await t('los contactos perdidos o cerrados no aparecen en ninguna lista (ni con seguimientos pendientes)', async () => {
  d = (await a('GET', '/api/followup/today?fresh=1')).data; const names = all(d).map((i) => i.lead.name);
  assert.ok(!names.includes('Contacto perdido') && !names.includes('Contacto cerrado'));
});
await t('clasificación: vencido 3 días => atención inmediata', async () => assert.equal(byName(d, 'Vencido tres días').alert_class, 'inmediata'));
await t('clasificación: toca hoy => seguimiento recomendado y con foto del inmueble', async () => { const i = byName(d, 'Toca hoy'); assert.equal(i.alert_class, 'recomendada'); assert.equal(i.property.photo, 'https://fotos.test/atico.jpg'); });
await t('clasificación: negociación sin acción => inmediata; prioridad alta => inmediata', async () => {
  assert.equal(byName(d, 'Prioridad alta parado').alert_class, 'inmediata'); assert.equal(byName(d, 'Prioridad alta parado').lead.priority, 'alta');
});
await t('clasificación: inactivo 45 días => sin actividad; nuevo sin contactar => inmediata', async () => {
  assert.equal(byName(d, 'Inactivo mucho').alert_class, 'sin_actividad'); assert.equal(byName(d, 'Nuevo sin tocar').alert_class, 'inmediata');
});
await t('visitas: pasada o completada y sin contacto posterior => aparece; con llamada posterior, cancelada o no presentado => no', async () => {
  const names = d.visits_no_followup.map((i) => i.lead.name).sort();
  assert.deepEqual(names, ['Visita completada sin llamada', 'Visitó y nadie llamó']); const v = d.visits_no_followup.find((i) => i.lead.name === 'Visitó y nadie llamó');
  assert.equal(v.alert_class, 'inmediata'); assert.ok(v.facts.some((f) => /Visita del/.test(f))); assert.equal(v.recommendation.goal, 'post_visit'); assert.equal(v.property.title, 'Ático con terraza');
});
await t('visitas: próxima sin confirmar => pendiente de confirmar; confirmada => no', async () => {
  assert.deepEqual(d.visits_unconfirmed.map((i) => i.lead.name), ['Visita mañana sin confirmar']); assert.equal(d.visits_unconfirmed[0].alert_class, 'pendiente_confirmar');
});
await t('hechos y recomendación van separados en cada elemento', async () => {
  for (const i of all(d)) { assert.ok(Array.isArray(i.facts) && i.facts.length >= 2, i.lead.name); assert.ok(i.recommendation?.text); assert.ok(!i.facts.includes(i.recommendation.text)); }
  assert.ok(!/perdi[óo] el inter[ée]s|ha perdido/i.test(JSON.stringify(d)));
});
await t('KPIs: contactos activos, nuevos, por contactar, inactivos y visitas', async () => {
  const k = d.kpis;
  assert.equal(k.active_contacts, 14); // 14 de la agencia - perdido - cerrado
  assert.ok(k.new_week >= 1 && k.to_contact >= 1); assert.equal(k.inactive, 1); assert.equal(k.visits_no_followup, 2);
  assert.equal(k.visits_pending, 2); // solo las dos de mañana: las pasadas, canceladas, completadas y no presentadas no cuentan
});
await t('la foto con esquema peligroso no se entrega', async () => {
  const L = await mkLead(AG, 'Con foto mala', { status: 'interesado', ageDays: 10, touchDays: 1 }); await mkFollowup(AG, L, -1);
  await q(`UPDATE followups SET property_id=$1 WHERE lead_id=$2`, [propBad, L]);
  const r = (await a('GET', '/api/followup/today?fresh=1')).data; assert.equal(byName(r, 'Con foto mala').property.photo, null);
});
await t('registrar un contacto elimina la alerta de visita sin seguimiento', async () => {
  assert.equal((await a('POST', `/api/followup/leads/${Lvisita}/log`, { channel: 'call', outcome: 'answered', next: { in_days: 3 } })).status, 201);
  const r = (await a('GET', '/api/followup/today?fresh=1')).data; assert.deepEqual(r.visits_no_followup.map((i) => i.lead.name), ['Visita completada sin llamada']);
});

console.log('Reglas configurables y permisos');
await t('ajustes: valores por defecto visibles', async () => { const r = await a('GET', '/api/followup/settings'); assert.equal(r.data.settings.inactive_days, 30); assert.equal(r.data.settings.stale_days.contactado, 4); assert.equal(r.data.can_edit, true); });
await t('ajustes: un administrador cambia el umbral y la agenda lo respeta', async () => {
  const L = await mkLead(AG, 'Contactado hace 3 días', { status: 'contactado', ageDays: 10, touchDays: 3 });
  assert.ok(!byName((await a('GET', '/api/followup/today?fresh=1')).data, 'Contactado hace 3 días'), 'con 4 días de umbral aún no debe salir');
  assert.equal((await a('PUT', '/api/followup/settings', { stale_days: { contactado: 2 } })).status, 200);
  assert.ok(byName((await a('GET', '/api/followup/today?fresh=1')).data, 'Contactado hace 3 días'), 'con 2 días de umbral sí');
});
await t('ajustes: el umbral de inactividad cambia la clase de la alerta', async () => {
  await mkLead(AG, 'Contactado hace 10 días', { status: 'contactado', ageDays: 40, touchDays: 10 });
  assert.equal(byName((await a('GET', '/api/followup/today?fresh=1')).data, 'Contactado hace 10 días').alert_class, 'recomendada');
  await a('PUT', '/api/followup/settings', { inactive_days: 7 });
  const r = (await a('GET', '/api/followup/today?fresh=1')).data;
  assert.equal(byName(r, 'Contactado hace 10 días').alert_class, 'sin_actividad'); assert.equal(r.settings.inactive_days, 7);
});
await t('ajustes: un agente sin rol de administrador no puede cambiarlos (403) pero sí leerlos', async () => {
  assert.equal((await ag('PUT', '/api/followup/settings', { inactive_days: 10 })).status, 403);
  const r = await ag('GET', '/api/followup/settings'); assert.equal(r.status, 200); assert.equal(r.data.can_edit, false); assert.equal(r.data.settings.inactive_days, 7);
});
await t('ajustes: valores fuera de rango se rechazan (400)', async () => {
  assert.equal((await a('PUT', '/api/followup/settings', { inactive_days: 3 })).status, 400);
  assert.equal((await a('PUT', '/api/followup/settings', { stale_days: { nuevo: 0 } })).status, 400);
  assert.equal((await a('PUT', '/api/followup/settings', { visit_followup_days: 99 })).status, 400);
});
await t('ajustes: cada agencia tiene los suyos y se pueden restablecer', async () => {
  assert.equal((await o('GET', '/api/followup/settings')).data.settings.inactive_days, 30);
  const r = await a('POST', '/api/followup/settings/reset'); assert.equal(r.data.settings.inactive_days, 30); assert.equal(r.data.settings.stale_days.contactado, 4);
});

console.log('Agenda, calendario y fichas');
await t('agenda: próximos, completados y por día', async () => {
  const up = (await a('GET', '/api/followup/agenda?view=upcoming')).data.items.map((i) => i.lead.name);
  assert.ok(up.includes('En negociación parado') && up.includes('Asignado a la agente'));
  const done = (await a('GET', '/api/followup/agenda?view=completed')).data.items; assert.ok(done.some((i) => i.lead.name === 'Prioridad alta parado' && i.status === 'done'));
  const today = new Date().toISOString().slice(0, 10); const day = (await a('GET', `/api/followup/agenda?view=day&date=${today}`)).data; assert.ok(day.items.some((i) => i.lead.name === 'Toca hoy'));
  assert.equal((await a('GET', '/api/followup/agenda?view=day&date=ayer')).status, 400); assert.equal((await a('GET', '/api/followup/agenda?view=nada')).status, 400);
});
await t('agenda "solo mis contactos" filtra por agente', async () => {
  const r = (await ag('GET', '/api/followup/agenda?view=upcoming&mine=1')).data.items.map((i) => i.lead.name); assert.deepEqual(r, ['Asignado a la agente']);
});
await t('agenda por agente: cuenta pendientes por responsable', async () => {
  const r = (await a('GET', '/api/followup/agenda?view=agents')).data.agents; const me = r.find((x) => x.name === 'Agente f2agent'); assert.ok(me && me.upcoming === 1);
});
await t('calendario: cuenta seguimientos y visitas por día del mes', async () => {
  const m = new Date().toISOString().slice(0, 7); const r = await a('GET', `/api/followup/calendar?month=${m}`); assert.equal(r.status, 200);
  const total = Object.values(r.data.days).reduce((s, x) => s + x.pending + x.done + x.visits, 0); assert.ok(total >= 3, `total ${total}`);
  assert.equal((await a('GET', '/api/followup/calendar?month=2026-13')).status, 400);
});
await t('prioridad y tipo de cliente: se guardan, se validan y respetan la agencia', async () => {
  assert.equal((await a('PATCH', `/api/followup/leads/${Lhoy}/meta`, { priority: 'alta', client_type: 'comprador' })).status, 200);
  const l = (await q('SELECT priority, client_type FROM leads WHERE id=$1', [Lhoy])).rows[0]; assert.deepEqual(l, { priority: 'alta', client_type: 'comprador' });
  assert.equal((await a('PATCH', `/api/followup/leads/${Lhoy}/meta`, { priority: 'urgentisima' })).status, 400);
  assert.equal((await a('PATCH', `/api/followup/leads/${Lhoy}/meta`, {})).status, 400);
  assert.equal((await o('PATCH', `/api/followup/leads/${Lhoy}/meta`, { priority: 'baja' })).status, 404);
  assert.equal((await a('PATCH', `/api/leads/${Lhoy}`, { priority: 'baja', client_type: 'inquilino' })).status, 200);
  assert.equal((await a('PATCH', `/api/leads/${Lhoy}`, { priority: 'xxx' })).status, 400);
  assert.equal((await a('PATCH', `/api/leads/${Lhoy}`, { client_type: 'marciano' })).status, 400);
});
await t('ficha del contacto incluye prioridad, tipo y visitas', async () => {
  const r = (await a('GET', `/api/followup/leads/${Lvisita}`)).data; assert.equal(r.lead.priority, 'media'); assert.ok(r.appointments.length >= 1);
});
await t('ficha del inmueble: interesados, visitas y seguimientos reales', async () => {
  const r = await a('GET', `/api/followup/property/${prop}`); assert.equal(r.status, 200);
  assert.equal(r.data.property.photo, 'https://fotos.test/atico.jpg'); assert.ok(r.data.counts.visits_done >= 1); assert.ok(r.data.pending_followups.some((f) => f.name === 'Toca hoy'));
});
await t('ficha del inmueble: otra agencia => 404 y sin datos cruzados', async () => {
  assert.equal((await o('GET', `/api/followup/property/${prop}`)).status, 404); assert.equal((await a('GET', `/api/followup/property/${propOther}`)).status, 404);
  assert.equal((await a('GET', '/api/followup/property/no-uuid')).status, 400);
});
await t('aislamiento: la otra agencia no ve nada de esta en ninguna vista', async () => {
  const t2 = (await o('GET', '/api/followup/today?fresh=1')).data; const names = all(t2).map((i) => i.lead.name); assert.ok(names.every((n) => n === 'Otra agencia'));
  assert.equal(t2.kpis.active_contacts, 1);
  assert.deepEqual((await o('GET', '/api/followup/agenda?view=upcoming')).data.items, []);
});

console.log(`\n${ok} OK, ${ko} fallos`);
await pool.end(); process.exit(ko ? 1 : 0);
