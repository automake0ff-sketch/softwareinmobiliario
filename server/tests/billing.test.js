import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import pg from 'pg';

// Ciclo de cobro completo con un Stripe FALSO en local:
// alta sin acceso -> pago (prueba 3 días + 10 % dto.) -> prueba -> cobro -> fallo -> baja,
// más los intentos de fraude (eventos sin firmar o con firma falsa).
const WEBHOOK_SECRET = 'whsec_test_secret_for_ci';
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { failed++; console.error(`not ok - ${name}\n  ${e.message}`); }
}

// ── Stripe falso ──────────────────────────────────────────────────────────────
const stripeCalls = { sessions: [], coupons: [], couponCreated: false, cancelAtPeriodEnd: [], deleted: [] };
const fakeStripe = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const params = Object.fromEntries(new URLSearchParams(body));
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (!/^Bearer sk_test_/.test(req.headers.authorization || '')) return send(401, { error: { message: 'bad key' } });
    if (req.method === 'GET' && req.url.startsWith('/v1/coupons/')) {
      return stripeCalls.couponCreated ? send(200, { id: req.url.split('/').pop() }) : send(404, { error: { code: 'resource_missing' } });
    }
    if (req.method === 'POST' && req.url === '/v1/coupons') { stripeCalls.coupons.push(params); stripeCalls.couponCreated = true; return send(200, { id: params.id }); }
    if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
      stripeCalls.sessions.push(params);
      return send(200, { id: `cs_test_${stripeCalls.sessions.length}`, url: `https://checkout.stripe.test/c/cs_test_${stripeCalls.sessions.length}` });
    }
    if (req.method === 'POST' && req.url.startsWith('/v1/subscriptions/') && params.cancel_at_period_end === 'true') { stripeCalls.cancelAtPeriodEnd.push(req.url.split('/').pop()); return send(200, { cancel_at_period_end: true }); }
    if (req.method === 'DELETE' && req.url.startsWith('/v1/subscriptions/')) { stripeCalls.deleted.push(req.url.split('/').pop()); return send(200, { status: 'canceled' }); }
    send(404, { error: { message: `no route ${req.method} ${req.url}` } });
  });
});
await new Promise((r) => fakeStripe.listen(0, '127.0.0.1', r));
const stripePort = fakeStripe.address().port;

// ── Servidor de la aplicación con "Stripe configurado" ───────────────────────
const appPort = 20000 + Math.floor(Math.random() * 20000);
const serverDir = new URL('..', import.meta.url).pathname;
const srv = spawn('node', ['index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(appPort), NODE_ENV: 'test', STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_API_BASE: `http://127.0.0.1:${stripePort}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => (srvLog += d)); srv.stderr.on('data', (d) => (srvLog += d));
const BASE = `http://localhost:${appPort}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 400)); }

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json ?? text };
}
async function newUser() {
  const id = crypto.randomUUID();
  const { status, body } = await request('/api/auth/social-login-or-register', { method: 'POST', body: { email: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`, name: 'Billing Test', supabase_uid: id } });
  assert.equal(status, 200, JSON.stringify(body));
  return { token: body.user.token, agencyId: body.agency?.id || body.user.agency_id };
}
function sign(payload, secret = WEBHOOK_SECRET) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}
async function webhook(event, { secret, noSig } = {}) {
  const payload = JSON.stringify(event);
  const headers = { 'Content-Type': 'application/json' };
  if (!noSig) headers['stripe-signature'] = sign(payload, secret);
  return request('/webhooks/stripe', { method: 'POST', body: payload, headers });
}
let evId = 0;
const ev = (type, object) => ({ id: `evt_${++evId}`, object: 'event', type, data: { object } });
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const agencyRow = async (id) => (await db.query('SELECT plan, plan_status FROM agencies WHERE id = $1', [id])).rows[0];
const subRow = async (id) => (await db.query('SELECT status, trial_end, stripe_subscription_id FROM subscriptions WHERE agency_id = $1', [id])).rows[0];

const A = await newUser();
const B = await newUser();
const subId = `sub_${crypto.randomBytes(6).toString('hex')}`;
const cusId = `cus_${crypto.randomBytes(6).toString('hex')}`;
const trialEnd = Math.floor(Date.now() / 1000) + 3 * 86400;

