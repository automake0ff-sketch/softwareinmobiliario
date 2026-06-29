import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';
const TEST_TIMEOUT_MS = 60_000;
const password = 'SuperSecurePassword123!';

let passed = 0;
let failed = 0;
let serverProcess = null;
let serverLogs = '';

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
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { res, body };
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < TEST_TIMEOUT_MS) {
    try {
      const { res } = await request('/api/health');
      if (res.status === 200 || res.status === 503) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function ensureServer() {
  try {
    const { res } = await request('/api/health');
    if (res.status === 200 || res.status === 503) return;
  } catch {}

  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.PORT = process.env.PORT || '3002';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'crm-inmobiliario-secret-dev-key-2026';
  process.env.API_TOKEN = process.env.API_TOKEN || 'demo-token-dev';

  try {
    serverProcess = spawn(process.execPath, ['index.js'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', chunk => {
      serverLogs += chunk.toString();
    });
    serverProcess.stderr.on('data', chunk => {
      serverLogs += chunk.toString();
    });
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    await import('../index.js');
  }

  const ready = await waitForHealth();
  if (!ready) {
    throw new Error(`Server did not become healthy. Logs:\n${serverLogs}`);
  }
}

async function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill('SIGTERM');
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 3_000);
    serverProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
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

async function registerTestUser(overrides = {}) {
  const id = rand();
  const payload = {
    email: `test-${id}@test.com`,
    password,
    name: 'Test User',
    phone: '600000000',
    agencyName: `Agency Test ${id}`,
    agencyCity: 'Madrid',
    plan: 'starter',
    ...overrides
  };

  const { res, body } = await request('/api/auth/register', {
    method: 'POST',
    body: payload
  });

  assert.equal(res.status, 201, JSON.stringify(body));
  return { ...payload, register: body };
}

async function login(email, userPassword = password) {
  const { res, body } = await request('/api/login', {
    method: 'POST',
    body: { email, password: userPassword }
  });
  return { res, body };
}

async function getTestToken() {
  // Registra un usuario aislado de test y loguea contra el servidor local.
  // La limpieza queda implicita por emails/agencias unicos por ejecucion.
  const user = await registerTestUser();
  const { res, body } = await login(user.email);
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.token);
  return { token: body.token, user: body.user, agency: body.agency, email: user.email };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

await ensureServer();

try {
  let authA;
  let authB;
  let leadA;
  let propertyA;

  await runTest('GET /api/health devuelve status ok y 200', async () => {
    const { res, body } = await request('/api/health');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'ok');
    assert.equal(body.db, 'connected');
  });

  await runTest('POST /api/auth/register crea agencia + usuario nuevo', async () => {
    const user = await registerTestUser();
    assert.ok(user.register.user_id);
    assert.ok(user.register.agency_id);
    assert.equal(user.register.email, user.email);
  });

  await runTest('POST /api/auth/register email duplicado devuelve 409', async () => {
    const user = await registerTestUser();
    const { res } = await request('/api/auth/register', {
      method: 'POST',
      body: {
        email: user.email,
        password,
        name: 'Duplicate User',
        phone: '600000001',
        agencyName: `Duplicate ${rand()}`,
        agencyCity: 'Madrid',
        plan: 'starter'
      }
    });
    assert.equal(res.status, 409);
  });

  await runTest('POST /api/login con credenciales validas devuelve token, user, agency', async () => {
    const user = await registerTestUser();
    const { res, body } = await login(user.email);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok(body.token);
    assert.ok(body.user);
    assert.ok(body.agency);
  });

  await runTest('POST /api/login con password incorrecto devuelve 401', async () => {
    const user = await registerTestUser();
    const { res } = await login(user.email, 'wrong-password');
    assert.equal(res.status, 401);
  });

  await runTest('POST /api/login con email inexistente devuelve 401', async () => {
    const { res } = await login(`missing-${rand()}@test.com`);
    assert.equal(res.status, 401);
  });

  await runTest('POST /api/login sin body devuelve 400', async () => {
    const { res } = await request('/api/login', {
      method: 'POST',
      body: {}
    });
    assert.equal(res.status, 400);
  });

  await runTest('GET /api/leads sin token devuelve 401', async () => {
    const { res } = await request('/api/leads');
    assert.equal(res.status, 401);
  });

  await runTest('GET /api/leads con token valido devuelve array', async () => {
    authA = await getTestToken();
    const { res, body } = await request('/api/leads', {
      headers: authHeaders(authA.token)
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.leads ?? body));
  });

  await runTest('POST /api/leads crea lead con campos minimos', async () => {
    const { res, body } = await request('/api/leads', {
      method: 'POST',
      headers: authHeaders(authA.token),
      body: { name: 'Lead Test', phone: '611111111' }
    });
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.ok(body.id);
    assert.equal(body.name, 'Lead Test');
    leadA = body;
  });

  await runTest('POST /api/leads sin nombre devuelve 400', async () => {
    const { res } = await request('/api/leads', {
      method: 'POST',
      headers: authHeaders(authA.token),
      body: { phone: '611111112' }
    });
    assert.equal(res.status, 400);
  });

  await runTest('POST /api/leads lead pertenece a agency_id del usuario autenticado', async () => {
    assert.equal(leadA.agency_id, authA.agency.id);
  });

  await runTest('PUT /api/leads/:id actualiza stage del lead', async () => {
    const { res, body } = await request(`/api/leads/${leadA.id}`, {
      method: 'PUT',
      headers: authHeaders(authA.token),
      body: { pipeline_stage: 'contactado' }
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.pipeline_stage, 'contactado');
  });

  await runTest('PUT /api/leads/:id no puede acceder a lead de otra agencia', async () => {
    authB = await getTestToken();
    const { res } = await request(`/api/leads/${leadA.id}`, {
      method: 'PUT',
      headers: authHeaders(authB.token),
      body: { pipeline_stage: 'negociacion' }
    });
    assert.equal(res.status, 403);
  });

  await runTest('GET /api/properties devuelve array de propiedades de la agencia', async () => {
    const { res, body } = await request('/api/properties', {
      headers: authHeaders(authA.token)
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body));
  });

  await runTest('POST /api/properties crea propiedad con campos minimos', async () => {
    const { res, body } = await request('/api/properties', {
      method: 'POST',
      headers: authHeaders(authA.token),
      body: { title: 'Piso Test', price: 250000, type: 'apartment' }
    });
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.ok(body.id);
    assert.equal(body.title, 'Piso Test');
    propertyA = body;
  });

  await runTest('POST /api/properties propiedad pertenece a la agencia del usuario', async () => {
    assert.equal(propertyA.agency_id, authA.agency.id);
  });
} finally {
  await stopServer();
  console.log(`${passed} tests pasados, ${failed} fallados`);
  process.exit(failed > 0 ? 1 : 0);
}
