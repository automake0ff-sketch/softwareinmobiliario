import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import crypto from 'crypto';
import { getAIUsageSummary } from './services/ai-budget.js';
import { initDB, all, get, run, saveDB } from './db/db.js';
import { defaultQueue, JobQueue } from './services/queue.js';
import { initRealtime, RealtimeService } from './services/realtime.js';
import { BillingService, checkPlanLimit, PLANS, PAYMENT_METHODS } from './services/stripe.js';
import CalendarService from './services/calendar.js';
import EmailService from './services/email.js';
import TwilioService from './services/twilio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function validateEnv() {
  const required = ['DATABASE_URL', 'SUPABASE_JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Variables de entorno faltantes:', missing.join(', '));
    process.exit(1);
  }
  console.log('✅ Variables de entorno validadas');
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3002;

const realtime = initRealtime(wss);

const calendar = new CalendarService({
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3002/api/calendar/callback',
});

const emailService = new EmailService({
  sendgridKey: process.env.SENDGRID_API_KEY,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  fromEmail: process.env.FROM_EMAIL || 'noreply@inmotech.es',
  agencyName: process.env.AGENCY_NAME || 'InmoTech Realty',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
});

const twilio = new TwilioService({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+34123456789',
  agencyName: process.env.AGENCY_NAME || 'InmoTech Realty',
});

const stripe = new BillingService({
  secretKey: process.env.STRIPE_SECRET_KEY,
  appUrl: process.env.APP_URL || 'http://localhost:5173',
});

const API_TOKEN = process.env.API_TOKEN || 'demo-token-dev';

// Configuración de CORS restringido a dominios permitidos
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3002'];

