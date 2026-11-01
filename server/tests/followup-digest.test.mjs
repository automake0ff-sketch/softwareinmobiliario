// Resumen diario por email: se ejecuta en proceso contra la BD real, con un "sender" falso.
// Uso: DATABASE_URL=... node tests/followup-digest.test.mjs
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { initDB } from '../db/db.js';
import { runDigestOnce, buildDigestEmail, escapeHtml } from '../services/followup-digest.js';

await initDB();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p);
let ok = 0, ko = 0;
const t = async (n, fn) => { try { await fn(); ok++; console.log('  ✓', n); } catch (e) { ko++; console.error('  ✗', n, '\n   ', e.message); } };
const stamp = Date.now();

async function mkAgency(label, { status = 'active', tz = 'Europe/Madrid' } = {}) {
  const id = randomUUID();
  await q(`INSERT INTO agencies(id,name,slug,plan,plan_status,timezone) VALUES($1::uuid,$2,$3,'starter',$4,$5)`, [id, `Agencia ${label}`, `${label}-${id.slice(0, 6)}`, status, tz]);
  return id;
}
async function mkUser(agency, label, { role = 'admin', digest = true } = {}) {
  const id = randomUUID(); const email = `${label}-${stamp}@test.es`;
  await q(`INSERT INTO auth.users(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING`, [id, email]).catch(() => {});
  await q(`INSERT INTO users(id,email,name,role,agency_id,active,followup_digest) VALUES($1,$2,$3,$4,$5,true,$6) ON CONFLICT (id) DO UPDATE SET agency_id=EXCLUDED.agency_id, role=EXCLUDED.role, name=EXCLUDED.name, active=true, followup_digest=EXCLUDED.followup_digest`, [id, email, `Laura ${label}`, role, agency, digest]);
  return { id, email };
}
async function mkOverdueLead(agency, name) {
  const lead = randomUUID();
  await q(`INSERT INTO leads(id,agency_id,name,phone,status,created_at,updated_at) VALUES($1,$2,$3,'600112233','interesado', NOW() - interval '8 days', NOW())`, [lead, agency, name]);
  await q(`INSERT INTO followups(id,agency_id,lead_id,due_at,channel) VALUES($1,$2,$3, NOW() - interval '2 days','whatsapp')`, [randomUUID(), agency, lead]);
}

const outbox = [];
const send = async (m) => { outbox.push(m); return { success: true }; };
const mine = (email) => outbox.filter((m) => m.to === email);

console.log('Resumen diario por email');
const A = await mkAgency('dig-a'); const uA = await mkUser(A, 'dig-a');
await mkOverdueLead(A, 'Marcos <script>alert(1)</script> & Co');
await mkOverdueLead(A, 'Elena Segunda');
const optOut = await mkUser(A, 'dig-optout', { digest: false });
const Empty = await mkAgency('dig-empty'); const uE = await mkUser(Empty, 'dig-empty');
const Expired = await mkAgency('dig-exp', { status: 'trial_expired' }); const uX = await mkUser(Expired, 'dig-exp'); await mkOverdueLead(Expired, 'No debería avisarse');
const Bad = await mkAgency('dig-badtz', { tz: 'Marte/Olimpo' }); const uB = await mkUser(Bad, 'dig-badtz'); await mkOverdueLead(Bad, 'Zona horaria rara');

await t('envía un resumen con los contactos pendientes', async () => {
  const r = await runDigestOnce({ appUrl: 'https://app.test', send, ignoreWindow: true });
  console.log('      pasada:', JSON.stringify(r)); assert.ok(r.sent >= 1); const m = mine(uA.email); assert.equal(m.length, 1);
  assert.match(m[0].subject, /^Hoy: \d+ contactos? necesitan? atención$|^Hoy: 1 contacto necesita atención$/);
  assert.match(m[0].html, /https:\/\/app\.test\/seguimiento/); assert.match(m[0].html, /Elena Segunda/);
});
await t('escapa HTML de los nombres (sin inyección en el correo)', async () => {
  const html = mine(uA.email)[0].html; assert.ok(!html.includes('<script>alert(1)</script>')); assert.match(html, /&lt;script&gt;/);
  assert.equal(escapeHtml(`"<&>'`), '&quot;&lt;&amp;&gt;&#39;');
});
await t('no repite el envío el mismo día', async () => {
  const before = outbox.length; await runDigestOnce({ appUrl: 'https://app.test', send, ignoreWindow: true }); assert.equal(outbox.length, before);
});
await t('respeta a quien desactivó el resumen', async () => assert.equal(mine(optOut.email).length, 0));
await t('no avisa si no hay nada pendiente', async () => assert.equal(mine(uE.email).length, 0));
await t('no avisa a agencias con la demo caducada', async () => assert.equal(mine(uX.email).length, 0));
await t('una zona horaria inválida no rompe el envío (usa Madrid)', async () => assert.equal(mine(uB.email).length, 1));
await t('si el envío falla se reintenta en la siguiente pasada', async () => {
  const A2 = await mkAgency('dig-retry'); const u = await mkUser(A2, 'dig-retry'); await mkOverdueLead(A2, 'Reintento');
  const r1 = await runDigestOnce({ appUrl: 'x', send: async () => { throw new Error('SendGrid caído'); }, ignoreWindow: true });
  assert.ok(r1.failed >= 1); assert.equal(mine(u.email).length, 0);
  await runDigestOnce({ appUrl: 'x', send, ignoreWindow: true }); assert.equal(mine(u.email).length, 1);
});
await t('dos instancias a la vez no duplican el correo', async () => {
  const A3 = await mkAgency('dig-race'); const u = await mkUser(A3, 'dig-race'); await mkOverdueLead(A3, 'Carrera');
  await Promise.all([runDigestOnce({ appUrl: 'x', send, ignoreWindow: true }), runDigestOnce({ appUrl: 'x', send, ignoreWindow: true }), runDigestOnce({ appUrl: 'x', send, ignoreWindow: true })]);
  assert.equal(mine(u.email).length, 1);
});
await t('la franja horaria real se ejecuta sin errores de SQL', async () => { const r = await runDigestOnce({ appUrl: 'x', send }); assert.ok(typeof r.sent === 'number'); });
await t('sin proveedor de email configurado no intenta enviar nada', async () => { delete process.env.SENDGRID_API_KEY; const r = await runDigestOnce({ appUrl: 'x', ignoreWindow: true }); assert.deepEqual(r, { sent: 0, skipped: 0, failed: 0 }); });
await t('asunto en singular y contenido con muchos elementos', async () => {
  const mk = (n) => ({ summary: { overdue: n, today: 0, abandoned: 0, attention_total: n }, overdue: Array.from({ length: n }, (_, i) => ({ lead: { name: `L${i}` }, reasons: ['x'], property: null })), today: [], abandoned: [] });
  assert.equal(buildDigestEmail({ userName: 'Ana', data: mk(1), appUrl: 'x' }).subject, 'Hoy: 1 contacto necesita atención');
  const big = buildDigestEmail({ userName: 'Ana', data: mk(30), appUrl: 'x' }); assert.match(big.html, /y 22 más/);
});

console.log(`\n${ok} OK, ${ko} fallos`);
await pool.end(); process.exit(ko ? 1 : 0);
