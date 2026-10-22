import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

// Flujos de "Protege tu comisión" (partes de visita, encargos, informe al propietario)
// y de "Anuncio sin multas" (comprobación de cumplimiento).
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
  const email = `vis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
  const { status, body } = await request('/api/auth/social-login-or-register', { method: 'POST', body: { email, name: 'Agente Test', supabase_uid: id } });
  assert.equal(status, 200, JSON.stringify(body));
  return { token: body.user.token, agencyId: body.agency?.id || body.user.agency_id };
}
const iso = (days) => new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10);
// PNG 1x1 válido
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const A = await newUser();
const B = await newUser();
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
let propId, visit, agreement;

await test('inmueble con campos de cumplimiento: crear y comprobar', async () => {
  const c = await request('/api/properties', { method: 'POST', token: A.token, body: { title: 'Ático en Sevilla', price: 250000, city: 'Sevilla', province: 'Sevilla', type: 'piso', operation: 'venta', surface: 90 } });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  propId = c.body.id;
  const r1 = await request(`/api/properties/${propId}/compliance`, { token: A.token });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.status, 'error');
  const p = await request(`/api/properties/${propId}`, { method: 'PATCH', token: A.token, body: { fees_info: 'Honorarios 3 % + IVA a cargo del vendedor', energy_certificate: 'C' } });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.fees_info, 'Honorarios 3 % + IVA a cargo del vendedor');
  const r2 = await request(`/api/properties/${propId}/compliance`, { token: A.token });
  assert.equal(r2.body.status, 'ok', JSON.stringify(r2.body.checks.filter(c => !c.ok)));
});

await test('el listado incluye el resumen de cumplimiento', async () => {
  const l = await request('/api/properties', { token: A.token });
  const prop = l.body.properties.find((x) => x.id === propId);
  assert.deepEqual(Object.keys(prop.compliance).sort(), ['errors', 'status', 'warnings']);
  assert.equal(prop.compliance.status, 'ok');
});

await test('"Mejora IA" siempre incluye honorarios y etiqueta en el texto', async () => {
  const r = await request(`/api/properties/${propId}/improve-ai`, { method: 'POST', token: A.token, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.improved.description, /Honorarios y gastos: Honorarios 3 %/);
  assert.match(r.body.improved.description, /Certificado energético: C/);
  assert.ok(r.body.compliance);
});

await test('alquiler en Cataluña sin cédula: error; con cédula: ok', async () => {
  const c = await request('/api/properties', { method: 'POST', token: A.token, body: { title: 'Piso Barcelona', price: 900, city: 'Barcelona', province: 'Barcelona', type: 'piso', operation: 'rent', surface: 60, fees_info: 'Sin honorarios para el inquilino', energy_certificate: 'E' } });
  const id = c.body.id;
  assert.ok((await request(`/api/properties/${id}/compliance`, { token: A.token })).body.checks.some((x) => x.id === 'cedula' && !x.ok));
  await request(`/api/properties/${id}`, { method: 'PATCH', token: A.token, body: { cedula_habitabilidad: 'HAB-998877' } });
  assert.equal((await request(`/api/properties/${id}/compliance`, { token: A.token })).body.status, 'ok');
});

await test('parte de visita: crear pendiente con enlace público', async () => {
  const r = await request('/api/visit-reports', { method: 'POST', token: A.token, body: { property_id: propId, visitor_name: 'Laura Gómez', visitor_phone: '600123123' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'pending');
  assert.match(r.body.public_path, /^\/visita\/[a-f0-9]{48}$/);
  visit = r.body;
});

await test('página pública del parte: datos mínimos, sin datos internos', async () => {
  const r = await request(`/api/public/visit/${visit.token}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'pending');
  assert.equal(r.body.property.title, 'Ático en Sevilla');
  assert.match(r.body.terms_text, /me ha mostrado el inmueble/);
  assert.equal(r.body.signature_image, undefined);
  assert.equal((await request(`/api/public/visit/${'a'.repeat(48)}`)).status, 404);
  assert.equal((await request('/api/public/visit/corto')).status, 404);
});