if (!process.env.ALLOWED_ORIGINS && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  ALLOWED_ORIGINS no configurado en producción — CORS solo permite localhost');
}

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} no permitido por CORS.`));
  },
  credentials: true
}));

// Handler específico para errores de CORS: devuelve 403 con mensaje claro en vez
// de dejar que caigan en el manejador genérico de 500 (indistinguible de un fallo
// real del servidor). Debe ir DESPUÉS de app.use(cors(...)) para poder atraparlo.
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('no permitido por CORS')) {
    console.error('[CORS BLOCKED]', err.message, '| ALLOWED_ORIGINS actual:', allowedOrigins.join(', '));
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

// Definición de limitadores de tasa (Rate Limiting)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // Máximo 20 intentos por IP
  message: { error: 'Demasiados intentos desde esta IP. Intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const webhookLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 100, // Máximo 100 solicitudes de webhooks por IP
  message: { error: 'Límite de tasa para webhooks excedido.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/webhooks/stripe', webhookLimiter, express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    let event;
    const sig = req.headers['stripe-signature'];
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && sig) {
      // Verificacion de firma real. Si constructEvent lanza (firma invalida,
      // cuerpo manipulado, secreto incorrecto), el catch de fuera debe
      // rechazar la peticion con 400 -- NUNCA caer a parsear el body sin
      // verificar, o cualquiera podria forjar un evento 'checkout.session.completed'
      // y activarse una suscripcion de pago gratis.
      const { default: Stripe } = await import('stripe');
      const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
      event = stripeInstance.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      console.warn('[STRIPE] Webhook sin verificar firma: falta STRIPE_WEBHOOK_SECRET o cabecera stripe-signature. Solo aceptable en desarrollo local.');
      event = JSON.parse(req.body.toString());
    }
    const result = await stripe.handleWebhook(event);
    res.json(result);
  } catch (e) {
    console.error('[STRIPE] Webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

async function verifyPayPalWebhookSignature(req) {
  const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
  const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;
  const PAYPAL_BASE = process.env.NODE_ENV === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_WEBHOOK_ID) {
    console.warn('[PAYPAL] PAYPAL_WEBHOOK_ID no configurado: no se puede verificar la firma del webhook.');
    return false;
  }

  const tokenRes = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('[PAYPAL] No se pudo obtener access token para verificar webhook:', tokenData);
    return false;
  }

  const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
    body: JSON.stringify({
      auth_algo: req.headers['paypal-auth-algo'],
      cert_url: req.headers['paypal-cert-url'],
      transmission_id: req.headers['paypal-transmission-id'],
      transmission_sig: req.headers['paypal-transmission-sig'],
      transmission_time: req.headers['paypal-transmission-time'],
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: req.body,
    }),
  });
  const verifyData = await verifyRes.json();
  return verifyData.verification_status === 'SUCCESS';
}

app.post('/webhooks/paypal', webhookLimiter, express.json({ type: 'application/json' }), async (req, res) => {
  try {
    const verified = await verifyPayPalWebhookSignature(req);
    if (!verified) {
      console.warn('[PAYPAL] Webhook rechazado: firma invalida o no verificable.');
      return res.status(401).json({ error: 'Firma de webhook inválida' });
    }
    const result = await stripe.handlePayPalWebhook(req.body);
    res.json(result);
  } catch (e) {
    console.error('[PAYPAL] Webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

function logActivity(agencyId, leadId, userId, type, description, metadata = null) {
  run(
    `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
     VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, @metadata, NOW())`,
    {
      id: uuidv4(), agency_id: agencyId, lead_id: leadId, user_id: userId,
      type, description, metadata: metadata ? JSON.stringify(metadata) : null,
    }
  );
}

async function start() {
  validateEnv();
  await initDB();

  const { auth } = await import('./middleware/auth.js');
  const leadsRouter = (await import('./routes/leads.js')).default;
  const propertiesRouter = (await import('./routes/properties.js')).default;
  const agencyRouter = (await import('./routes/agency.js')).default;
  const appointmentsRouter = (await import('./routes/appointments.js')).default;

  app.use('/api/leads', leadsRouter);
  app.use('/api/properties', propertiesRouter);
  app.use('/api/agency', agencyRouter);
  app.use('/api/webhooks/portal-leads', webhookLimiter, (await import('./webhooks/portal-leads.js')).default);
  app.use('/api', appointmentsRouter);
  // Auth routes — el router general DEBE montarse antes que las rutas específicas
  // que comparten el mismo prefijo /api/auth, o Express las intercepta
  const authSyncRouter = (await import('./routes/auth-sync.js')).default;
  app.use('/api/auth', authSyncRouter);
  app.use('/api/auth/register', authLimiter, (await import('./routes/register.js')).default);
  app.use('/api/login', authLimiter, (await import('./routes/login.js')).default);
  app.use('/api/admin', (await import('./routes/admin.js')).default);
  app.use('/api/leads', (await import('./routes/lead-preferences.js')).default);

  // Migraciones de esquema
  await runMigration();

  app.use((err, req, res, next) => {
    console.error('[UNHANDLED ERROR]', err.stack || err.message || err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  defaultQueue.on('process_new_lead', async (job) => {
    try {
      const { leadId, agencyId, source, utm } = job.data;
      const lead = await get('SELECT * FROM leads WHERE id = @id', { id: leadId });
      if (!lead) throw new Error('Lead not found');

      const comerciales = await all(
        `SELECT u.*, (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status NOT IN ('cerrado','reserva')) as active_leads
         FROM users u WHERE u.role = 'comercial' AND u.agency_id = @agency_id AND u.active = true
         ORDER BY active_leads ASC LIMIT 1`,
        { agency_id: agencyId }
      );

      if (comerciales && comerciales.length > 0) {
        const comercial = comerciales[0];
        await run("UPDATE leads SET assigned_to = @assigned_to, updated_at = NOW() WHERE id = @id",
          { assigned_to: comercial.id, id: leadId });
        logActivity(agencyId, leadId, comercial.id, 'lead_assigned',
          `Lead asignado automáticamente a ${comercial.name}`, { comercialId: comercial.id, source });
      }

      const convId = uuidv4();
      await run(
        `INSERT INTO conversations (id, lead_id, agency_id, channel, created_at, updated_at)
         VALUES (@id, @lead_id, @agency_id, @channel, NOW(), NOW())`,
        {
          id: convId, lead_id: leadId, agency_id: agencyId,
          channel: 'web',
        }
      );
      if (job.data.initialMessage) {
        await run(
          `INSERT INTO messages (id, conversation_id, author, content, message_type, is_read, created_at)
           VALUES (@id, @conversation_id, 'lead', @content, 'text', false, NOW())`,
          { id: uuidv4(), conversation_id: convId, content: String(job.data.initialMessage).slice(0, 1000) }
        );
      }
      logActivity(agencyId, leadId, null, 'lead_received', `Nuevo lead ${lead.name} (origen: ${source})`, { source, utm });

      if (realtime) {
        realtime.broadcastActivity({
          type: 'new_lead_processed', leadId, leadName: lead.name,
          description: `Lead procesado automáticamente (origen: ${source})`,
          source,
        });
      }
    } catch (e) {
      console.error('[QUEUE] process_new_lead error:', e.message);
      throw e;
    }
  });

  defaultQueue.on('run_automation', async (job) => {
    try {
      const { agencyId, triggerEvent } = job.data;
      const automations = await all(
        'SELECT * FROM automations WHERE agency_id = @agency_id AND trigger_event = @trigger AND is_active = true',
        { agency_id: agencyId, trigger: triggerEvent }
      );
      for (const auto of automations) {
        console.log(`[AUTOMATION] Running: ${auto.name} (${auto.action})`);
      }
      console.log(`[AUTOMATION] Completed ${automations.length} automations for ${triggerEvent}`);
    } catch (e) {
      console.error('[QUEUE] run_automation error:', e.message);
      throw e;
    }
  });

  defaultQueue.on('scheduled_task', async (job) => {
    try {
      const { type, agencyId } = job.data;
      if (type === 'daily_briefing') {
        const managers = await all('SELECT * FROM users WHERE agency_id = @agency_id AND role = \'manager\'', { agency_id: agencyId });
        const leads = await all('SELECT * FROM leads WHERE agency_id = @agency_id');
        const tasks = await all('SELECT * FROM tasks WHERE completed = false');
        const visits = await all(`SELECT * FROM activities WHERE type = 'visita' AND created_at >= NOW() - INTERVAL '1 day'`);
        const properties = await all('SELECT * FROM properties WHERE agency_id = @agency_id AND status = \'disponible\'', { agency_id: agencyId });

        const newLeads = leads.filter(l => {
          const created = new Date(l.created_at);
          return (Date.now() - created.getTime()) < 86400000;
        });

        const briefing = {
          date: new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          summary: {
            newLeads: newLeads.length,
            hotLeads: leads.filter(l => (l.ia_score || 0) >= 70).length,
            todayVisits: visits.length,
            pendingTasks: tasks.length,
            newProperties: properties.length,
            totalLeads: leads.length,
          },
          highlights: [
            newLeads.length > 0 ? `${newLeads.length} nuevos leads registrados` : 'Sin leads nuevos',
          ],
        };

        for (const mgr of managers) {
          await emailService.sendDailyBriefing({ email: mgr.email, name: mgr.name }, briefing).catch(() => {});
        }
        console.log(`[SCHEDULED] Daily briefing sent to ${managers.length} managers`);
      }
    } catch (e) {
      console.error('[QUEUE] scheduled_task error:', e.message);
    }
  });

  app.get('/api/queue/stats', auth, (req, res) => {
    const stats = defaultQueue.getStats();
    res.json(stats);
  });

  app.get('/api/realtime/clients', auth, (req, res) => {
    res.json({ connectedClients: realtime.getConnectedClients() });
  });

  app.get('/api/billing/plans', async (req, res) => {
    const { PLANS: PLAN_DEFS } = await import('./services/plans.js')
    res.json({ plans: Object.values(PLAN_DEFS), paymentMethods: Object.values(PAYMENT_METHODS) });
  });

  // ── /api/stats/dashboard — estadísticas reales del dashboard por agencia ──
  app.get('/api/stats/dashboard', auth, async (req, res) => {
    try {
      const aid = req.user.agency_id;
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const somStr = startOfMonth.toISOString();

      const leadsToday = (await get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= @today", { aid, today }))?.count || 0;
      const totalLeads = (await get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid", { aid }))?.count || 0;
      const leadsThisMonth = (await get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= @som", { aid, som: somStr }))?.count || 0;

      const leadsYesterday = (await get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= @yesterday AND created_at < @today", { aid, yesterday, today }))?.count || 0;

      let leadsPctChange = '0%';
      let leadsTrend = 'up';
      if (leadsYesterday > 0) {
        const diff = leadsToday - leadsYesterday;
        const pct = Math.round((diff / leadsYesterday) * 100);
        leadsPctChange = (pct >= 0 ? '+' : '') + pct + '%';
        leadsTrend = pct >= 0 ? 'up' : 'down';
      } else if (leadsToday > 0) {
        leadsPctChange = '+100%';
        leadsTrend = 'up';
      } else {
        leadsPctChange = '0%';
        leadsTrend = 'down';
      }

      const leadsNuevos = (await get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND status = 'nuevo'", { aid }))?.count || 0;
      const upcomingVisits = (await get("SELECT COUNT(*) as count FROM appointments WHERE agency_id = @aid AND status IN ('scheduled','confirmed','reschedule_requested') AND starts_at >= @now", { aid, now: new Date().toISOString() }))?.count || 0;
      const availableProps = (await get("SELECT COUNT(*) as count FROM properties WHERE agency_id = @aid AND status = 'disponible'", { aid }))?.count || 0;

      const pipelineStats = await all("SELECT status, COUNT(*) as count FROM leads WHERE agency_id = @aid GROUP BY status", { aid });
      const totalPipeline = pipelineStats.reduce((sum, s) => sum + s.count, 0);

      const totalProperties = (await get("SELECT COUNT(*) as count FROM properties WHERE agency_id = @aid", { aid }))?.count || 0;

      const activities = await all(
        "SELECT id, type, title, description, created_at FROM activities WHERE agency_id = @aid ORDER BY created_at DESC LIMIT 20",
        { aid }
      );

      const conversions = await all(
        "SELECT DATE(created_at) as day, COUNT(*) as leads FROM leads WHERE agency_id = @aid AND created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(created_at) ORDER BY day",
        { aid }
      );

      res.json({
        liveStats: [
          { id: 1, label: 'Leads sin contactar', value: leadsNuevos, icon: 'Users', change: '', trend: 'up' },
          { id: 2, label: 'Leads hoy', value: leadsToday, icon: 'Users', change: leadsPctChange, trend: leadsTrend },
          { id: 3, label: 'Visitas próximas', value: upcomingVisits, icon: 'Calendar', change: '', trend: 'up' },
          { id: 4, label: 'Propiedades disponibles', value: availableProps, icon: 'Home', change: '', trend: 'up' },
        ],
        totalLeads,
        totalProperties,
        totalPipeline,
        pipelineStages: pipelineStats.map(s => ({
          label: s.status === 'nuevo' ? 'Nuevo' : s.status === 'contactado' ? 'Contactado' : s.status === 'interesado' ? 'Interesado' : s.status === 'visita_agendada' ? 'Visita agendada' : s.status === 'negociacion' ? 'Negociación' : s.status === 'reserva' ? 'Reserva' : s.status === 'cerrado' ? 'Cerrado' : s.status,
          count: s.count,
          color: s.status === 'nuevo' ? 'bg-blue-400' : s.status === 'contactado' ? 'bg-amber-300' : s.status === 'interesado' ? 'bg-indigo-300' : s.status === 'visita_agendada' ? 'bg-purple-400' : s.status === 'negociacion' ? 'bg-orange-400' : s.status === 'reserva' ? 'bg-emerald-400' : 'bg-green-500',
        })),
        conversionData: conversions.map(c => ({
          day: c.day ? new Date(c.day + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short' }) : '',
          leads: c.leads,
          conversions: 0,
        })),
        activities: activities.map(a => ({
          id: a.id,
          type: a.type,
          text: a.description || a.title || '',
          time: a.created_at,
        })),
      });
    } catch (e) {
      console.error('[DASHBOARD STATS] Error:', e.message);
      res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
  });

  app.get('/api/billing/subscription', auth, async (req, res) => {
    const sub = await stripe.getSubscription(req.user.agency_id);
    res.json(sub);
  });

  app.get('/api/billing/limits', auth, async (req, res) => {
    const limits = await stripe.checkLimits(req.user.agency_id);
    res.json(limits);
  });

  // ── /api/billing/status — plan actual + uso para el frontend ──
  app.get('/api/billing/status', auth, async (req, res) => {
    try {
      const agencyId = req.user.agency_id
      const { PLANS } = await import('./services/plans.js')
      const subs = await all(
        `SELECT s.*, p.slug AS plan_slug
         FROM subscriptions s
         LEFT JOIN plans p ON p.id = s.plan_id
         WHERE s.agency_id = @aid
         ORDER BY s.created_at DESC LIMIT 1`,
        { aid: agencyId }
      )
      const sub = subs?.[0]
      const planId = sub?.plan_slug || 'starter'
      const plan = PLANS[planId] || PLANS.starter
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      const somStr = startOfMonth.toISOString()

      const leadsCount = (await get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= @som", { aid: agencyId, som: somStr }))?.count || 0
      const usersCount = (await get("SELECT COUNT(*) as count FROM users WHERE agency_id = @aid AND active = true", { aid: agencyId }))?.count || 0
      const officesCount = (await get("SELECT COUNT(*) as count FROM offices WHERE agency_id = @aid", { aid: agencyId }))?.count || 0
      const agentsCount = (await get("SELECT COUNT(*) as count FROM ai_agents WHERE agency_id = @aid AND status = 'active'", { aid: agencyId }))?.count || 0
      const automationsCount = (await get("SELECT COUNT(*) as count FROM automations WHERE agency_id = @aid AND is_active = true", { aid: agencyId }))?.count || 0

      const leadsLimit = plan.max_leads_per_month
      const leadsPct = leadsLimit === -1 ? 0 : Math.round((leadsCount / leadsLimit) * 100)

      res.json({
        plan: planId,
        plan_name: plan.name,
        status: sub?.status || 'no_subscription',
        trial_end: sub?.trial_end,
        period_end: sub?.current_period_end,
        cancel_at_period_end: !!sub?.cancel_at_period_end,
        features: plan.features,
        available_agents: plan.available_agents,
        usage: {
          leads_this_month: leadsCount,
          leads_limit: leadsLimit,
          leads_pct: leadsPct,
          users_active: usersCount,
          users_limit: plan.max_users,
          offices_active: officesCount,
          offices_limit: plan.max_offices,
          agents_active: agentsCount,
          agents_limit: plan.max_agents,
          automations_active: automationsCount,
          automations_limit: plan.max_automations,
        },
      })
    } catch (e) {
      console.error('[Billing Status] Error:', e.message)
      res.status(500).json({ error: 'Error al obtener estado del plan' })
    }
  })

  // Consumo de IA del mes (para el panel y para vigilar costes)
  app.get('/api/billing/ai-usage', auth, async (req, res) => {
    try {
      res.json(await getAIUsageSummary(req.user.agency_id));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/billing/create-checkout', auth, async (req, res) => {
    try {
      const { planId, interval, paymentMethod, priceId, promoCode } = req.body;
      const agency = await get('SELECT * FROM agencies WHERE id = @aid', { aid: req.user.agency_id });
      if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' });
      if (!PLANS[planId]) return res.status(400).json({ error: 'Plan inválido' });
      const session = await stripe.createCheckoutSession(agency, planId, interval, paymentMethod, priceId, req.get('origin') || req.get('referer'), promoCode);
      res.json(session);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/billing/cancel', auth, (req, res) => {
    stripe.cancelSubscription(req.user.agency_id).then(r => res.json(r));
  });

  app.get('/api/billing/invoices', auth, async (req, res) => {
    const invoices = await stripe.getInvoices(req.user.agency_id);
    res.json(invoices);
  });

  app.get('/api/billing/paypal-return', auth, async (req, res) => {
    const { plan, subscription_id } = req.query;
    // El agency_id SIEMPRE del JWT — nunca del query param
    const agencyId = req.user.agency_id;

    if (!subscription_id) {
      return res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/pricing?error=missing_subscription`);
    }

    try {
      // Verificar que la suscripción realmente existe en PayPal y está activa
      const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
      const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
      const PAYPAL_BASE = process.env.NODE_ENV === 'production'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        console.error('[PayPal] Credenciales no configuradas');
        return res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/pricing?error=config`);
      }

      // Obtener token de acceso de PayPal
      const tokenRes = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`
        },
        body: 'grant_type=client_credentials'
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        console.error('[PayPal] No se pudo obtener access token:', tokenData);
        return res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/pricing?error=paypal_auth`);
      }

      // Verificar la suscripción contra la API de PayPal
      const subRes = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscription_id}`, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      const subData = await subRes.json();

      // Solo activar si PayPal confirma que la suscripción está activa
      if (subData.status !== 'ACTIVE') {
        console.warn('[PayPal] Suscripción no activa:', subData.status, subscription_id);
        return res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/pricing?error=subscription_not_active`);
      }

      await stripe.upsertSubscription({
        agency_id: agencyId,
        plan_id: plan || 'starter',
        status: 'active',
        billing_cycle: 'monthly',
        paypal_subscription_id: subscription_id,
        payment_method: 'paypal',
      });

      res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/pricing?success=true`);
    } catch (err) {
      console.error('[PayPal] Error verificando suscripción:', err.message);
      res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/pricing?error=verification_failed`);
    }
  });

  app.get('/api/calendar/auth-url', auth, (req, res) => {
    const userId = req.user.id;
    calendar.getAuthUrl(userId).then(r => res.json(r)).catch(err => {
      console.error('[Calendar] Error generando auth URL:', err.message);
      res.status(500).json({ error: 'Error generando URL de autorización.' });
    });
  });

  app.get('/api/calendar/events', auth, (req, res) => {
    const userId = req.user.id;
    const { dateFrom, dateTo } = req.query;
    calendar.getEvents(userId, dateFrom, dateTo).then(r => res.json(r)).catch(err => {
      console.error('[Calendar] Error obteniendo eventos:', err.message);
      res.status(500).json({ error: 'Error obteniendo eventos del calendario.' });
    });
  });

  // Rate limit muy agresivo para evitar abuso como relay de spam
  const emailTestLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3,
    message: { error: 'Máximo 3 emails de prueba por hora.' }
  });
  app.post('/api/email/test', auth, emailTestLimiter, async (req, res) => {
    // Solo permitir enviar al email del propio usuario autenticado
    const to = req.user.email;
    if (!to) return res.status(400).json({ error: 'Sin email de usuario.' });
    const { subject, html } = req.body;
    const result = await emailService.sendEmail({
      to,
      subject: subject || 'Test email CRM Inmobiliario',
      html: html || '<p>Test desde CRM Inmobiliario</p>',
    });
    res.json(result);
  });

  app.get('/api/health', async (req, res) => {
    try {
      const { get } = await import('./db/db.js');
      await get('SELECT 1 as ok');
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        db: 'connected'
      });
    } catch (err) {
      res.status(503).json({
        status: 'error',
        db: 'disconnected',
        error: err.message
      });
    }
  });

  app.get('/api/activities', auth, async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      // Usar siempre req.user.agency_id del JWT — nunca el header del cliente
      const agencyId = req.user.agency_id;
      const activities = await all(
        'SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON a.user_id = u.id WHERE a.agency_id = @agency_id ORDER BY a.created_at DESC LIMIT @limit OFFSET @offset',
        { agency_id: agencyId, limit: Number(limit), offset: Number(offset) }
      );
      res.json(activities);
    } catch (error) {
      console.error('Error listing activities:', error);
      res.status(500).json({ error: 'Error al obtener actividades.' });
    }
  });

  const dataDir = join(__dirname, '..', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const distPath = join(__dirname, '..', 'dist');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path.startsWith('/ws')) {
        return next();
      }
      const indexPath = join(distPath, 'index.html');
      if (existsSync(indexPath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(readFileSync(indexPath, 'utf-8'));
      } else {
        next();
      }
    });
    console.log(`📦 Sirviendo frontend estático desde ${distPath}`);
  } else {
    console.log('⚠️  Frontend no construido. Ejecuta "npm run build" para servirlo.');
    console.log('   El frontend en desarrollo se sirve desde Vite (http://localhost:5173)');
  }

  server.listen(PORT, () => {
    console.log(`🏢 CRM Inmobiliario API corriendo en puerto ${PORT}`);
    console.log(`📍 http://localhost:${PORT}/api/health`);
    console.log(`🌐 App completa: http://localhost:${PORT}`);

    // Start background appointment reminder worker (runs every 1 hour)
    import('./services/appointment-reminder-worker.js').then(({ startReminderWorker }) => {
      startReminderWorker(60 * 60 * 1000, process.env.APP_URL || `http://localhost:5173`);
    }).catch(err => {
      console.error('Error starting appointment reminder worker:', err);
    });
  });
}

