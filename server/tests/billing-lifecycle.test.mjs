// Ciclo de vida de cobro SIN cuenta de Stripe: firma de webhooks real (HMAC de Stripe) contra el servidor.
// Uso: servidor con NODE_ENV=production STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=whsec_test ALLOWED_ORIGINS=...
//      DATABASE_URL=... SUPABASE_JWT_SECRET=... BASE_URL=http://localhost:3003 node tests/billing-lifecycle.test.mjs
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3003';
const SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';
const stripe = new Stripe('sk_test_x');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p);
let ok = 0, ko = 0;
const t = async (n, fn) => { try { await fn(); ok++; console.log('  ✓', n); } catch (e) { ko++; console.error('  ✗', n, '\n   ', e.message); } };

const id = randomUUID(); const email = `bill-${Date.now()}@test.es`;
await q(`INSERT INTO auth.users(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING`, [id, email]).catch(() => {});
await q(`INSERT INTO agencies(id,name,slug,plan,plan_status,trial_ends_at) VALUES($1::uuid,'Cobro Test',$2,'starter','trialing', NOW() + interval '3 days')`, [id, `bill-${id.slice(0, 6)}`]);
await q(`INSERT INTO users(id,email,name,role,agency_id,active) VALUES($1,$2,'Test','admin',$1,true) ON CONFLICT (id) DO UPDATE SET agency_id=EXCLUDED.agency_id`, [id, email]);
const token = jwt.sign({ sub: id, email }, process.env.SUPABASE_JWT_SECRET);
const api = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); let d; try { d = await r.json(); } catch { d = null; } return { status: r.status, data: d }; };
const hook = async (event, { sign = true, secret = SECRET } = {}) => {
  const payload = JSON.stringify(event);
  const headers = { 'Content-Type': 'application/json' };
  if (sign) headers['stripe-signature'] = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const r = await fetch(BASE + '/webhooks/stripe', { method: 'POST', headers, body: payload });
  return r.status;
};
const planStatus = async () => (await q('SELECT plan, plan_status FROM agencies WHERE id=$1', [id])).rows[0];
const subId = `sub_${Date.now()}`;

console.log('Ciclo de cobro');
await t('en demo: acceso completo y 10 % de descuento visible', async () => {
  assert.equal((await api('GET', '/api/leads')).status, 200);
  const s = await api('GET', '/api/billing/subscription'); assert.equal(s.data.status, 'trialing'); assert.equal(s.data.trialDiscountPct, 10);
});
await t('webhook sin firma => 400 y no activa nada', async () => {
  const st = await hook({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { metadata: { agency_id: id, plan_id: 'starter', interval: 'month' }, subscription: subId, customer: 'cus_1' } } }, { sign: false });
  assert.equal(st, 400); assert.equal((await planStatus()).plan_status, 'trialing');
});
await t('webhook con firma falsa => 400 y no activa nada', async () => {
  const st = await hook({ id: 'evt_2', type: 'checkout.session.completed', data: { object: { metadata: { agency_id: id, plan_id: 'starter', interval: 'month' }, subscription: subId, customer: 'cus_1' } } }, { secret: 'whsec_otro' });
  assert.equal(st, 400); assert.equal((await planStatus()).plan_status, 'trialing');
});
await t('pago completado (firma válida) => agencia activa', async () => {
  const st = await hook({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { metadata: { agency_id: id, plan_id: 'starter', interval: 'month' }, subscription: subId, customer: 'cus_1' } } });
  assert.equal(st, 200); const a = await planStatus(); assert.equal(a.plan_status, 'active'); assert.equal(a.plan, 'starter');
  const sub = (await q('SELECT status, stripe_subscription_id FROM subscriptions WHERE agency_id=$1', [id])).rows[0]; assert.equal(sub.status, 'active'); assert.equal(sub.stripe_subscription_id, subId);
});
await t('factura pagada se registra una vez aunque Stripe reenvíe el evento', async () => {
  const ev = { id: 'evt_4', type: 'invoice.paid', data: { object: { id: `in_${Date.now()}`, subscription: subId, amount_paid: 2160, currency: 'eur', payment_intent: 'pi_1', period_start: 1790000000, period_end: 1792600000 } } };
  assert.equal(await hook(ev), 200); const second = await hook(ev);
  const n = (await q('SELECT count(*)::int n FROM payment_history WHERE agency_id=$1', [id])).rows[0].n;
  console.log(`      reenvío => HTTP ${second}, filas en payment_history: ${n}`);
  assert.equal(n, 1, 'el reenvío no debe duplicar el cobro');
});
await t('pago fallido => sigue con acceso (período de gracia)', async () => {
  await hook({ id: 'evt_5', type: 'customer.subscription.updated', data: { object: { status: 'past_due', metadata: { agency_id: id, plan_id: 'starter' }, current_period_end: 1792600000 } } });
  assert.equal((await planStatus()).plan_status, 'past_due'); assert.equal((await api('GET', '/api/leads')).status, 200);
});
await t('suscripción cancelada => acceso bloqueado (402) pero facturación accesible', async () => {
  assert.equal(await hook({ id: 'evt_6', type: 'customer.subscription.deleted', data: { object: { status: 'canceled', metadata: { agency_id: id, plan_id: 'starter' } } } }), 200);
  assert.equal((await planStatus()).plan_status, 'canceled');
  const r = await api('GET', '/api/leads'); assert.equal(r.status, 402); assert.equal(r.data.code, 'SUBSCRIPTION_INACTIVE');
  assert.equal((await api('GET', '/api/billing/subscription')).status, 200); assert.equal((await api('GET', '/api/followup/today')).status, 402);
});
await t('reactivar pagando de nuevo => acceso restaurado', async () => {
  assert.equal(await hook({ id: 'evt_7', type: 'checkout.session.completed', data: { object: { metadata: { agency_id: id, plan_id: 'starter', interval: 'year' }, subscription: `${subId}_2`, customer: 'cus_1' } } }), 200);
  assert.equal((await planStatus()).plan_status, 'active'); assert.equal((await api('GET', '/api/leads')).status, 200);
});
await t('checkout: solo tarjeta y solo el plan único', async () => {
  assert.equal((await api('POST', '/api/billing/create-checkout', { planId: 'starter', interval: 'month', paymentMethod: 'paypal' })).status, 400);
  assert.equal((await api('POST', '/api/billing/create-checkout', { planId: 'agencia', interval: 'month', paymentMethod: 'stripe' })).status, 400);
});
await t('checkout sin red a Stripe falla con error claro (nunca activa un plan)', async () => {
  await q(`UPDATE agencies SET plan_status='trial_expired' WHERE id=$1`, [id]);
  const r = await api('POST', '/api/billing/create-checkout', { planId: 'starter', interval: 'month', paymentMethod: 'stripe' });
  assert.ok(r.status >= 400, `debería fallar, devolvió ${r.status}`); assert.equal((await planStatus()).plan_status, 'trial_expired');
});

console.log(`\n${ok} OK, ${ko} fallos`);
await pool.end(); process.exit(ko ? 1 : 0);