await test('firma: valida consentimiento, contacto y firma', async () => {
  const sign = (b) => request(`/api/public/visit/${visit.token}/sign`, { method: 'POST', body: b });
  assert.equal((await sign({ visitor_name: 'Laura Gómez', visitor_phone: '600123123', signature_name: 'Laura Gómez' })).status, 400); // sin consentimiento
  assert.equal((await sign({ visitor_name: 'Laura Gómez', consent_data: true, signature_name: 'Laura Gómez' })).status, 400);          // sin contacto
  assert.equal((await sign({ visitor_name: 'Laura Gómez', visitor_phone: '600123123', consent_data: true })).status, 400);              // sin firma
  assert.equal((await sign({ visitor_name: 'Laura Gómez', visitor_phone: '600123123', consent_data: true, signature_image: 'data:text/html;base64,AAAA' })).status, 400);
  assert.equal((await sign({ visitor_name: 'La', visitor_phone: '600123123', consent_data: true, signature_name: 'La' })).status, 400);
});

await test('firma correcta y no se puede firmar dos veces', async () => {
  const ok = await request(`/api/public/visit/${visit.token}/sign`, { method: 'POST', body: { visitor_name: 'Laura Gómez Ruiz', visitor_doc: '12345678Z', visitor_phone: '600123123', visitor_email: 'laura@example.com', consent_data: true, signature_image: PNG } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const again = await request(`/api/public/visit/${visit.token}/sign`, { method: 'POST', body: { visitor_name: 'Otra Persona', visitor_phone: '611111111', consent_data: true, signature_name: 'Otra Persona' } });
  assert.equal(again.status, 409);
  const pub = await request(`/api/public/visit/${visit.token}`);
  assert.equal(pub.body.status, 'signed');
  assert.equal(pub.body.prefill, null);
});

await test('constancia: integridad correcta y detecta manipulación', async () => {
  const e = await request(`/api/visit-reports/${visit.id}/evidence`, { token: A.token });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal(e.body.integrity_ok, true);
  assert.equal(e.body.report.visitor_name, 'Laura Gómez Ruiz');
  assert.ok(e.body.report.signed_at && e.body.report.content_hash);
  await db.query("UPDATE visit_reports SET visitor_name = 'Alguien Distinto' WHERE id = $1", [visit.id]);
  const t = await request(`/api/visit-reports/${visit.id}/evidence`, { token: A.token });
  assert.equal(t.body.integrity_ok, false);
  await db.query("UPDATE visit_reports SET visitor_name = 'Laura Gómez Ruiz' WHERE id = $1", [visit.id]);
  assert.equal((await request(`/api/visit-reports/${visit.id}/evidence`, { token: A.token })).body.integrity_ok, true);
});

await test('un parte firmado no se puede anular; uno pendiente sí', async () => {
  assert.equal((await request(`/api/visit-reports/${visit.id}/cancel`, { method: 'POST', token: A.token, body: {} })).status, 409);
  const p = await request('/api/visit-reports', { method: 'POST', token: A.token, body: { property_id: propId } });
  assert.equal((await request(`/api/visit-reports/${p.body.id}/cancel`, { method: 'POST', token: A.token, body: {} })).status, 200);
  assert.equal((await request(`/api/public/visit/${p.body.token}`)).status, 404);
});

await test('listado sin firma ni datos técnicos; filtros', async () => {
  const l = await request(`/api/visit-reports?status=signed&property_id=${propId}`, { token: A.token });
  assert.equal(l.status, 200);
  assert.equal(l.body.length, 1);
  assert.equal(l.body[0].signature_image, undefined);
  assert.equal(l.body[0].signed_ip, undefined);
  assert.equal(l.body[0].has_signature_image, true);
});

await test('aislamiento: B no ve ni opera partes de A', async () => {
  assert.equal((await request(`/api/visit-reports/${visit.id}`, { token: B.token })).status, 404);
  assert.equal((await request(`/api/visit-reports/${visit.id}/evidence`, { token: B.token })).status, 404);
  assert.equal((await request(`/api/visit-reports/${visit.id}`, { method: 'PATCH', token: B.token, body: { interest_level: 'alto' } })).status, 404);
  assert.equal((await request('/api/visit-reports', { token: B.token })).body.length, 0);
  assert.equal((await request('/api/visit-reports', { method: 'POST', token: B.token, body: { property_id: propId } })).status, 404);
  assert.equal((await request('/api/visit-reports')).status, 401);
});

await test('valoración tras la visita', async () => {
  assert.equal((await request(`/api/visit-reports/${visit.id}`, { method: 'PATCH', token: A.token, body: { interest_level: 'raro' } })).status, 400);
  const r = await request(`/api/visit-reports/${visit.id}`, { method: 'PATCH', token: A.token, body: { interest_level: 'alto', feedback: 'Le encantó la terraza, pregunta por financiación.' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.interest_level, 'alto');
});

await test('encargo: validaciones y creación', async () => {
  const bad = (b) => request('/api/agreements', { method: 'POST', token: A.token, body: b });
  assert.equal((await bad({ property_id: propId, owner_name: 'Pedro', start_date: iso(0), end_date: iso(-5) })).status, 400);
  assert.equal((await bad({ owner_name: 'Pedro', start_date: iso(0), end_date: iso(90) })).status, 400);
  assert.equal((await bad({ property_id: propId, start_date: iso(0), end_date: iso(90) })).status, 400);
  assert.equal((await bad({ property_id: propId, owner_name: 'Pedro', owner_email: 'nope', start_date: iso(0), end_date: iso(90) })).status, 400);
  const ok = await bad({ property_id: propId, owner_name: 'Pedro Martín', owner_email: 'pedro@example.com', agreement_type: 'exclusiva', start_date: iso(-80), end_date: iso(10), auto_renew: true, notice_days: 15, commission_text: '3 % + IVA' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  agreement = ok.body;
  assert.equal(agreement.alert, 'renovada_auto'); // quedan 10 días y el preaviso de 15 ya pasó
  assert.match(agreement.alert_text, /plazo para avisar/);
});

await test('alertas según plazos', async () => {
  const mk = async (end, extra = {}) => (await request('/api/agreements', { method: 'POST', token: A.token, body: { property_id: propId, owner_name: 'X', start_date: iso(-30), end_date: end, ...extra } })).body;
  assert.equal((await mk(iso(200))).alert, 'ok');
  assert.equal((await mk(iso(18), { notice_days: 15 })).alert, 'urgente');   // 3 días para el preaviso
  assert.equal((await mk(iso(25), { notice_days: 15 })).alert, 'aviso');     // 10 días
  assert.equal((await mk(iso(-4))).alert, 'vencido');
  assert.equal((await mk(iso(20), { auto_renew: false })).alert, 'aviso');   // sin renovación automática
});

await test('listado de encargos con contador de atención y renovación', async () => {
  const l = await request('/api/agreements', { token: A.token });
  assert.equal(l.status, 200);
  assert.ok(l.body.attention_count >= 4, `attention_count=${l.body.attention_count}`);
  const r = await request(`/api/agreements/${agreement.id}/renew`, { method: 'POST', token: A.token, body: { months: 3 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.end_date > agreement.end_date);
  assert.equal(r.body.alert, 'ok');
  assert.equal((await request(`/api/agreements/${agreement.id}/renew`, { method: 'POST', token: A.token, body: { months: 99 } })).status, 400);
});

await test('aislamiento de encargos entre agencias', async () => {
  assert.equal((await request('/api/agreements', { token: B.token })).body.agreements.length, 0);
  assert.equal((await request(`/api/agreements/${agreement.id}`, { method: 'PATCH', token: B.token, body: { notes: 'hack' } })).status, 404);
  assert.equal((await request(`/api/agreements/${agreement.id}`, { method: 'DELETE', token: B.token })).status, 404);
  assert.equal((await request('/api/agreements', { method: 'POST', token: B.token, body: { property_id: propId, owner_name: 'Z', start_date: iso(0), end_date: iso(30) } })).status, 404);
});

await test('informe al propietario: cifras correctas y sin datos personales del visitante', async () => {
  const r = await request(`/api/public/owner-report/${agreement.report_token}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.totals.visits, 1);
  assert.equal(r.body.totals.interest_high, 1);
  assert.equal(r.body.visits[0].label, 'Visita 1');
  assert.match(r.body.visits[0].feedback, /terraza/);
  const raw = JSON.stringify(r.body);
  for (const secret of ['Laura', 'Gómez', '600123123', 'laura@example.com', '12345678Z', 'signature']) {
    assert.ok(!raw.includes(secret), `el informe filtra: ${secret}`);
  }
  assert.equal((await request(`/api/public/owner-report/${'b'.repeat(48)}`)).status, 404);
});

await db.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