async function runMigration() {
  const migrations = [
    { type: 'column', table: 'ai_agents', column: 'is_active', sql: `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true` },
    { type: 'column', table: 'ai_agents', column: 'stats', sql: `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS stats TEXT DEFAULT '{"leads_today":0,"messages_today":0,"automations_today":0,"conversions_today":0}'` },
    { type: 'column', table: 'conversations', column: 'ia_handling', sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ia_handling INTEGER DEFAULT 1` },
    { type: 'column', table: 'conversations', column: 'updated_at', sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TEXT` },
    { type: 'column', table: 'automations', column: 'description', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''` },
    { type: 'column', table: 'automations', column: 'is_active', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true` },
    { type: 'column', table: 'automations', column: 'trigger_type', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'lead_created'` },
    { type: 'column', table: 'automations', column: 'trigger_config', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS trigger_config TEXT DEFAULT '{}'` },
    { type: 'column', table: 'automations', column: 'conditions', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS conditions TEXT DEFAULT '[]'` },
    { type: 'column', table: 'automations', column: 'actions', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS actions TEXT DEFAULT '[]'` },
    { type: 'column', table: 'automations', column: 'run_count', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0` },
    { type: 'column', table: 'automations', column: 'last_run_at', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS last_run_at TEXT` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS automation_logs (
      id UUID PRIMARY KEY,
      automation_id UUID REFERENCES automations(id) ON DELETE CASCADE,
      lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
      agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'success',
      actions_executed TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW())
    )` },
    { type: 'column', table: 'automation_logs', column: 'agency_id', sql: `ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE` },
    { type: 'column', table: 'activities', column: 'title', sql: `ALTER TABLE activities ADD COLUMN IF NOT EXISTS title TEXT` },
    { type: 'column', table: 'activities', column: 'agent_type', sql: `ALTER TABLE activities ADD COLUMN IF NOT EXISTS agent_type TEXT` },
    { type: 'column', table: 'leads', column: 'last_contact_at', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at TEXT` },
    { type: 'column', table: 'leads', column: 'ia_score_label', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ia_score_label TEXT` },
    { type: 'column', table: 'leads', column: 'ia_next_action', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ia_next_action TEXT` },
    { type: 'column', table: 'leads', column: 'ia_insights', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ia_insights TEXT` },
    { type: 'column', table: 'leads', column: 'pipeline_stage', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT` },
    { type: 'column', table: 'leads', column: 'pipeline_stage_updated_at', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage_updated_at TEXT` },
    { type: 'column', table: 'leads', column: 'operation_type', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS operation_type TEXT` },
    { type: 'column', table: 'leads', column: 'budget_max', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_max REAL` },
    { type: 'column', table: 'leads', column: 'zones', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS zones TEXT` },
    { type: 'column', table: 'leads', column: 'urgency', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS urgency TEXT` },
    { type: 'column', table: 'leads', column: 'property_type', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_type TEXT` },
    { type: 'column', table: 'automations', column: 'destinations', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS destinations TEXT DEFAULT '[]'` },
    { type: 'column', table: 'automations', column: 'version', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 2` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS agency_destinations (
      id UUID PRIMARY KEY,
      agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      credentials TEXT DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      last_tested_at TEXT,
      last_test_ok INTEGER,
      created_at TEXT NOT NULL DEFAULT (NOW())
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_agency_destinations ON agency_destinations(agency_id, type, is_active)` },
    { type: 'column', table: 'agencies', column: 'email', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS email TEXT` },
    { type: 'column', table: 'agencies', column: 'phone', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS phone TEXT` },
    { type: 'column', table: 'agencies', column: 'whatsapp_token', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS whatsapp_token TEXT` },
    { type: 'column', table: 'agencies', column: 'whatsapp_phone_id', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS whatsapp_phone_id TEXT` },
    { type: 'column', table: 'agencies', column: 'whatsapp_number', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS whatsapp_number TEXT` },
    { type: 'column', table: 'agencies', column: 'address', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS address TEXT` },
    { type: 'column', table: 'agencies', column: 'city', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS city TEXT` },
    { type: 'column', table: 'agencies', column: 'website', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS website TEXT` },
    { type: 'column', table: 'agencies', column: 'instagram', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS instagram TEXT` },
    { type: 'column', table: 'agencies', column: 'facebook', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS facebook TEXT` },
    { type: 'column', table: 'agencies', column: 'linkedin', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS linkedin TEXT` },
    { type: 'column', table: 'agencies', column: 'tiktok', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS tiktok TEXT` },
    { type: 'column', table: 'agencies', column: 'cif', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS cif TEXT` },
    { type: 'column', table: 'agencies', column: 'legal_name', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS legal_name TEXT` },
    { type: 'column', table: 'agencies', column: 'sendgrid_api_key', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS sendgrid_api_key TEXT` },
    { type: 'column', table: 'agencies', column: 'sendgrid_from_email', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS sendgrid_from_email TEXT` },
    { type: 'column', table: 'agencies', column: 'sendgrid_from_name', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS sendgrid_from_name TEXT` },
    { type: 'column', table: 'agencies', column: 'smtp_host', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_host TEXT` },
    { type: 'column', table: 'agencies', column: 'smtp_port', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_port INTEGER` },
    { type: 'column', table: 'agencies', column: 'smtp_user', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_user TEXT` },
    { type: 'column', table: 'agencies', column: 'smtp_password', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_password TEXT` },
    { type: 'column', table: 'agencies', column: 'telegram_bot_token', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT` },
    { type: 'column', table: 'agencies', column: 'telegram_chat_id', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT` },
    { type: 'column', table: 'agencies', column: 'slack_webhook_url', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT` },
    { type: 'column', table: 'agencies', column: 'notion_api_key', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS notion_api_key TEXT` },
    { type: 'column', table: 'agencies', column: 'notion_database_id', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS notion_database_id TEXT` },
    { type: 'column', table: 'agencies', column: 'airtable_api_key', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS airtable_api_key TEXT` },
    { type: 'column', table: 'agencies', column: 'airtable_base_id', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS airtable_base_id TEXT` },
    { type: 'column', table: 'agencies', column: 'airtable_table', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS airtable_table TEXT` },
    { type: 'column', table: 'agencies', column: 'google_sheets_id', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS google_sheets_id TEXT` },
    { type: 'column', table: 'agencies', column: 'google_service_account', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS google_service_account TEXT` },
    { type: 'column', table: 'agencies', column: 'zapier_webhook_url', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zapier_webhook_url TEXT` },
    { type: 'column', table: 'agencies', column: 'make_webhook_url', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS make_webhook_url TEXT` },
    { type: 'column', table: 'agencies', column: 'n8n_webhook_url', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS n8n_webhook_url TEXT` },
    { type: 'column', table: 'agencies', column: 'onboarding_completed', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS onboarding_completed INTEGER DEFAULT 0` },
    { type: 'column', table: 'agencies', column: 'onboarding_step', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0` },
    { type: 'column', table: 'agencies', column: 'meta_page_id', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_page_id TEXT` },
    { type: 'column', table: 'agencies', column: 'plan', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'starter'` },
    { type: 'column', table: 'agencies', column: 'plan_status', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'trialing'` },
    { type: 'column', table: 'agencies', column: 'wa_verify_token', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS wa_verify_token TEXT` },
    { type: 'column', table: 'agencies', column: 'wa_webhook_token', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS wa_webhook_token TEXT` },
    { type: 'column', table: 'agencies', column: 'email_provider', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS email_provider TEXT DEFAULT 'sendgrid'` },
    { type: 'column', table: 'agencies', column: 'slugs', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS slugs TEXT` },
    { type: 'column', table: 'agencies', column: 'primary_color', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#6366f1'` },
    { type: 'column', table: 'agencies', column: 'secondary_color', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#8b5cf6'` },
    { type: 'column', table: 'agencies', column: 'logo_url', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS logo_url TEXT` },
    { type: 'column', table: 'agencies', column: 'custom_domain', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS custom_domain TEXT` },
    { type: 'column', table: 'agencies', column: 'province', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS province TEXT` },
    { type: 'column', table: 'agencies', column: 'country', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'ES'` },
    { type: 'column', table: 'agencies', column: 'timezone', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Madrid'` },
    { type: 'column', table: 'agencies', column: 'language', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'es'` },
    { type: 'column', table: 'agencies', column: 'bot_name', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS bot_name TEXT DEFAULT 'Asistente IA'` },
    { type: 'column', table: 'agencies', column: 'bot_tone', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS bot_tone TEXT DEFAULT 'profesional'` },
    { type: 'column', table: 'agencies', column: 'working_hours', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS working_hours TEXT DEFAULT '{"start":"09:00","end":"20:00","days":[1,2,3,4,5]}'` },
    { type: 'column', table: 'agencies', column: 'webhook_custom', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS webhook_custom TEXT` },
    // ── Control de mensajes, aprobación, RGPD, portales ─────────────────
    { type: 'column', table: 'agencies', column: 'ai_mode', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS ai_mode TEXT DEFAULT 'auto'` },
    { type: 'column', table: 'agencies', column: 'portal_inbox_token', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS portal_inbox_token TEXT` },
    { type: 'column', table: 'agencies', column: 'auto_assign', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS auto_assign BOOLEAN DEFAULT true` },
    { type: 'column', table: 'leads', column: 'portal', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS portal TEXT` },
    { type: 'column', table: 'leads', column: 'whatsapp_opt_out', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_opt_out BOOLEAN DEFAULT false` },
    { type: 'column', table: 'leads', column: 'opt_out_at', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ` },
    { type: 'column', table: 'leads', column: 'ai_paused', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN DEFAULT false` },
    { type: 'column', table: 'leads', column: 'ai_paused_at', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_paused_at TIMESTAMPTZ` },
    { type: 'column', table: 'leads', column: 'consent_notice_sent', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_notice_sent BOOLEAN DEFAULT false` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS pending_messages (
      id UUID PRIMARY KEY,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      agent_type TEXT,
      phone TEXT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      decided_by UUID,
      decided_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_pending_messages ON pending_messages(agency_id, status, created_at)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS portal_inbound_log (
      id UUID PRIMARY KEY,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      portal TEXT,
      from_email TEXT,
      subject TEXT,
      parsed TEXT,
      status TEXT NOT NULL,
      lead_id UUID,
      raw_excerpt TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_portal_inbound_log ON portal_inbound_log(agency_id, created_at)` },
    // Sin RLS estas tablas quedarían legibles con la clave anónima de Supabase.
    // Se activa sin políticas: el backend (rol propietario) las sigue usando.
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS marketing_leads (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      agency_name TEXT,
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )` },
    { type: 'sql', sql: `ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY` },
    { type: 'sql', sql: `ALTER TABLE pending_messages ENABLE ROW LEVEL SECURITY` },
    { type: 'sql', sql: `ALTER TABLE portal_inbound_log ENABLE ROW LEVEL SECURITY` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS automation_templates (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      difficulty TEXT DEFAULT 'basica',
      trigger_type TEXT NOT NULL,
      trigger_config TEXT DEFAULT '{}',
      conditions TEXT DEFAULT '[]',
      actions TEXT DEFAULT '[]',
      min_plan TEXT DEFAULT 'starter',
      requires TEXT DEFAULT '[]',
      installs INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      is_featured BOOLEAN DEFAULT false,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (NOW())
    )` },
    { type: 'column', table: 'users', column: 'whatsapp_number', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT` },
    { type: 'column', table: 'users', column: 'telegram_chat_id', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT` },
    { type: 'column', table: 'users', column: 'slack_user_id', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_user_id TEXT` },
    { type: 'column', table: 'users', column: 'notification_email', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email TEXT` },
    { type: 'column', table: 'users', column: 'signature', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS signature TEXT` },
    { type: 'column', table: 'conversations', column: 'agency_id', sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_conversations_agency ON conversations(agency_id)` },
    { type: 'column', table: 'users', column: 'timezone', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Madrid'` },
    { type: 'column', table: 'users', column: 'working_hours', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS working_hours TEXT DEFAULT '{"start":"09:00","end":"20:00","days":[1,2,3,4,5]}'` },
    { type: 'column', table: 'users', column: 'preferences', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences TEXT DEFAULT '{}'` },
    { type: 'sql', sql: `DROP VIEW IF EXISTS agency_full_context` },
    { type: 'sql', sql: `CREATE VIEW agency_full_context AS
      SELECT a.id AS agency_id, a.name AS agency_name, a.city AS agency_city,
        a.email AS agency_email, a.phone AS agency_phone,
        a.whatsapp_number AS agency_whatsapp, a.website AS agency_website,
        a.instagram AS agency_instagram, a.facebook AS agency_facebook,
        a.address AS agency_address,
        a.whatsapp_token AS wa_token, a.whatsapp_phone_id AS wa_phone_id,
        a.sendgrid_api_key AS sg_api_key, a.sendgrid_from_email AS sg_from_email,
        a.sendgrid_from_name AS sg_from_name,
        a.smtp_host, a.smtp_port, a.smtp_user, a.smtp_password,
        a.telegram_bot_token, a.telegram_chat_id, a.slack_webhook_url,
        a.notion_api_key, a.notion_database_id,
        a.airtable_api_key, a.airtable_base_id, a.airtable_table,
        a.google_sheets_id,
        a.zapier_webhook_url, a.make_webhook_url, a.n8n_webhook_url
      FROM agencies a` },
    { type: 'column', table: 'usage_counters', column: 'created_at', sql: `ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS created_at TEXT DEFAULT (NOW())` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS usage_monthly (
      id UUID PRIMARY KEY,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      counter TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW()),
      UNIQUE(agency_id, period, counter)
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_usage_monthly ON usage_monthly(agency_id, period, counter)` },
    { type: 'column', table: 'automations', column: 'template_id', sql: `ALTER TABLE automations ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES automation_templates(id) ON DELETE SET NULL` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_automations_template ON automations(agency_id, template_id)` },
    { type: 'column', table: 'agencies', column: 'online_meeting_url', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS online_meeting_url TEXT` },
    { type: 'column', table: 'agencies', column: 'appointment_attendant_name', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS appointment_attendant_name TEXT` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      type TEXT CHECK(type IN ('online','physical')) NOT NULL,
      status TEXT CHECK(status IN ('scheduled','confirmed','reschedule_requested','cancelled','completed','no_show')) NOT NULL DEFAULT 'scheduled',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      timezone TEXT DEFAULT 'Europe/Madrid',
      location TEXT,
      online_url TEXT,
      notes TEXT,
      client_token TEXT UNIQUE NOT NULL,
      reminder_48h_sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT NOT NULL DEFAULT (NOW())
    )` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS appointment_messages (
      id UUID PRIMARY KEY,
      appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      channel TEXT CHECK(channel IN ('email','whatsapp')) NOT NULL,
      type TEXT CHECK(type IN ('confirmation','reminder','update','cancel')) NOT NULL,
      status TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (NOW()),
      error TEXT
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_appointments_client_token ON appointments(client_token)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_appointments_lead ON appointments(lead_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_appointments_agency ON appointments(agency_id)` },
    // ── Properties new columns ──
    { type: 'column', table: 'properties', column: 'operation_type', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS operation_type TEXT DEFAULT 'sale'` },
    { type: 'column', table: 'properties', column: 'address', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS address TEXT` },
    { type: 'column', table: 'properties', column: 'province', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS province TEXT` },
    { type: 'column', table: 'properties', column: 'postal_code', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS postal_code TEXT` },
    { type: 'column', table: 'properties', column: 'floor', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor TEXT` },
    { type: 'column', table: 'properties', column: 'has_elevator', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_elevator INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'has_terrace', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_terrace INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'has_garage', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_garage INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'condition', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS condition TEXT` },
    { type: 'column', table: 'properties', column: 'source', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'` },
    { type: 'column', table: 'properties', column: 'external_source', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS external_source TEXT` },
    { type: 'column', table: 'properties', column: 'external_id', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS external_id TEXT` },
    { type: 'column', table: 'properties', column: 'external_url', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS external_url TEXT` },
    { type: 'column', table: 'properties', column: 'imported_at', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS imported_at TEXT` },
    { type: 'column', table: 'properties', column: 'updated_at', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS updated_at TEXT` },
    { type: 'column', table: 'properties', column: 'public_url', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS public_url TEXT` },
    // ── Agencias columns for Idealista ──
    { type: 'column', table: 'agencies', column: 'idealista_api_key', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS idealista_api_key TEXT` },
    { type: 'column', table: 'agencies', column: 'idealista_api_secret', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS idealista_api_secret TEXT` },
    { type: 'column', table: 'agencies', column: 'idealista_import_mode', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS idealista_import_mode TEXT DEFAULT 'url'` },
    { type: 'column', table: 'agencies', column: 'idealista_office_id', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS idealista_office_id TEXT` },
    // ── New indexes for properties ──
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_properties_source ON properties(source)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_properties_operation ON properties(operation_type)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_properties_external ON properties(external_source, external_id)` },
    { type: 'column', table: 'properties', column: 'assigned_to', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL` },
    { type: 'column', table: 'properties', column: 'quality_score', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'ai_generated', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS ai_generated INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'marketing_assets', sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS marketing_assets TEXT` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS property_leads (
      id UUID PRIMARY KEY,
      agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
      property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
      lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
      relation_type TEXT,
      match_score REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_leads_agency ON property_leads(agency_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_leads_property ON property_leads(property_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_leads_lead ON property_leads(lead_id)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS property_marketing_assets (
      id UUID PRIMARY KEY,
      agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
      property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
      type TEXT,
      title TEXT,
      content TEXT,
      channel TEXT,
      created_by_ai INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (NOW())
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_marketing_assets_agency ON property_marketing_assets(agency_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_marketing_assets_prop ON property_marketing_assets(property_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_properties_assigned ON properties(assigned_to)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS property_interests (
      id UUID PRIMARY KEY,
      property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'interested',
      channel TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW()),
      updated_at TEXT,
      UNIQUE(property_id, lead_id)
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_interests_property ON property_interests(property_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_interests_lead ON property_interests(lead_id)` },
    // ── Lead Automation new tables ──
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS communication_logs (
      id UUID PRIMARY KEY,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
      channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp','sms','call')),
      direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
      subject TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_message_id TEXT,
      error TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW())
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_comm_logs_lead ON communication_logs(lead_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_comm_logs_agency ON communication_logs(agency_id)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS lead_automations (
      id UUID PRIMARY KEY,
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      channel TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT,
      result TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW())
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_lead_automations_lead ON lead_automations(lead_id)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS lead_preferences (
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      preferred_channel TEXT DEFAULT 'whatsapp',
      preferred_time TEXT,
      consent_email INTEGER DEFAULT 0,
      consent_whatsapp INTEGER DEFAULT 0,
      consent_calls INTEGER DEFAULT 0,
      notes TEXT,
      PRIMARY KEY (lead_id)
    )` },
    { type: 'column', table: 'appointments', column: 'reminder_2h_sent_at', sql: `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_2h_sent_at TEXT` },
    { type: 'column', table: 'appointments', column: 'property_id', sql: `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL` },
    { type: 'column', table: 'agencies', column: 'email_signature', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS email_signature TEXT` },
    { type: 'column', table: 'agencies', column: 'auto_send_email', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS auto_send_email INTEGER DEFAULT 0` },
    { type: 'column', table: 'agencies', column: 'auto_send_whatsapp', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS auto_send_whatsapp INTEGER DEFAULT 0` },
    { type: 'column', table: 'agencies', column: 'require_email_confirmation', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS require_email_confirmation INTEGER DEFAULT 1` },
    { type: 'column', table: 'agencies', column: 'require_whatsapp_confirmation', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS require_whatsapp_confirmation INTEGER DEFAULT 1` },
    { type: 'column', table: 'agencies', column: 'default_channel', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS default_channel TEXT DEFAULT 'email'` },
    { type: 'column', table: 'agencies', column: 'reminder_2h_enabled', sql: `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS reminder_2h_enabled INTEGER DEFAULT 1` },
    { type: 'column', table: 'leads', column: 'last_channel', sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_channel TEXT` },
  ];

  for (const migration of migrations) {
    try {
      await run(migration.sql);
    } catch (e) {
      // Ignorar si la tabla/columna/índice/vista ya existe o no se puede recrear temporalmente
      console.log(`[Migration] Aviso (${migration.table || migration.type}):`, e.message);
    }
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// seedDemoData eliminada — las agencias nuevas empiezan con datos vacíos

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.error(err.stack);
  // Solo matar el proceso en errores realmente fatales (no errores de red o BD)
  if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE' && err.code !== 'ENOTFOUND') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  // Loguear siempre pero NO matar el proceso — una promesa suelta de red/BD
  // (logActivity, calendar.getEvents, etc.) no debe tumbar el servidor entero
  // para todas las agencias conectadas. Si necesitas strictness, audita cada
  // punto con .catch() y luego vuelve a activar process.exit(1) aquí.
  const message = reason instanceof Error ? reason.message : String(reason);
  const code = reason instanceof Error ? reason.code : undefined;
  const ignoreCodes = ['ECONNRESET', 'EPIPE', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED'];
  if (ignoreCodes.includes(code)) {
    // Error de red transitorio — loguear en debug, no alertar
    console.debug('[UnhandledRejection] Network error (ignored):', message);
  } else {
    console.error('[UnhandledRejection] Unhandled promise rejection:', message);
    console.error('Promise:', promise);
    if (reason instanceof Error) console.error(reason.stack);
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando gracefully...');
  server.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
});
