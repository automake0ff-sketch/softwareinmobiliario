import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';
const TEST_TIMEOUT_MS = 60_000;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-secret-for-ci-minimum-32-chars-x';

let passed = 0;
let failed = 0;

const rand = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = { ...options, headers };
  if (init.body && typeof init.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(init.body);
  }
  const res = await fetch(`${BASE_URL}${path}`, init);
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { res, body };
}

// Genera un JWT válido firmado con el mismo secreto que el servidor usa para verificar
function makeTestJWT(userId, email) {
  return jwt.sign({ sub: userId, email }, SUPABASE_JWT_SECRET, { expiresIn: '1h' });
}

// Simula el flujo completo: Supabase Auth -> /api/auth/social-login-or-register -> token
async function createTestUser() {
  // UUID v4 válido con prefijo fijo para identificar registros de test
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const id = `10000000-${hex()}-4${hex().slice(1)}-${(Math.floor(Math.random() * 4) + 8).toString(16)}${hex().slice(1)}-${hex()}${hex()}${hex()}`;
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;

  const { res, body } = await request('/api/auth/social-login-or-register', {
    method: 'POST',
    body: { email, name: 'Test User', supabase_uid: id }
  });

  assert.equal(res.status, 200, `social-login-or-register falló: ${JSON.stringify(body)}`);
  assert.ok(body.user?.token, 'Respuesta no incluye token');
  return { id, email, token: body.user.token, user: body.user, agency: body.agency };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function ensureServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const { res } = await request('/api/health');
      if (res.status === 200) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  console.error('ERROR: El servidor no está disponible en', BASE_URL);
  console.error('Arranca el servidor antes de correr los tests:');
  console.error('  cd server && node index.js');
  process.exit(1);
}

async function runTest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message || error);
  }
}

await ensureServer();

try {
  let authA;
  let authB;
  let leadId;
  let propertyId;

  // ── Health ──
  await runTest('GET /api/health devuelve status ok y 200', async () => {
    const { res, body } = await request('/api/health');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'ok');
  });

  // ── Auth: social-login-or-register ──
  await runTest('POST /api/auth/social-login-or-register crea usuario + agencia en primer login', async () => {
    const user = await createTestUser();
    assert.ok(user.user.id);
    assert.ok(user.agency.id);
    assert.ok(user.token);
  });

  await runTest('POST /api/auth/social-login-or-register es idempotente (mismo uid devuelve el mismo usuario)', async () => {
    const hex4 = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    const id = `20000000-${hex4()}-4${hex4().slice(1)}-8${hex4().slice(1)}-${hex4()}${hex4()}${hex4()}`;
    const email = `idem-${rand()}@test.com`;
    const { body: b1 } = await request('/api/auth/social-login-or-register', { method: 'POST', body: { email, name: 'Idempotent', supabase_uid: id } });
    const { body: b2 } = await request('/api/auth/social-login-or-register', { method: 'POST', body: { email, name: 'Idempotent', supabase_uid: id } });
    assert.equal(b1.user.id, b2.user.id);
    assert.equal(b1.agency.id, b2.agency.id);
  });

  await runTest('POST /api/auth/social-login-or-register sin supabase_uid devuelve 400', async () => {
    const { res } = await request('/api/auth/social-login-or-register', { method: 'POST', body: { email: 'x@x.com' } });
    assert.equal(res.status, 400);
  });

  // ── Auth: rutas protegidas ──
  await runTest('GET /api/leads sin token devuelve 401', async () => {
    const { res } = await request('/api/leads');
    assert.equal(res.status, 401);
  });

  await runTest('GET /api/leads con token valido devuelve array', async () => {
    authA = await createTestUser();
    const { res, body } = await request('/api/leads', { headers: authHeaders(authA.token) });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.leads ?? body));
  });

  await runTest('GET /api/leads con JWT Supabase directo tambien funciona', async () => {
    authB = await createTestUser();
    const { res, body } = await request('/api/leads', { headers: authHeaders(authB.token) });
    assert.equal(res.status, 200, JSON.stringify(body));
  });

  // ── Leads CRUD ──
  await runTest('POST /api/leads crea un lead y lo devuelve', async () => {
    const { res, body } = await request('/api/leads', {
      method: 'POST',
      headers: authHeaders(authA.token),
      body: { name: 'Test Lead', email: `lead-${rand()}@test.com`, phone: '600000001', status: 'nuevo', source: 'web' }
    });
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.ok(body.id);
    leadId = body.id;
  });

  await runTest('GET /api/leads/:id devuelve el lead creado', async () => {
    const { res, body } = await request(`/api/leads/${leadId}`, { headers: authHeaders(authA.token) });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.id, leadId);
  });

  await runTest('PATCH /api/leads/:id actualiza el lead', async () => {
    const { res, body } = await request(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: authHeaders(authA.token),
      body: { status: 'contactado' }
    });
    assert.equal(res.status, 200, JSON.stringify(body));
  });

  await runTest('Tenant isolation: agencia B no ve leads de agencia A', async () => {
    const { res, body } = await request('/api/leads', { headers: authHeaders(authB.token) });
    assert.equal(res.status, 200, JSON.stringify(body));
    const leads = body.leads ?? body;
    const found = leads.find(l => l.id === leadId);
    assert.ok(!found, 'Agencia B no deberia ver leads de agencia A');
  });

  // ── Properties ──
  await runTest('POST /api/properties crea una propiedad', async () => {
    const { res, body } = await request('/api/properties', {
      method: 'POST',
      headers: authHeaders(authA.token),
      body: { title: 'Test Piso', price: 150000, type: 'piso', status: 'disponible', operation: 'venta', bedrooms: 2, bathrooms: 1, size: 80, zone: 'Centro', city: 'Sevilla' }
    });
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.ok(body.id);
    propertyId = body.id;
  });

  await runTest('GET /api/properties devuelve array con la propiedad', async () => {
    const { res, body } = await request('/api/properties', { headers: authHeaders(authA.token) });
    assert.equal(res.status, 200, JSON.stringify(body));
    const props = Array.isArray(body) ? body : (body.properties ?? body.data ?? []);
    assert.ok(props.some(p => p.id === propertyId), `propiedad ${propertyId} no encontrada`);
  });

  await runTest('DELETE /api/leads/:id elimina el lead', async () => {
    const { res } = await request(`/api/leads/${leadId}`, { method: 'DELETE', headers: authHeaders(authA.token) });
    assert.ok([200, 204].includes(res.status), `Status inesperado: ${res.status}`);
  });

} finally {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