await test('un alta nueva no tiene acceso hasta empezar la prueba', async () => {
  assert.equal((await agencyRow(A.agencyId)).plan_status, 'inactive');
  const leads = await request('/api/leads', { token: A.token });
  assert.equal(leads.status, 402, JSON.stringify(leads.body));
  assert.equal(leads.body.code, 'SUBSCRIPTION_REQUIRED');
  assert.equal((await request('/api/properties', { method: 'POST', token: A.token, body: { title: 'x', price: 1 } })).status, 402);
  // Lo imprescindible para pagar y completar el alta sí funciona
  assert.equal((await request('/api/billing/status', { token: A.token })).status, 200);
  assert.equal((await request('/api/agency/config', { method: 'PATCH', token: A.token, body: { name: 'Agencia Demo', city: 'Sevilla' } })).status, 200);
});

await test('el checkout pide a Stripe: 3 días de prueba, 10 % de descuento, solo tarjeta y nuestros metadatos', async () => {
  const r = await request('/api/billing/create-checkout', { method: 'POST', token: A.token, body: { planId: 'profesional', interval: 'month' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^https:\/\/checkout\.stripe\.test\//);
  assert.equal(r.body.trial, true); assert.equal(r.body.trialDays, 3); assert.equal(r.body.discountPercent, 10);
  const p = stripeCalls.sessions.at(-1);
  assert.equal(p.mode, 'subscription');
  assert.equal(p['subscription_data[trial_period_days]'], '3');
  assert.equal(p['subscription_data[trial_settings][end_behavior][missing_payment_method]'], 'cancel');
  assert.equal(p['payment_method_collection'], 'always');
  assert.equal(p['payment_method_types[0]'], 'card');
  assert.equal(p['discounts[0][coupon]'], 'propia-trial-10-forever');
  assert.equal(p['line_items[0][price_data][unit_amount]'], '3900');
  assert.equal(p['line_items[0][price_data][recurring][interval]'], 'month');
  assert.equal(p['metadata[agency_id]'], A.agencyId);
  assert.equal(p['subscription_data[metadata][agency_id]'], A.agencyId);
  assert.equal(p['subscription_data[metadata][plan_id]'], 'profesional');
  assert.equal(p['client_reference_id'], A.agencyId);
  assert.equal(stripeCalls.coupons.length, 1);
  assert.equal(stripeCalls.coupons[0].percent_off, '10');
  assert.equal(stripeCalls.coupons[0].duration, 'forever');
});

await test('plan anual: importe anual; el cupón no se vuelve a crear', async () => {
  const r = await request('/api/billing/create-checkout', { method: 'POST', token: A.token, body: { planId: 'starter', interval: 'year' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = stripeCalls.sessions.at(-1);
  assert.equal(p['line_items[0][price_data][unit_amount]'], '19000');
  assert.equal(p['line_items[0][price_data][recurring][interval]'], 'year');
  assert.equal(stripeCalls.coupons.length, 1, 'creó el cupón otra vez');
});

await test('no se puede forzar un plan gratis desde el cliente (método de pago, código o plan falsos)', async () => {
  for (const body of [
    { planId: 'starter', paymentMethod: 'paypal' }, { planId: 'starter', paymentMethod: 'transfer' },
    { planId: 'agencia', promoCode: 'DEMO25' }, { planId: 'agencia', priceId: 'price_gratis', paymentMethod: 'stripe' },
  ]) {
    const r = await request('/api/billing/create-checkout', { method: 'POST', token: A.token, body });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.url, /checkout\.stripe\.test/, 'no pasó por Stripe');
  }
  assert.equal((await request('/api/billing/create-checkout', { method: 'POST', token: A.token, body: { planId: 'gratis' } })).status, 400);
  assert.equal((await agencyRow(A.agencyId)).plan_status, 'inactive', 'se activó sin pagar');
  assert.equal((await request('/api/leads', { token: A.token })).status, 402);
});

await test('eventos falsos: sin firma, firma incorrecta o cuerpo manipulado se rechazan y no cambian nada', async () => {
  const fake = ev('checkout.session.completed', { id: 'cs_x', payment_status: 'paid', subscription: subId, customer: cusId, metadata: { agency_id: A.agencyId, plan_id: 'agencia', interval: 'month' } });
  assert.equal((await webhook(fake, { noSig: true })).status, 400);
  assert.equal((await webhook(fake, { secret: 'whsec_otro' })).status, 400);
  const payload = JSON.stringify(fake);
  const goodSig = sign(payload);
  const tampered = await request('/webhooks/stripe', { method: 'POST', body: payload.replace('agencia', 'starter'), headers: { 'Content-Type': 'application/json', 'stripe-signature': goodSig } });
  assert.equal(tampered.status, 400);
  assert.equal((await agencyRow(A.agencyId)).plan_status, 'inactive');
});

await test('checkout completado con prueba: pasa a "trialing" y ya se puede usar', async () => {
  const r = await webhook(ev('checkout.session.completed', { id: 'cs_test_1', payment_status: 'no_payment_required', subscription: subId, customer: cusId, metadata: { agency_id: A.agencyId, plan_id: 'profesional', interval: 'month' } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const a = await agencyRow(A.agencyId);
  assert.equal(a.plan, 'profesional'); assert.equal(a.plan_status, 'trialing');
  assert.equal((await subRow(A.agencyId)).status, 'trialing');
  assert.equal((await request('/api/leads', { token: A.token })).status, 200);
  const st = await request('/api/billing/status', { token: A.token });
  assert.equal(st.body.status, 'trialing'); assert.equal(st.body.plan, 'profesional');
});

await test('se guarda la fecha de fin de la prueba', async () => {
  await webhook(ev('customer.subscription.created', { id: subId, status: 'trialing', trial_end: trialEnd, current_period_end: trialEnd, metadata: { agency_id: A.agencyId, plan_id: 'profesional' } }));
  const sub = await subRow(A.agencyId);
  assert.equal(Math.round(new Date(sub.trial_end).getTime() / 1000), trialEnd);
  assert.equal((await request('/api/billing/status', { token: A.token })).body.trial_end !== null, true);
});

await test('con una suscripción en marcha no se puede contratar otra (evita el doble cobro)', async () => {
  const before = stripeCalls.sessions.length;
  const r = await request('/api/billing/create-checkout', { method: 'POST', token: A.token, body: { planId: 'agencia', interval: 'month' } });
  assert.equal(r.status, 409, JSON.stringify(r.body)); assert.equal(r.body.code, 'SUBSCRIPTION_EXISTS');
  assert.equal(stripeCalls.sessions.length, before, 'llamó a Stripe');
});

await test('tras la prueba: cobro correcto -> "active" y queda registro del pago', async () => {
  await webhook(ev('customer.subscription.updated', { id: subId, status: 'active', trial_end: trialEnd, current_period_end: trialEnd + 30 * 86400, metadata: { agency_id: A.agencyId } }));
  assert.equal((await agencyRow(A.agencyId)).plan_status, 'active');
  await webhook(ev('invoice.paid', { id: 'in_1', subscription: subId, amount_paid: 3510, currency: 'eur', payment_intent: 'pi_1', hosted_invoice_url: 'https://x', invoice_pdf: 'https://x.pdf', period_start: trialEnd, period_end: trialEnd + 30 * 86400 }));
  const pay = (await db.query('SELECT amount, status FROM payment_history WHERE agency_id = $1', [A.agencyId])).rows;
  assert.equal(pay.length, 1); assert.equal(Number(pay[0].amount), 3510);
  assert.equal((await request('/api/leads', { token: A.token })).status, 200);
});

await test('la factura de 0 € de la prueba no cuenta como pago', async () => {
  const before = (await db.query('SELECT count(*)::int n FROM payment_history WHERE agency_id = $1', [A.agencyId])).rows[0].n;
  await webhook(ev('invoice.paid', { id: 'in_0', subscription: subId, amount_paid: 0, currency: 'eur' }));
  assert.equal((await db.query('SELECT count(*)::int n FROM payment_history WHERE agency_id = $1', [A.agencyId])).rows[0].n, before);
});

await test('cobro fallido: "past_due" mantiene el acceso (Stripe reintenta); "unpaid" lo corta; pagar lo recupera', async () => {
  await webhook(ev('invoice.payment_failed', { id: 'in_2', subscription: subId }));
  assert.equal((await agencyRow(A.agencyId)).plan_status, 'past_due');
  assert.equal((await request('/api/leads', { token: A.token })).status, 200);
  await webhook(ev('customer.subscription.updated', { id: subId, status: 'unpaid', metadata: { agency_id: A.agencyId } }));
  assert.equal((await agencyRow(A.agencyId)).plan_status, 'unpaid');
  assert.equal((await request('/api/leads', { token: A.token })).status, 402);
  await webhook(ev('invoice.paid', { id: 'in_3', subscription: subId, amount_paid: 3510, currency: 'eur' }));
  assert.equal((await agencyRow(A.agencyId)).plan_status, 'active');
  assert.equal((await request('/api/leads', { token: A.token })).status, 200);
});

await test('baja de la suscripción: se corta el acceso', async () => {
  await webhook(ev('customer.subscription.deleted', { id: subId, status: 'canceled', metadata: { agency_id: A.agencyId } }));
  assert.equal((await agencyRow(A.agencyId)).plan_status, 'canceled');
  assert.equal((await subRow(A.agencyId)).status, 'canceled');
  const r = await request('/api/leads', { token: A.token });
  assert.equal(r.status, 402); assert.equal(r.body.plan_status, 'canceled');
  assert.equal((await request('/api/billing/status', { token: A.token })).status, 200, 'debe poder ver su estado para volver a suscribirse');
});

await test('tras darse de baja puede volver a suscribirse, pero sin otra prueba ni descuento', async () => {
  const r = await request('/api/billing/create-checkout', { method: 'POST', token: A.token, body: { planId: 'agencia', interval: 'month' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.trial, false);
  const p = stripeCalls.sessions.at(-1);
  assert.equal(p['subscription_data[trial_period_days]'], undefined);
  assert.equal(p['discounts[0][coupon]'], undefined);
  assert.equal(p['line_items[0][price_data][unit_amount]'], '7900');
});

await test('los eventos de una agencia no afectan a otra y los de agencias desconocidas se ignoran', async () => {
  assert.equal((await agencyRow(B.agencyId)).plan_status, 'inactive');
  const r = await webhook(ev('customer.subscription.updated', { id: 'sub_desconocida', status: 'active', metadata: { agency_id: crypto.randomUUID() } }));
  assert.equal(r.status, 200);
  assert.equal((await request('/api/leads', { token: B.token })).status, 402);
});

await test('cancelar durante la prueba corta el acceso al momento y avisa a Stripe', async () => {
  const C = await newUser();
  await webhook(ev('checkout.session.completed', { id: 'cs_c', payment_status: 'no_payment_required', subscription: `sub_c${evId}`, customer: 'cus_c', metadata: { agency_id: C.agencyId, plan_id: 'starter', interval: 'month' } }));
  assert.equal((await request('/api/leads', { token: C.token })).status, 200);
  const c = await request('/api/billing/cancel', { method: 'POST', token: C.token, body: {} });
  assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(c.body.status, 'canceled');
  assert.equal((await agencyRow(C.agencyId)).plan_status, 'canceled');
  assert.equal((await request('/api/leads', { token: C.token })).status, 402);
  assert.equal((await request('/api/billing/cancel', { method: 'POST', token: C.token, body: {} })).status, 409, 'se puede cancelar dos veces');
});

await test('cancelar con la suscripción cobrada mantiene el acceso hasta el final del periodo', async () => {
  const D = await newUser();
  const sid = `sub_d${evId}`;
  await webhook(ev('checkout.session.completed', { id: 'cs_d', payment_status: 'paid', subscription: sid, customer: 'cus_d', metadata: { agency_id: D.agencyId, plan_id: 'starter', interval: 'month' } }));
  assert.equal((await agencyRow(D.agencyId)).plan_status, 'active');
  const c = await request('/api/billing/cancel', { method: 'POST', token: D.token, body: {} });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.cancelAtPeriodEnd, true);
  assert.equal((await agencyRow(D.agencyId)).plan_status, 'active');
  assert.equal((await request('/api/leads', { token: D.token })).status, 200, 'perdió el acceso antes de tiempo');
  assert.equal(stripeCalls.cancelAtPeriodEnd.includes(sid), true, 'no se lo dijo a Stripe');
  // Al terminar el periodo Stripe envía la baja definitiva
  await webhook(ev('customer.subscription.deleted', { id: sid, status: 'canceled', metadata: { agency_id: D.agencyId } }));
  assert.equal((await request('/api/leads', { token: D.token })).status, 402);
});

await test('en producción, sin Stripe configurado, nunca se activa un plan', async () => {
  const prev = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try {
    const { initDB } = await import('../db/db.js'); await initDB();
    const { BillingService } = await import('../services/stripe.js');
    const D = await newUser();
    await assert.rejects(() => new BillingService({}).createCheckoutSession({ id: D.agencyId, email: 'd@test.com' }, 'starter', 'month'), /no están configurados/);
    assert.equal((await agencyRow(D.agencyId)).plan_status, 'inactive');
  } finally { process.env.NODE_ENV = prev; }
});

srv.kill('SIGTERM'); fakeStripe.close(); await db.end();
if (failed) console.error('\n--- log del servidor (últimas líneas) ---\n' + srvLog.split('\n').slice(-15).join('\n'));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
