import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

// Pruebas de flujo de la versión simple (sin WhatsApp, agentes ni automatizaciones).
// Uso: BASE_URL=http://localhost:3002 DATABASE_URL=... node tests/simple-flow.test.js
const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';
let passed = 0, failed = 0;

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json ?? text };
}
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { failed++; console.error(`not ok - ${name}\n  ${e.message}`); }
}
async function newUser() {
  const id = crypto.randomUUID();
  const email = `flow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
  const { status, body } = await request('/api/auth/social-login-or-register', { method: 'POST', body: { email, name: 'Flow Test', supabase_uid: id } });
  assert.equal(status, 200, JSON.stringify(body));
  return { token: body.user.token, agencyId: body.agency?.id || body.user.agency_id };
}

const A = await newUser();
const B = await newUser();
const future = (h) => new Date(Date.now() + h * 3600e3).toISOString();
let leadId, apptId, apptToken;

await test('rutas eliminadas ya no responden (checkout, agentes, automatizaciones, conversaciones, whatsapp)', async () => {
  for (const [m, p] of [['POST', '/api/checkout'], ['GET', '/api/agents'], ['GET', '/api/automations'], ['GET', '/api/templates'], ['GET', '/api/conversations'], ['POST', '/webhooks/whatsapp'], ['GET', '/webhooks/meta']]) {
    const r = await request(p, { method: m, token: A.token, body: m === 'POST' ? {} : undefined });
    assert.ok(r.status === 404, `${m} ${p} devolvió ${r.status}`);
  }
});

await test('endpoints internos exigen login', async () => {
  assert.equal((await request('/api/queue/stats')).status, 401);
  assert.equal((await request('/api/realtime/clients')).status, 401);
  assert.equal((await request('/api/queue/stats', { token: A.token })).status, 200);
});

await test('crear lead con email y teléfono', async () => {
  const r = await request('/api/leads', { method: 'POST', token: A.token, body: { name: 'María Prueba', email: 'maria@example.com', phone: '654321098', source: 'web' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  leadId = r.body.id;
});

await test('programar cita: 201 y confirmación solo por email', async () => {
  const r = await request(`/api/leads/${leadId}/appointments`, { method: 'POST', token: A.token, body: { type: 'physical', starts_at: future(48), ends_at: future(49), location: 'Oficina' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(!('whatsapp_sent' in r.body), 'la respuesta aún menciona whatsapp_sent');
  // Sin SendGrid configurado no se envía nada: no se puede decir que se envió.
  assert.equal(r.body.email_sent, false, 'dice que envió un email sin tener email configurado');
  apptId = r.body.appointment?.id || r.body.id;
  apptToken = r.body.appointment?.client_token;
  assert.ok(apptId, 'sin id de cita');
});

await test('listar citas del lead', async () => {
  const r = await request(`/api/leads/${leadId}/appointments`, { token: A.token });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body) && r.body.length >= 1);
  apptToken = apptToken || r.body[0].client_token;
});

await test('página pública de la cita y confirmación del cliente', async () => {
  assert.ok(apptToken, 'sin token público');
  const g = await request(`/api/public/appointment/${apptToken}`);
  assert.equal(g.status, 200, JSON.stringify(g.body));
  const c = await request(`/api/public/appointment/${apptToken}/confirm`, { method: 'POST', body: {} });
  assert.equal(c.status, 200, JSON.stringify(c.body));
});

await test('agencia B no puede cancelar la cita de A', async () => {
  const r = await request(`/api/appointments/${apptId}/cancel`, { method: 'POST', token: B.token, body: {} });
  assert.ok([403, 404].includes(r.status), `devolvió ${r.status}`);
});

await test('tareas del lead: crear y completar', async () => {
  const t = await request(`/api/leads/${leadId}/tasks`, { method: 'POST', token: A.token, body: { title: 'Llamar a María', due_date: future(24) } });
  assert.ok([200, 201].includes(t.status), JSON.stringify(t.body));
  const id = t.body.id || t.body.task?.id;
  const u = await request(`/api/leads/${leadId}/tasks/${id}`, { method: 'PATCH', token: A.token, body: { completed: true } });
  assert.equal(u.status, 200, JSON.stringify(u.body));
});

await test('cambio de etapa del pipeline', async () => {
  const r = await request(`/api/leads/${leadId}/status`, { method: 'PATCH', token: A.token, body: { status: 'contactado' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

await test('dashboard: tarjetas reales y sin agentes/mensajes', async () => {
  const r = await request('/api/stats/dashboard', { token: A.token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const labels = r.body.liveStats.map(s => s.label);
  assert.deepEqual(labels, ['Leads sin contactar', 'Leads hoy', 'Visitas próximas', 'Propiedades disponibles']);
  assert.ok(r.body.liveStats[2].value >= 1, 'debería contar la cita futura');
});

await test('inmuebles: crear y listar', async () => {
  const c = await request('/api/properties', { method: 'POST', token: A.token, body: { title: 'Piso en Sevilla', price: 180000, city: 'Sevilla', type: 'piso', operation: 'venta', bedrooms: 3, bathrooms: 2, area: 95 } });
  assert.ok([200, 201].includes(c.status), JSON.stringify(c.body));
  const l = await request('/api/properties', { token: A.token });
  assert.equal(l.status, 200);
});

await test('entrada de leads por email de portal (token propio, duplicados)', async () => {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const token = crypto.randomBytes(24).toString('hex');
  await db.query('UPDATE agencies SET portal_inbox_token = $1 WHERE id = $2', [token, A.agencyId]);
  await db.end();
  const payload = { from: 'Idealista <no-reply@idealista.com>', subject: 'Nuevo contacto sobre tu anuncio', text: 'Nombre: Pedro Portal\nTeléfono: 611 22 33 44\nEmail: pedro@example.com\nMensaje: Me interesa el piso\nReferencia: 999' };
  const r1 = await request(`/api/webhooks/portal-leads/${token}`, { method: 'POST', body: payload });
  assert.ok([200, 201].includes(r1.status) && r1.body.created !== false, JSON.stringify(r1.body));
  const r2 = await request(`/api/webhooks/portal-leads/${token}`, { method: 'POST', body: payload });
  assert.ok(r2.body.created === false || r2.body.duplicate, `duplicado no detectado: ${JSON.stringify(r2.body)}`);
  const bad = await request(`/api/webhooks/portal-leads/${'x'.repeat(40)}`, { method: 'POST', body: payload });
  assert.equal(bad.status, 404);
});

await test('aislamiento: B no ve el lead del portal de A', async () => {
  const r = await request('/api/leads', { token: B.token });
  assert.equal(r.status, 200);
  assert.equal((r.body.leads || r.body).length, 0);
});

await test('captación de emails de la landing: guarda, detecta duplicados y valida', async () => {
  const email = `lm-${Date.now()}@test.com`;
  const ok = await request('/api/marketing/lead-magnet', { method: 'POST', body: { email, name: 'Visitante', source: 'test' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.already_subscribed, false);
  const dup = await request('/api/marketing/lead-magnet', { method: 'POST', body: { email } });
  assert.equal(dup.body.already_subscribed, true);
  assert.equal((await request('/api/marketing/lead-magnet', { method: 'POST', body: { email: 'no-es-un-email' } })).status, 400);
  assert.ok([401, 403].includes((await request('/api/marketing/leads', { token: A.token })).status), 'un usuario normal no debe ver la lista');
});

await test('ajustes: solo se guardan campos soportados y no hay pruebas de URLs arbitrarias', async () => {
  const save = await request('/api/agency/config', { method: 'PATCH', token: A.token, body: { phone: '954000000', slack_webhook_url: 'http://169.254.169.254/', smtp_host: 'smtp.x.com', visit_terms: 'Texto {agencia}' } });
  assert.equal(save.status, 200, JSON.stringify(save.body));
  const cfg = await request('/api/agency/config', { token: A.token });
  assert.equal(cfg.body.phone, '954000000');
  assert.equal(cfg.body.visit_terms, 'Texto {agencia}');
  assert.ok(!cfg.body.slack_webhook_url && !cfg.body.smtp_host, 'guardó campos que ya no existen');
  const t = await request('/api/agency/test-integration', { method: 'POST', token: A.token, body: { integration: 'webhooks', config: { zapier_webhook_url: 'http://169.254.169.254/' } } });
  assert.match(JSON.stringify(t.body), /desconocida/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
