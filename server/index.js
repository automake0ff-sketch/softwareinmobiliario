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
import { initDB, all, get, run, saveDB } from './db/db.js';
import { defaultQueue, JobQueue } from './services/queue.js';
import { initRealtime, RealtimeService } from './services/realtime.js';
import { BillingService, checkPlanLimit, PLANS, PAYMENT_METHODS } from './services/stripe.js';
import CalendarService from './services/calendar.js';
import EmailService from './services/email.js';
import TwilioService from './services/twilio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3002', '*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      return callback(null, true);
    } else {
      return callback(new Error('No permitido por CORS.'));
    }
  },
  credentials: true
}));

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
    if (process.env.STRIPE_SECRET_KEY && sig) {
      try {
        const { default: Stripe } = await import('stripe');
        const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
        event = stripeInstance.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (importErr) {
        event = JSON.parse(req.body.toString());
      }
    } else {
      event = JSON.parse(req.body.toString());
    }
    const result = await stripe.handleWebhook(event);
    res.json(result);
  } catch (e) {
    console.error('[STRIPE] Webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.post('/webhooks/paypal', webhookLimiter, express.json({ type: 'application/json' }), async (req, res) => {
  try {
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
     VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, @metadata, datetime('now'))`,
    {
      id: uuidv4(), agency_id: agencyId, lead_id: leadId, user_id: userId,
      type, description, metadata: metadata ? JSON.stringify(metadata) : null,
    }
  );
}

async function start() {
  await initDB();

  const { auth } = await import('./middleware/auth.js');
  const leadsRouter = (await import('./routes/leads.js')).default;
  const propertiesRouter = (await import('./routes/properties.js')).default;
  const agentsRouter = (await import('./routes/agents.js')).default;
  const agencyRouter = (await import('./routes/agency.js')).default;
  const conversationsRouter = (await import('./routes/conversations.js')).default;
  const appointmentsRouter = (await import('./routes/appointments.js')).default;
  const agentByTypeRouter = (await import('./routes/agent-by-type.js')).default;
  const aiAgentsRouter = (await import('./routes/ai-agents.js')).default;
  const { default: metaWebhook } = await import('./webhooks/meta.js');
  const { default: whatsappWebhook, waClient, MESSAGE_TEMPLATES } = await import('./webhooks/whatsapp.js');

  app.use('/api/leads', leadsRouter);
  app.use('/api/properties', propertiesRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/agency', agencyRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api', appointmentsRouter);
  app.use('/webhooks/meta', webhookLimiter, metaWebhook);
  app.use('/webhooks/whatsapp', webhookLimiter, whatsappWebhook);
  app.use('/api/rag', (await import('./routes/rag.js')).default);
  app.use('/api/tools', (await import('./routes/tools.js')).default);
  app.use('/api/mcp', (await import('./routes/mcp.js')).default);
  app.use('/api/automations', (await import('./routes/automations.js')).default);
  app.use('/api/automations', (await import('./routes/automations-execute-realtime.js')).default);
  app.use('/api/destinations', (await import('./routes/destinations.js')).default);
  app.use('/api/auth/register', authLimiter, (await import('./routes/register.js')).default);
  app.use('/api/login', authLimiter, (await import('./routes/login.js')).default);
  // Endpoint para sincronizar sesión social y obtener JWT propio
  const authSyncRouter = (await import('./routes/auth-sync.js')).default;
  app.use('/api/auth', authSyncRouter);
  app.use('/api/templates', (await import('./routes/templates.js')).default);
  app.use('/api/admin', (await import('./routes/admin.js')).default);
  app.use('/api/leads', (await import('./routes/lead-preferences.js')).default);
  app.use('/api/agents', agentByTypeRouter);
  app.use('/api/ai-agents', aiAgentsRouter);

  // Run DB migrations for automations table
  await runMigration();

  app.use((err, req, res, next) => {
    console.error('[UNHANDLED ERROR]', err.stack || err.message || err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  defaultQueue.on('process_message', async (job) => {
    try {
      const { leadId, messageBody, messageType, phoneNumber, conversationId, agencyId } = job.data;
      const lead = get('SELECT * FROM leads WHERE id = @id', { id: leadId });
      if (!lead) throw new Error('Lead not found');

      const conversation = get('SELECT * FROM conversations WHERE id = @id', { id: conversationId });
      const history = conversation ? JSON.parse(conversation.messages || '[]') : [];
      const status = lead.status || 'nuevo';

      let agentType = 'captador';
      if (status === 'contactado' || status === 'interesado') agentType = 'vendedor';
      else if (status === 'visita_agendada') agentType = 'agendador';
      else if (status === 'negociacion') agentType = 'vendedor';
      else if (status === 'reserva') agentType = 'documentador';
      else if (status === 'cerrado') agentType = 'notificador';

      const { AgentOrchestrator } = await import('./services/agent-orchestrator.js');
      const orchestrator = new AgentOrchestrator(agencyId);
      
      // Ejecución nativa del orquestador completo
      const results = await orchestrator.runForLead(leadId, 'message_received', {
        last_message: messageBody,
      });

      const agentResult = results[0] || {};
      const agentResponse = agentResult.message || '';

      if (lead.status === 'nuevo') {
        run("UPDATE leads SET status = 'contactado', updated_at = datetime('now') WHERE id = @id", { id: leadId });
      }
      run("UPDATE leads SET last_activity = datetime('now'), updated_at = datetime('now') WHERE id = @id", { id: leadId });

      logActivity(
        agencyId, leadId, null, 'ia_response',
        `[${agentType}] Respuesta automática enviada: "${agentResponse.substring(0, 80)}..."`,
        { agentType, messageId: job.data.messageId }
      );

      if (realtime) {
        realtime.broadcastAgentAction(agentType, {
          leadId, leadName: lead.name, response: agentResponse.substring(0, 100),
        });
        realtime.broadcastActivity({
          type: 'ia_response', leadId, leadName: lead.name, agentType,
          description: `Respuesta generada por ${agentType}`,
        });
      }
    } catch (e) {
      console.error('[QUEUE] process_message error:', e.message);
      throw e;
    }
  });

  defaultQueue.on('process_new_lead', async (job) => {
    try {
      const { leadId, agencyId, source, utm } = job.data;
      const lead = get('SELECT * FROM leads WHERE id = @id', { id: leadId });
      if (!lead) throw new Error('Lead not found');

      const comerciales = all(
        `SELECT u.*, (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status NOT IN ('cerrado','reserva')) as active_leads
         FROM users u WHERE u.role = 'comercial' AND u.agency_id = @agency_id AND u.active = 1
         ORDER BY active_leads ASC LIMIT 1`,
        { agency_id: agencyId }
      );

      if (comerciales && comerciales.length > 0) {
        const comercial = comerciales[0];
        run("UPDATE leads SET assigned_to = @assigned_to, updated_at = datetime('now') WHERE id = @id",
          { assigned_to: comercial.id, id: leadId });
        logActivity(agencyId, leadId, comercial.id, 'lead_assigned',
          `Lead asignado automáticamente a ${comercial.name}`, { comercialId: comercial.id, source });
      }

      const welcomeMessage = `¡Hola ${lead.name}! 👋 Soy el asistente virtual de ${process.env.AGENCY_NAME || 'InmoTech Realty'}. Hemos recibido tu información y estamos buscando las mejores propiedades para ti. ¿En qué puedo ayudarte?`;

      if (lead.phone) {
        try {
          await waClient.sendText(lead.phone, welcomeMessage);
        } catch (e) {
          console.error('[QUEUE] Welcome send error:', e.message);
        }
      }

      const convId = uuidv4();
      run(
        `INSERT INTO conversations (id, lead_id, channel, messages, created_at)
         VALUES (@id, @lead_id, @channel, @messages, datetime('now'))`,
        {
          id: convId, lead_id: leadId, channel: source === 'meta_ads' ? 'web' : 'whatsapp',
          messages: JSON.stringify([{ role: 'agent', content: welcomeMessage, timestamp: new Date().toISOString() }]),
        }
      );

      logActivity(agencyId, leadId, null, 'ia_welcome',
        `Mensaje de bienvenida enviado a ${lead.name}`, { source, utm });

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
      const automations = all(
        'SELECT * FROM automations WHERE agency_id = @agency_id AND trigger_event = @trigger AND is_active = 1',
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
        const managers = all('SELECT * FROM users WHERE agency_id = @agency_id AND role = \'manager\'', { agency_id: agencyId });
        const leads = all('SELECT * FROM leads WHERE agency_id = @agency_id');
        const tasks = all('SELECT * FROM tasks WHERE completed = 0');
        const visits = all('SELECT * FROM activities WHERE type = \'visita\' AND created_at >= datetime(\'now\', \'-1 day\')');
        const properties = all('SELECT * FROM properties WHERE agency_id = @agency_id AND status = \'disponible\'', { agency_id: agencyId });

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

  app.get('/api/queue/stats', (req, res) => {
    const stats = defaultQueue.getStats();
    res.json(stats);
  });

  app.get('/api/realtime/clients', (req, res) => {
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

      const leadsToday = get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= @today", { aid, today })?.count || 0;
      const totalLeads = get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid", { aid })?.count || 0;
      const leadsThisMonth = get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= @som", { aid, som: somStr })?.count || 0;

      const leadsYesterday = get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= @yesterday AND created_at < @today", { aid, yesterday, today })?.count || 0;

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

      const messagesToday = get("SELECT COUNT(*) as count FROM messages m JOIN conversations c ON m.conversation_id = c.id JOIN leads l ON c.lead_id = l.id WHERE l.agency_id = @aid AND m.created_at >= @today", { aid, today })?.count || 0;
      const messagesYesterday = get("SELECT COUNT(*) as count FROM messages m JOIN conversations c ON m.conversation_id = c.id JOIN leads l ON c.lead_id = l.id WHERE l.agency_id = @aid AND m.created_at >= @yesterday AND m.created_at < @today", { aid, yesterday, today })?.count || 0;

      let messagesPctChange = '0%';
      let messagesTrend = 'up';
      if (messagesYesterday > 0) {
        const diff = messagesToday - messagesYesterday;
        const pct = Math.round((diff / messagesYesterday) * 100);
        messagesPctChange = (pct >= 0 ? '+' : '') + pct + '%';
        messagesTrend = pct >= 0 ? 'up' : 'down';
      } else if (messagesToday > 0) {
        messagesPctChange = '+100%';
        messagesTrend = 'up';
      } else {
        messagesPctChange = '0%';
        messagesTrend = 'down';
      }

      const automationsRun = get("SELECT COUNT(*) as count FROM activities WHERE agency_id = @aid AND type = 'automation' AND created_at >= @today", { aid, today })?.count || 0;

      const activeAgents = get("SELECT COUNT(*) as count FROM ai_agents WHERE agency_id = @aid AND status = 'active'", { aid })?.count || 0;

      const pipelineStats = all("SELECT status, COUNT(*) as count FROM leads WHERE agency_id = @aid GROUP BY status", { aid });
      const totalPipeline = pipelineStats.reduce((sum, s) => sum + s.count, 0);

      const totalProperties = get("SELECT COUNT(*) as count FROM properties WHERE agency_id = @aid", { aid })?.count || 0;

      const activities = all(
        "SELECT id, type, title, description, created_at FROM activities WHERE agency_id = @aid ORDER BY created_at DESC LIMIT 20",
        { aid }
      );

      const conversions = all(
        "SELECT DATE(created_at) as day, COUNT(*) as leads FROM leads WHERE agency_id = @aid AND created_at >= datetime('now', '-14 days') GROUP BY DATE(created_at) ORDER BY day",
        { aid }
      );

      res.json({
        liveStats: [
          { id: 1, label: 'Agentes IA activos', value: activeAgents, icon: 'Bot', change: '', trend: 'up' },
          { id: 2, label: 'Leads hoy', value: leadsToday, icon: 'Users', change: leadsPctChange, trend: leadsTrend },
          { id: 3, label: 'Mensajes enviados hoy', value: messagesToday, icon: 'MessageSquare', change: messagesPctChange, trend: messagesTrend },
          { id: 4, label: 'Automatizaciones ejecutadas', value: automationsRun, icon: 'Zap', change: '', trend: 'up' },
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
      const subs = all('SELECT * FROM subscriptions WHERE agency_id = @aid ORDER BY created_at DESC LIMIT 1', { aid: agencyId })
      const sub = subs?.[0]
      const planId = sub?.plan_id || 'starter'
      const plan = PLANS[planId] || PLANS.starter
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      const somStr = startOfMonth.toISOString()

      const leadsCount = get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= @som", { aid: agencyId, som: somStr })?.count || 0
      const usersCount = get("SELECT COUNT(*) as count FROM users WHERE agency_id = @aid AND active = 1", { aid: agencyId })?.count || 0
      const officesCount = get("SELECT COUNT(*) as count FROM offices WHERE agency_id = @aid", { aid: agencyId })?.count || 0
      const agentsCount = get("SELECT COUNT(*) as count FROM ai_agents WHERE agency_id = @aid AND status = 'active'", { aid: agencyId })?.count || 0
      const automationsCount = get("SELECT COUNT(*) as count FROM automations WHERE agency_id = @aid AND is_active = 1", { aid: agencyId })?.count || 0

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

  app.post('/api/billing/create-checkout', auth, async (req, res) => {
    try {
      const { planId, interval, paymentMethod, priceId } = req.body;
      const agency = get('SELECT * FROM agencies WHERE id = @aid', { aid: req.user.agency_id });
      if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' });
      if (!PLANS[planId]) return res.status(400).json({ error: 'Plan inválido' });
      const session = await stripe.createCheckoutSession(agency, planId, interval, paymentMethod, priceId);
      res.json(session);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/checkout', async (req, res) => {
    try {
      const { idUsuarioActual, emailUsuarioActual, idPrecio } = req.body;

      if (!idUsuarioActual || !emailUsuarioActual) {
        return res.status(400).json({ error: 'Falta el ID o el Email del usuario actual.' });
      }

      if (!process.env.STRIPE_SECRET_KEY) {
        // Dev mock session url
        return res.json({ url: `${process.env.APP_URL || 'http://localhost:5173'}/dashboard?success=true` });
      }

      const { default: Stripe } = await import('stripe');
      const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
      
      const session = await stripeInstance.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        client_reference_id: String(idUsuarioActual),
        customer_email: emailUsuarioActual,
        line_items: [
          {
            price: idPrecio || process.env.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `${process.env.APP_URL || 'http://localhost:5173'}/dashboard?success=true`,
        cancel_url: `${process.env.APP_URL || 'http://localhost:5173'}/pricing?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error('Error al crear sesión de Stripe:', error);
      res.status(500).json({ error: 'Error interno al procesar el pago' });
    }
  });

  app.post('/api/billing/cancel', auth, (req, res) => {
    stripe.cancelSubscription(req.user.agency_id).then(r => res.json(r));
  });

  app.get('/api/billing/invoices', auth, async (req, res) => {
    const invoices = await stripe.getInvoices(req.user.agency_id);
    res.json(invoices);
  });

  app.get('/api/billing/paypal-return', async (req, res) => {
    const { plan, agency, subscription_id, ba_token } = req.query;
    if (subscription_id && agency) {
      await stripe.upsertSubscription({
        agency_id: agency,
        plan_id: plan || 'starter',
        status: 'active',
        billing_cycle: 'monthly',
        paypal_subscription_id: subscription_id,
        payment_method: 'paypal',
      });
    }
    res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/pricing?success=true`);
  });

  app.get('/api/calendar/auth-url', (req, res) => {
    const userId = req.headers['x-auth-user'] || 'default';
    calendar.getAuthUrl(userId).then(r => res.json(r));
  });

  app.get('/api/calendar/events', (req, res) => {
    const userId = req.headers['x-auth-user'] || 'default';
    const { dateFrom, dateTo } = req.query;
    calendar.getEvents(userId, dateFrom, dateTo).then(r => res.json(r));
  });

  app.post('/api/email/test', async (req, res) => {
    const { to, subject, html } = req.body;
    const result = await emailService.sendEmail({
      to: to || 'test@example.com',
      subject: subject || 'Test email',
      html: html || '<p>Test from CRM Inmobiliario</p>',
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

  app.get('/api/activities', (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const agencyId = req.headers['x-auth-agency'];
      if (!agencyId) return res.status(400).json({ error: 'Agency header required' });
      const activities = all(
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

  try {
    const count = get('SELECT COUNT(*) as count FROM agencies');
    if (count && count.count > 0) {
      seedAutomationsForExistingAgencies();
      
      // Auto-seed de agentes para todas las agencias existentes (Corrección del error del front)
      const agencies = all('SELECT id FROM agencies');
      const DEFAULT_AGENTS = [
        { type: 'captador',    name: 'Captador IA' },
        { type: 'vendedor',    name: 'Vendedor IA' },
        { type: 'coordinador', name: 'Coordinador IA' },
        { type: 'copywriter',  name: 'Copywriter IA' },
        { type: 'tasador',     name: 'Tasador IA' },
        { type: 'analista',    name: 'Analista IA' },
        { type: 'agendador',   name: 'Agendador IA' },
        { type: 'nurturing',   name: 'Nurturing IA' },
        { type: 'documentador',name: 'Documentador IA' },
        { type: 'seo',         name: 'SEO IA' },
        { type: 'financiero',  name: 'Financiero IA' },
        { type: 'notificador', name: 'Notificador IA' },
      ];
      for (const agency of agencies) {
        for (const da of DEFAULT_AGENTS) {
          const exists = get('SELECT id FROM ai_agents WHERE agency_id = @aid AND type = @type', { aid: agency.id, type: da.type });
          if (!exists) {
            run(
              `INSERT INTO ai_agents (id, agency_id, type, name, is_active, status, stats, created_at)
               VALUES (@id, @agency_id, @type, @name, 1, 'active', @stats, datetime('now'))`,
              {
                id: uuidv4(),
                agency_id: agency.id,
                type: da.type,
                name: da.name,
                stats: JSON.stringify({ leads_today: 0, messages_today: 0, success_rate: null }),
              }
            );
          }
        }
      }
      console.log('[Seed] Agentes IA autosembrados y activos.');
    }
  } catch (e) {
    console.log('[Seed] Error in initial seeding:', e.message);
  }

  try {
    const { seedDestinationsAutomations } = await import('./services/seed-automations.js');
    seedDestinationsAutomations();
  } catch (e) {
    console.log('[Seed] Error seeding destination automations:', e.message);
  }

  try {
    const { seedN8nAutomations } = await import('./services/seed-n8n-automations.js');
    seedN8nAutomations();
  } catch (e) {
    console.log('[Seed] Error seeding n8n automations:', e.message);
  }

  try {
    const { seedAutomationTemplates } = await import('./services/seed-templates.js');
    seedAutomationTemplates();
  } catch (e) {
    console.log('[Seed] Error seeding templates:', e.message);
  }

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
    initializeRAG();

    // Start background appointment reminder worker (runs every 1 hour)
    import('./services/appointment-reminder-worker.js').then(({ startReminderWorker }) => {
      startReminderWorker(60 * 60 * 1000, process.env.APP_URL || `http://localhost:5173`);
    }).catch(err => {
      console.error('Error starting appointment reminder worker:', err);
    });
  });
}

function generateAgentResponse(agentType, lead, messageBody, history) {
  const name = lead.name || '';

  const responses = {
    captador: [
      `¡Gracias por tu mensaje, ${name}! 🏠 Me encantaría saber más sobre lo que buscas para ayudarte a encontrar la propiedad perfecta. ¿Podrías contarme más detalles?`,
      `Hola ${name}, hemos recibido tu consulta. Contamos con excelentes opciones en ${lead.zone || 'tu zona de interés'}. ¿Te gustaría recibir información de las propiedades disponibles?`,
      `¡Bienvenido ${name}! 👋 Somos ${process.env.AGENCY_NAME || 'InmoTech Realty'}. ¿Qué tipo de propiedad estás buscando? Así puedo recomendarte las mejores opciones.`,
    ],
    vendedor: [
      `¡Excelente pregunta, ${name}! Esta propiedad tiene características únicas. ¿Te gustaría agendar una visita para verla en persona? Podemos coordinar el día y hora que mejor te venga.`,
      `${name}, me alegra que estés interesado. Esta es una oportunidad única en el mercado. ¿Qué te parece si te llamo para contarte más detalles y resolver todas tus dudas?`,
      `Hola ${name}, gracias por tu interés. Tengo justo lo que necesitas. ¿Podemos agendar una visita esta semana?`,
    ],
    agendador: [
      `¡Perfecto, ${name}! 🗓️ Podemos agendar tu visita para el día que prefieras. ¿Qué tal mañana o pasado? Estamos disponibles en horario de 9:00 a 19:00.`,
      `Hola ${name}, ya tengo tu visita casi lista. ¿Qué día y hora te viene mejor? La visita dura aproximadamente 45 minutos.`,
    ],
    documentador: [
      `${name}, para continuar con el proceso necesitamos la siguiente documentación: DNI/NIE, última declaración de la renta, y contrato de arras firmado. ¿Puedes enviárnosla?`,
      `¡Enhorabuena por tu decisión, ${name}! 🎉 Ahora necesitamos gestionar la documentación. Te enviaré la lista de documentos necesarios para formalizar la operación.`,
    ],
    notificador: [
      `${name}, te mantenemos al tanto de las novedades. Seguimos disponibles para cualquier gestión que necesites relacionada con tu propiedad.`,
      `Hola ${name}, espero que todo vaya bien. Queríamos recordarte que estamos a tu disposición para cualquier consulta postventa.`,
    ],
  };

  const agentResponses = responses[agentType] || responses.captador;
  const idx = Math.floor(Math.random() * agentResponses.length);
  return agentResponses[idx];
}

// DB Migration: Expand tables schema
async function runMigration() {
  function columnExists(tableName, columnName) {
    try {
      const columns = all(`PRAGMA table_info(${tableName})`);
      return columns.some(c => c.name === columnName);
    } catch (e) {
      return false;
    }
  }

  const migrations = [
    { type: 'column', table: 'ai_agents', column: 'is_active', sql: `ALTER TABLE ai_agents ADD COLUMN is_active INTEGER DEFAULT 1` },
    { type: 'column', table: 'ai_agents', column: 'stats', sql: `ALTER TABLE ai_agents ADD COLUMN stats TEXT DEFAULT '{"leads_today":0,"messages_today":0,"automations_today":0,"conversions_today":0}'` },
    { type: 'column', table: 'conversations', column: 'ia_handling', sql: `ALTER TABLE conversations ADD COLUMN ia_handling INTEGER DEFAULT 1` },
    { type: 'column', table: 'conversations', column: 'updated_at', sql: `ALTER TABLE conversations ADD COLUMN updated_at TEXT` },
    { type: 'column', table: 'automations', column: 'description', sql: `ALTER TABLE automations ADD COLUMN description TEXT DEFAULT ''` },
    { type: 'column', table: 'automations', column: 'is_active', sql: `ALTER TABLE automations ADD COLUMN is_active INTEGER DEFAULT 1` },
    { type: 'column', table: 'automations', column: 'trigger_type', sql: `ALTER TABLE automations ADD COLUMN trigger_type TEXT DEFAULT 'lead_created'` },
    { type: 'column', table: 'automations', column: 'trigger_config', sql: `ALTER TABLE automations ADD COLUMN trigger_config TEXT DEFAULT '{}'` },
    { type: 'column', table: 'automations', column: 'conditions', sql: `ALTER TABLE automations ADD COLUMN conditions TEXT DEFAULT '[]'` },
    { type: 'column', table: 'automations', column: 'actions', sql: `ALTER TABLE automations ADD COLUMN actions TEXT DEFAULT '[]'` },
    { type: 'column', table: 'automations', column: 'run_count', sql: `ALTER TABLE automations ADD COLUMN run_count INTEGER DEFAULT 0` },
    { type: 'column', table: 'automations', column: 'last_run_at', sql: `ALTER TABLE automations ADD COLUMN last_run_at TEXT` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS automation_logs (
      id TEXT PRIMARY KEY,
      automation_id TEXT REFERENCES automations(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'success',
      actions_executed TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )` },
    { type: 'column', table: 'automation_logs', column: 'agency_id', sql: `ALTER TABLE automation_logs ADD COLUMN agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE` },
    { type: 'column', table: 'activities', column: 'title', sql: `ALTER TABLE activities ADD COLUMN title TEXT` },
    { type: 'column', table: 'activities', column: 'agent_type', sql: `ALTER TABLE activities ADD COLUMN agent_type TEXT` },
    { type: 'column', table: 'leads', column: 'last_contact_at', sql: `ALTER TABLE leads ADD COLUMN last_contact_at TEXT` },
    { type: 'column', table: 'leads', column: 'ia_score_label', sql: `ALTER TABLE leads ADD COLUMN ia_score_label TEXT` },
    { type: 'column', table: 'leads', column: 'ia_next_action', sql: `ALTER TABLE leads ADD COLUMN ia_next_action TEXT` },
    { type: 'column', table: 'leads', column: 'ia_insights', sql: `ALTER TABLE leads ADD COLUMN ia_insights TEXT` },
    { type: 'column', table: 'leads', column: 'pipeline_stage', sql: `ALTER TABLE leads ADD COLUMN pipeline_stage TEXT` },
    { type: 'column', table: 'leads', column: 'pipeline_stage_updated_at', sql: `ALTER TABLE leads ADD COLUMN pipeline_stage_updated_at TEXT` },
    { type: 'column', table: 'leads', column: 'operation_type', sql: `ALTER TABLE leads ADD COLUMN operation_type TEXT` },
    { type: 'column', table: 'leads', column: 'budget_max', sql: `ALTER TABLE leads ADD COLUMN budget_max REAL` },
    { type: 'column', table: 'leads', column: 'zones', sql: `ALTER TABLE leads ADD COLUMN zones TEXT` },
    { type: 'column', table: 'leads', column: 'urgency', sql: `ALTER TABLE leads ADD COLUMN urgency TEXT` },
    { type: 'column', table: 'leads', column: 'property_type', sql: `ALTER TABLE leads ADD COLUMN property_type TEXT` },
    { type: 'column', table: 'automations', column: 'destinations', sql: `ALTER TABLE automations ADD COLUMN destinations TEXT DEFAULT '[]'` },
    { type: 'column', table: 'automations', column: 'version', sql: `ALTER TABLE automations ADD COLUMN version INTEGER DEFAULT 2` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS agency_destinations (
      id TEXT PRIMARY KEY,
      agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      credentials TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      last_tested_at TEXT,
      last_test_ok INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_agency_destinations ON agency_destinations(agency_id, type, is_active)` },
    { type: 'column', table: 'agencies', column: 'email', sql: `ALTER TABLE agencies ADD COLUMN email TEXT` },
    { type: 'column', table: 'agencies', column: 'phone', sql: `ALTER TABLE agencies ADD COLUMN phone TEXT` },
    { type: 'column', table: 'agencies', column: 'whatsapp_token', sql: `ALTER TABLE agencies ADD COLUMN whatsapp_token TEXT` },
    { type: 'column', table: 'agencies', column: 'whatsapp_phone_id', sql: `ALTER TABLE agencies ADD COLUMN whatsapp_phone_id TEXT` },
    { type: 'column', table: 'agencies', column: 'whatsapp_number', sql: `ALTER TABLE agencies ADD COLUMN whatsapp_number TEXT` },
    { type: 'column', table: 'agencies', column: 'address', sql: `ALTER TABLE agencies ADD COLUMN address TEXT` },
    { type: 'column', table: 'agencies', column: 'city', sql: `ALTER TABLE agencies ADD COLUMN city TEXT` },
    { type: 'column', table: 'agencies', column: 'website', sql: `ALTER TABLE agencies ADD COLUMN website TEXT` },
    { type: 'column', table: 'agencies', column: 'instagram', sql: `ALTER TABLE agencies ADD COLUMN instagram TEXT` },
    { type: 'column', table: 'agencies', column: 'facebook', sql: `ALTER TABLE agencies ADD COLUMN facebook TEXT` },
    { type: 'column', table: 'agencies', column: 'linkedin', sql: `ALTER TABLE agencies ADD COLUMN linkedin TEXT` },
    { type: 'column', table: 'agencies', column: 'tiktok', sql: `ALTER TABLE agencies ADD COLUMN tiktok TEXT` },
    { type: 'column', table: 'agencies', column: 'cif', sql: `ALTER TABLE agencies ADD COLUMN cif TEXT` },
    { type: 'column', table: 'agencies', column: 'legal_name', sql: `ALTER TABLE agencies ADD COLUMN legal_name TEXT` },
    { type: 'column', table: 'agencies', column: 'sendgrid_api_key', sql: `ALTER TABLE agencies ADD COLUMN sendgrid_api_key TEXT` },
    { type: 'column', table: 'agencies', column: 'sendgrid_from_email', sql: `ALTER TABLE agencies ADD COLUMN sendgrid_from_email TEXT` },
    { type: 'column', table: 'agencies', column: 'sendgrid_from_name', sql: `ALTER TABLE agencies ADD COLUMN sendgrid_from_name TEXT` },
    { type: 'column', table: 'agencies', column: 'smtp_host', sql: `ALTER TABLE agencies ADD COLUMN smtp_host TEXT` },
    { type: 'column', table: 'agencies', column: 'smtp_port', sql: `ALTER TABLE agencies ADD COLUMN smtp_port INTEGER` },
    { type: 'column', table: 'agencies', column: 'smtp_user', sql: `ALTER TABLE agencies ADD COLUMN smtp_user TEXT` },
    { type: 'column', table: 'agencies', column: 'smtp_password', sql: `ALTER TABLE agencies ADD COLUMN smtp_password TEXT` },
    { type: 'column', table: 'agencies', column: 'telegram_bot_token', sql: `ALTER TABLE agencies ADD COLUMN telegram_bot_token TEXT` },
    { type: 'column', table: 'agencies', column: 'telegram_chat_id', sql: `ALTER TABLE agencies ADD COLUMN telegram_chat_id TEXT` },
    { type: 'column', table: 'agencies', column: 'slack_webhook_url', sql: `ALTER TABLE agencies ADD COLUMN slack_webhook_url TEXT` },
    { type: 'column', table: 'agencies', column: 'notion_api_key', sql: `ALTER TABLE agencies ADD COLUMN notion_api_key TEXT` },
    { type: 'column', table: 'agencies', column: 'notion_database_id', sql: `ALTER TABLE agencies ADD COLUMN notion_database_id TEXT` },
    { type: 'column', table: 'agencies', column: 'airtable_api_key', sql: `ALTER TABLE agencies ADD COLUMN airtable_api_key TEXT` },
    { type: 'column', table: 'agencies', column: 'airtable_base_id', sql: `ALTER TABLE agencies ADD COLUMN airtable_base_id TEXT` },
    { type: 'column', table: 'agencies', column: 'airtable_table', sql: `ALTER TABLE agencies ADD COLUMN airtable_table TEXT` },
    { type: 'column', table: 'agencies', column: 'google_sheets_id', sql: `ALTER TABLE agencies ADD COLUMN google_sheets_id TEXT` },
    { type: 'column', table: 'agencies', column: 'google_service_account', sql: `ALTER TABLE agencies ADD COLUMN google_service_account TEXT` },
    { type: 'column', table: 'agencies', column: 'zapier_webhook_url', sql: `ALTER TABLE agencies ADD COLUMN zapier_webhook_url TEXT` },
    { type: 'column', table: 'agencies', column: 'make_webhook_url', sql: `ALTER TABLE agencies ADD COLUMN make_webhook_url TEXT` },
    { type: 'column', table: 'agencies', column: 'n8n_webhook_url', sql: `ALTER TABLE agencies ADD COLUMN n8n_webhook_url TEXT` },
    { type: 'column', table: 'agencies', column: 'onboarding_completed', sql: `ALTER TABLE agencies ADD COLUMN onboarding_completed INTEGER DEFAULT 0` },
    { type: 'column', table: 'agencies', column: 'onboarding_step', sql: `ALTER TABLE agencies ADD COLUMN onboarding_step INTEGER DEFAULT 0` },
    { type: 'column', table: 'agencies', column: 'meta_page_id', sql: `ALTER TABLE agencies ADD COLUMN meta_page_id TEXT` },
    { type: 'column', table: 'agencies', column: 'plan', sql: `ALTER TABLE agencies ADD COLUMN plan TEXT DEFAULT 'starter'` },
    { type: 'column', table: 'agencies', column: 'plan_status', sql: `ALTER TABLE agencies ADD COLUMN plan_status TEXT DEFAULT 'trialing'` },
    { type: 'column', table: 'agencies', column: 'wa_verify_token', sql: `ALTER TABLE agencies ADD COLUMN wa_verify_token TEXT` },
    { type: 'column', table: 'agencies', column: 'wa_webhook_token', sql: `ALTER TABLE agencies ADD COLUMN wa_webhook_token TEXT` },
    { type: 'column', table: 'agencies', column: 'email_provider', sql: `ALTER TABLE agencies ADD COLUMN email_provider TEXT DEFAULT 'sendgrid'` },
    { type: 'column', table: 'agencies', column: 'slugs', sql: `ALTER TABLE agencies ADD COLUMN slugs TEXT` },
    { type: 'column', table: 'agencies', column: 'primary_color', sql: `ALTER TABLE agencies ADD COLUMN primary_color TEXT DEFAULT '#6366f1'` },
    { type: 'column', table: 'agencies', column: 'secondary_color', sql: `ALTER TABLE agencies ADD COLUMN secondary_color TEXT DEFAULT '#8b5cf6'` },
    { type: 'column', table: 'agencies', column: 'logo_url', sql: `ALTER TABLE agencies ADD COLUMN logo_url TEXT` },
    { type: 'column', table: 'agencies', column: 'custom_domain', sql: `ALTER TABLE agencies ADD COLUMN custom_domain TEXT` },
    { type: 'column', table: 'agencies', column: 'province', sql: `ALTER TABLE agencies ADD COLUMN province TEXT` },
    { type: 'column', table: 'agencies', column: 'country', sql: `ALTER TABLE agencies ADD COLUMN country TEXT DEFAULT 'ES'` },
    { type: 'column', table: 'agencies', column: 'timezone', sql: `ALTER TABLE agencies ADD COLUMN timezone TEXT DEFAULT 'Europe/Madrid'` },
    { type: 'column', table: 'agencies', column: 'language', sql: `ALTER TABLE agencies ADD COLUMN language TEXT DEFAULT 'es'` },
    { type: 'column', table: 'agencies', column: 'bot_name', sql: `ALTER TABLE agencies ADD COLUMN bot_name TEXT DEFAULT 'Asistente IA'` },
    { type: 'column', table: 'agencies', column: 'bot_tone', sql: `ALTER TABLE agencies ADD COLUMN bot_tone TEXT DEFAULT 'profesional'` },
    { type: 'column', table: 'agencies', column: 'working_hours', sql: `ALTER TABLE agencies ADD COLUMN working_hours TEXT DEFAULT '{"start":"09:00","end":"20:00","days":[1,2,3,4,5]}'` },
    { type: 'column', table: 'agencies', column: 'webhook_custom', sql: `ALTER TABLE agencies ADD COLUMN webhook_custom TEXT` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS automation_templates (
      id TEXT PRIMARY KEY,
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
      is_active INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )` },
    { type: 'column', table: 'users', column: 'whatsapp_number', sql: `ALTER TABLE users ADD COLUMN whatsapp_number TEXT` },
    { type: 'column', table: 'users', column: 'telegram_chat_id', sql: `ALTER TABLE users ADD COLUMN telegram_chat_id TEXT` },
    { type: 'column', table: 'users', column: 'slack_user_id', sql: `ALTER TABLE users ADD COLUMN slack_user_id TEXT` },
    { type: 'column', table: 'users', column: 'notification_email', sql: `ALTER TABLE users ADD COLUMN notification_email TEXT` },
    { type: 'column', table: 'users', column: 'signature', sql: `ALTER TABLE users ADD COLUMN signature TEXT` },
    { type: 'column', table: 'conversations', column: 'agency_id', sql: `ALTER TABLE conversations ADD COLUMN agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_conversations_agency ON conversations(agency_id)` },
    { type: 'column', table: 'users', column: 'timezone', sql: `ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Europe/Madrid'` },
    { type: 'column', table: 'users', column: 'working_hours', sql: `ALTER TABLE users ADD COLUMN working_hours TEXT DEFAULT '{"start":"09:00","end":"20:00","days":[1,2,3,4,5]}'` },
    { type: 'column', table: 'users', column: 'preferences', sql: `ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'` },
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
    { type: 'column', table: 'usage_counters', column: 'created_at', sql: `ALTER TABLE usage_counters ADD COLUMN created_at TEXT DEFAULT (datetime('now'))` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS usage_monthly (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      counter TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agency_id, period, counter)
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_usage_monthly ON usage_monthly(agency_id, period, counter)` },
    { type: 'column', table: 'automations', column: 'template_id', sql: `ALTER TABLE automations ADD COLUMN template_id TEXT REFERENCES automation_templates(id) ON DELETE SET NULL` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_automations_template ON automations(agency_id, template_id)` },
    { type: 'column', table: 'agencies', column: 'online_meeting_url', sql: `ALTER TABLE agencies ADD COLUMN online_meeting_url TEXT` },
    { type: 'column', table: 'agencies', column: 'appointment_attendant_name', sql: `ALTER TABLE agencies ADD COLUMN appointment_attendant_name TEXT` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS appointment_messages (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      channel TEXT CHECK(channel IN ('email','whatsapp')) NOT NULL,
      type TEXT CHECK(type IN ('confirmation','reminder','update','cancel')) NOT NULL,
      status TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      error TEXT
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_appointments_client_token ON appointments(client_token)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_appointments_lead ON appointments(lead_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_appointments_agency ON appointments(agency_id)` },
    // ── Properties new columns ──
    { type: 'column', table: 'properties', column: 'operation_type', sql: `ALTER TABLE properties ADD COLUMN operation_type TEXT DEFAULT 'sale'` },
    { type: 'column', table: 'properties', column: 'address', sql: `ALTER TABLE properties ADD COLUMN address TEXT` },
    { type: 'column', table: 'properties', column: 'province', sql: `ALTER TABLE properties ADD COLUMN province TEXT` },
    { type: 'column', table: 'properties', column: 'postal_code', sql: `ALTER TABLE properties ADD COLUMN postal_code TEXT` },
    { type: 'column', table: 'properties', column: 'floor', sql: `ALTER TABLE properties ADD COLUMN floor TEXT` },
    { type: 'column', table: 'properties', column: 'has_elevator', sql: `ALTER TABLE properties ADD COLUMN has_elevator INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'has_terrace', sql: `ALTER TABLE properties ADD COLUMN has_terrace INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'has_garage', sql: `ALTER TABLE properties ADD COLUMN has_garage INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'condition', sql: `ALTER TABLE properties ADD COLUMN condition TEXT` },
    { type: 'column', table: 'properties', column: 'source', sql: `ALTER TABLE properties ADD COLUMN source TEXT DEFAULT 'manual'` },
    { type: 'column', table: 'properties', column: 'external_source', sql: `ALTER TABLE properties ADD COLUMN external_source TEXT` },
    { type: 'column', table: 'properties', column: 'external_id', sql: `ALTER TABLE properties ADD COLUMN external_id TEXT` },
    { type: 'column', table: 'properties', column: 'external_url', sql: `ALTER TABLE properties ADD COLUMN external_url TEXT` },
    { type: 'column', table: 'properties', column: 'imported_at', sql: `ALTER TABLE properties ADD COLUMN imported_at TEXT` },
    { type: 'column', table: 'properties', column: 'updated_at', sql: `ALTER TABLE properties ADD COLUMN updated_at TEXT` },
    { type: 'column', table: 'properties', column: 'public_url', sql: `ALTER TABLE properties ADD COLUMN public_url TEXT` },
    // ── Agencias columns for Idealista ──
    { type: 'column', table: 'agencies', column: 'idealista_api_key', sql: `ALTER TABLE agencies ADD COLUMN idealista_api_key TEXT` },
    { type: 'column', table: 'agencies', column: 'idealista_api_secret', sql: `ALTER TABLE agencies ADD COLUMN idealista_api_secret TEXT` },
    { type: 'column', table: 'agencies', column: 'idealista_import_mode', sql: `ALTER TABLE agencies ADD COLUMN idealista_import_mode TEXT DEFAULT 'url'` },
    { type: 'column', table: 'agencies', column: 'idealista_office_id', sql: `ALTER TABLE agencies ADD COLUMN idealista_office_id TEXT` },
    // ── New indexes for properties ──
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_properties_source ON properties(source)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_properties_operation ON properties(operation_type)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_properties_external ON properties(external_source, external_id)` },
    { type: 'column', table: 'properties', column: 'assigned_to', sql: `ALTER TABLE properties ADD COLUMN assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL` },
    { type: 'column', table: 'properties', column: 'quality_score', sql: `ALTER TABLE properties ADD COLUMN quality_score INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'ai_generated', sql: `ALTER TABLE properties ADD COLUMN ai_generated INTEGER DEFAULT 0` },
    { type: 'column', table: 'properties', column: 'marketing_assets', sql: `ALTER TABLE properties ADD COLUMN marketing_assets TEXT` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS property_leads (
      id TEXT PRIMARY KEY,
      agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
      property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
      relation_type TEXT,
      match_score REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_leads_agency ON property_leads(agency_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_leads_property ON property_leads(property_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_leads_lead ON property_leads(lead_id)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS property_marketing_assets (
      id TEXT PRIMARY KEY,
      agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
      property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
      type TEXT,
      title TEXT,
      content TEXT,
      channel TEXT,
      created_by_ai INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_marketing_assets_agency ON property_marketing_assets(agency_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_marketing_assets_prop ON property_marketing_assets(property_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_properties_assigned ON properties(assigned_to)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS property_interests (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'interested',
      channel TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      UNIQUE(property_id, lead_id)
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_interests_property ON property_interests(property_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_property_interests_lead ON property_interests(lead_id)` },
    // ── Lead Automation new tables ──
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS communication_logs (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
      channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp','sms','call')),
      direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
      subject TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_message_id TEXT,
      error TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_comm_logs_lead ON communication_logs(lead_id)` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_comm_logs_agency ON communication_logs(agency_id)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS lead_automations (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      channel TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT,
      result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )` },
    { type: 'sql', sql: `CREATE INDEX IF NOT EXISTS idx_lead_automations_lead ON lead_automations(lead_id)` },
    { type: 'sql', sql: `CREATE TABLE IF NOT EXISTS lead_preferences (
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      preferred_channel TEXT DEFAULT 'whatsapp',
      preferred_time TEXT,
      consent_email INTEGER DEFAULT 0,
      consent_whatsapp INTEGER DEFAULT 0,
      consent_calls INTEGER DEFAULT 0,
      notes TEXT,
      PRIMARY KEY (lead_id)
    )` },
    { type: 'column', table: 'appointments', column: 'reminder_2h_sent_at', sql: `ALTER TABLE appointments ADD COLUMN reminder_2h_sent_at TEXT` },
    { type: 'column', table: 'appointments', column: 'property_id', sql: `ALTER TABLE appointments ADD COLUMN property_id TEXT REFERENCES properties(id) ON DELETE SET NULL` },
    { type: 'column', table: 'agencies', column: 'email_signature', sql: `ALTER TABLE agencies ADD COLUMN email_signature TEXT` },
    { type: 'column', table: 'agencies', column: 'auto_send_email', sql: `ALTER TABLE agencies ADD COLUMN auto_send_email INTEGER DEFAULT 0` },
    { type: 'column', table: 'agencies', column: 'auto_send_whatsapp', sql: `ALTER TABLE agencies ADD COLUMN auto_send_whatsapp INTEGER DEFAULT 0` },
    { type: 'column', table: 'agencies', column: 'require_email_confirmation', sql: `ALTER TABLE agencies ADD COLUMN require_email_confirmation INTEGER DEFAULT 1` },
    { type: 'column', table: 'agencies', column: 'require_whatsapp_confirmation', sql: `ALTER TABLE agencies ADD COLUMN require_whatsapp_confirmation INTEGER DEFAULT 1` },
    { type: 'column', table: 'agencies', column: 'default_channel', sql: `ALTER TABLE agencies ADD COLUMN default_channel TEXT DEFAULT 'email'` },
    { type: 'column', table: 'agencies', column: 'reminder_2h_enabled', sql: `ALTER TABLE agencies ADD COLUMN reminder_2h_enabled INTEGER DEFAULT 1` },
    { type: 'column', table: 'leads', column: 'last_channel', sql: `ALTER TABLE leads ADD COLUMN last_channel TEXT` },
  ];

  for (const migration of migrations) {
    if (migration.type === 'column') {
      if (!columnExists(migration.table, migration.column)) {
        try {
          run(migration.sql);
        } catch (e) {
          console.log(`[Migration] Error adding column ${migration.column} to ${migration.table}:`, e.message);
        }
      }
    } else {
      try {
        run(migration.sql);
      } catch (e) {
        // Ignorar si la tabla, índice o vista ya existe o no se puede recrear temporalmente
      }
    }
  }

  // ── Seed plantillas globales del marketplace ──
  try {
    const { seedAutomationTemplates } = await import('./services/seed-templates.js');
    seedAutomationTemplates();
  } catch (e) {
    console.log('[Migration] Seed templates error:', e.message);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// seedDemoData eliminada — las agencias nuevas empiezan con datos vacíos

function seedAutomationsForExistingAgencies() {
  const agencies = all('SELECT id FROM agencies');
  for (const agency of agencies) {
    try {
      const count = get('SELECT COUNT(*) as count FROM automations WHERE agency_id = @aid', { aid: agency.id });
      if (!count || count.count === 0) {
        console.log(`Seeding automations for agency ${agency.id}...`);
        seedAutomationsIntoDb(agency.id);
      }
    } catch (e) {
      console.log('Error checking automations for agency:', e.message);
    }
  }
}

function seedAutomationsIntoDb(agencyId) {
  const seedAutomations = [
    // ══════════════════════════════════════════════════════════
    // AUTOMATIZACIONES DE CAPTACIÓN
    // ══════════════════════════════════════════════════════════
    {
      name: 'Bienvenida inmediata ⚡',
      description: 'Responde a nuevos leads en menos de 2 minutos con mensaje personalizado',
      trigger_type: 'lead_created',
      trigger_config: '{}',
      conditions: '[]',
      actions: JSON.stringify([{
        type: 'activate_agent',
        config: {
          agent_type: 'captador',
          prompt_template: 'Acaba de llegar un nuevo lead llamado {{lead_name}} desde {{source}}. Genera un mensaje de bienvenida cálido, profesional y personalizado. Salúdalo por su nombre, preséntate como el asistente de {{agency_name}}, y con UNA sola pregunta abierta empieza a cualificarle (no preguntes todo a la vez). Máximo 3 frases en total.',
        },
      }]),
    },
    {
      name: 'Respuesta automática fuera de horario 🌙',
      description: 'Cuando llega un mensaje fuera del horario de oficina, avisa al lead que le contactarán mañana',
      trigger_type: 'message_received',
      trigger_config: JSON.stringify({ outside_hours: true }),
      conditions: '[]',
      actions: JSON.stringify([
        {
          type: 'activate_agent',
          config: {
            agent_type: 'notificador',
            prompt_template: 'Un lead llamado {{lead_name}} acaba de escribir fuera del horario de oficina. Genera un mensaje automático amable que: 1) Confirme que hemos recibido su mensaje 2) Diga que le contactaremos mañana en horario de oficina (9:00-20:00) 3) Si es urgente, puede llamar al número de la agencia. Sin hacer promesas que no podamos cumplir.',
          },
        },
        {
          type: 'notify_team',
          config: {
            message: '⏰ Mensaje fuera de horario de {{lead_name}} (score {{score}}). Revisar mañana a primera hora.',
            for_role: 'manager',
            level: 'info',
          },
        },
      ]),
    },
    {
      name: 'Cualificación profunda leads fríos ❄️',
      description: 'Leads con score bajo reciben preguntas adicionales de cualificación',
      trigger_type: 'lead_created',
      trigger_config: '{}',
      conditions: JSON.stringify([{ field: 'score', operator: 'lt', value: 40 }]),
      actions: JSON.stringify([{
        type: 'activate_agent',
        config: {
          agent_type: 'captador',
          prompt_template: 'El lead {{lead_name}} tiene un score bajo ({{score}}). Genera una segunda pregunta de cualificación para entender mejor sus necesidades reales y si tiene urgencia. Sé amable pero directo. El objetivo es determinar si es un lead real o solo está mirando.',
        },
      }]),
    },
    // ══════════════════════════════════════════════════════════
    // AUTOMATIZACIONES DE SEGUIMIENTO
    // ══════════════════════════════════════════════════════════
    {
      name: 'Follow-up 24h sin respuesta ⏰',
      description: 'Recontacta leads activos que no han respondido en 24 horas',
      trigger_type: 'no_response_hours',
      trigger_config: JSON.stringify({ hours: 24 }),
      conditions: JSON.stringify([
        { field: 'stage', operator: 'contains', value: 'contactado' },
        { field: 'score', operator: 'gte', value: 30 },
      ]),
      actions: JSON.stringify([{
        type: 'activate_agent',
        config: {
          agent_type: 'vendedor',
          prompt_template: '{{lead_name}} no ha respondido en 24 horas. Está en etapa {{stage}} con score {{score}}/100. Genera un mensaje de seguimiento breve, amable y sin presión. Máximo 2 frases. Pregunta si sigue interesado o si tiene dudas que podamos resolver.',
        },
      }]),
    },
    {
      name: 'Alerta urgente lead caliente sin respuesta 🔥',
      description: 'Lead caliente sin respuesta 48h — escala inmediatamente al manager',
      trigger_type: 'no_response_hours',
      trigger_config: JSON.stringify({ hours: 48 }),
      conditions: JSON.stringify([{ field: 'score', operator: 'gte', value: 70 }]),
      actions: JSON.stringify([
        {
          type: 'notify_team',
          config: {
            message: '🚨 URGENTE: {{lead_name}} (score {{score}}) lleva 48h sin responder y estaba en etapa {{stage}}. Requiere intervención manual.',
            for_role: 'manager',
            level: 'urgente',
          },
        },
        {
          type: 'activate_agent',
          config: {
            agent_type: 'vendedor',
            prompt_template: 'Lead muy caliente ({{score}}/100) llamado {{lead_name}} lleva 48h sin responder. Está en etapa {{stage}}. Genera un mensaje de reactivación con algo de valor (propiedad nueva, dato de mercado) sin parecer desesperado. Máximo 3 frases.',
          },
        },
      ]),
    },
    {
      name: 'Reactivación semanal leads templados 🟡',
      description: 'Cada semana, genera mensajes personalizados para leads templados sin actividad',
      trigger_type: 'no_response_hours',
      trigger_config: JSON.stringify({ hours: 168 }),
      conditions: JSON.stringify([
        { field: 'score', operator: 'gte', value: 40 },
        { field: 'score', operator: 'lt', value: 70 },
      ]),
      actions: JSON.stringify([{
        type: 'activate_agent',
        config: {
          agent_type: 'nurturing',
          prompt_template: '{{lead_name}} es un lead templado (score {{score}}) que lleva una semana sin actividad. Buscaba {{zone}} con presupuesto {{budget}}€. Genera un mensaje de check-in natural que: mencione una propiedad nueva o dato de mercado relevante para su búsqueda, y termine con una pregunta abierta. No suenes como un bot.',
        },
      }]),
    },
    // ══════════════════════════════════════════════════════════
    // AUTOMATIZACIONES DE VISITAS
    // ══════════════════════════════════════════════════════════
    {
      name: 'Confirmación de visita 24h antes 📅',
      description: 'Recuerda y confirma la visita al lead 24 horas antes',
      trigger_type: 'time_schedule',
      trigger_config: JSON.stringify({ hours_before_visit: 24 }),
      conditions: '[]',
      actions: JSON.stringify([{
        type: 'activate_agent',
        config: {
          agent_type: 'agendador',
          prompt_template: 'Genera un recordatorio de visita para {{lead_name}} que tiene visita mañana. Incluye: hora, dirección, quién le atiende, y pide confirmación. Tono amable. Acaba con una pregunta de confirmación.',
        },
      }]),
    },
    {
      name: 'Recordatorio 2h antes de la visita ⏱️',
      description: 'Mensaje final con dirección y datos prácticos 2 horas antes',
      trigger_type: 'time_schedule',
      trigger_config: JSON.stringify({ hours_before_visit: 2 }),
      conditions: '[]',
      actions: JSON.stringify([{
        type: 'activate_agent',
        config: {
          agent_type: 'agendador',
          prompt_template: 'Genera el mensaje de recordatorio final 2 horas antes de la visita de {{lead_name}}. Incluye: hora exacta, dirección completa, nombre del comercial que le atenderá, y anima a que pregunte cualquier duda. Breve y útil.',
        },
      }]),
    },
    {
      name: 'Seguimiento post-visita 🏠',
      description: '3 horas después de una visita, recoge feedback y mantiene el interés activo',
      trigger_type: 'visit_completed',
      trigger_config: '{}',
      conditions: '[]',
      actions: JSON.stringify([
        {
          type: 'activate_agent',
          config: {
            agent_type: 'vendedor',
            prompt_template: '{{lead_name}} acaba de terminar la visita hace 3 horas. Genera un mensaje de seguimiento que: 1) Agradezca su tiempo 2) Pregunte qué le pareció la propiedad 3) Ofrezca resolver cualquier duda 4) Proponga sutilmente el siguiente paso (segunda visita, otra propiedad, o avanzar con la oferta). Tono cálido y sin presión.',
          },
        },
        {
          type: 'create_task',
          config: {
            title: 'Llamar a {{lead_name}} si no responde al seguimiento post-visita',
            assign_to: 'comercial',
            due_hours: 24,
          },
        },
      ]),
    },
    {
      name: 'Reactivación tras no-show 😬',
      description: 'Lead que no apareció a la visita — intento de rescate y reagendamiento',
      trigger_type: 'visit_no_show',
      trigger_config: '{}',
      conditions: '[]',
      actions: JSON.stringify([
        {
          type: 'activate_agent',
          config: {
            agent_type: 'agendador',
            prompt_template: '{{lead_name}} no apareció a la visita de hoy sin avisar. Genera un mensaje comprensivo (puede haber pasado cualquier cosa) que: 1) No le haga sentir mal 2) Proponga reagendar para esta semana 3) Mencione que también tenemos otra propiedad similar que podría interesarle. Sin enfado ni reproche.',
          },
        },
        {
          type: 'update_score',
          config: { score_change: -10 },
        },
        {
          type: 'notify_team',
          config: {
            message: '{{lead_name}} no se presentó a la visita. Se ha enviado mensaje de reagendamiento.',
            for_role: 'comercial',
            level: 'importante',
          },
        },
      ]),
    },
    // ══════════════════════════════════════════════════════════
    // AUTOMATIZACIONES DE PIPELINE
    // ══════════════════════════════════════════════════════════
    {
      name: 'Lead caliente sin asignar — asignación urgente 🚀',
      description: 'Cuando un lead supera score 80 sin comercial asignado, alerta inmediata',
      trigger_type: 'score_threshold',
      trigger_config: JSON.stringify({ threshold: 80, direction: 'above' }),
      conditions: JSON.stringify([{ field: 'assigned_to', operator: 'is_null', value: null }]),
      actions: JSON.stringify([
        {
          type: 'notify_team',
          config: {
            message: '🔥 LEAD CALIENTE sin asignar: {{lead_name}} ({{score}}/100) en {{zone}} con presupuesto {{budget}}€. Asignar AHORA.',
            for_role: 'manager',
            level: 'urgente',
          },
        },
        {
          type: 'activate_agent',
          config: {
            agent_type: 'coordinador',
            prompt_template: 'Lead caliente detectado: {{lead_name}}, score {{score}}, zona {{zone}}, presupuesto {{budget}}€, etapa {{stage}}. Analiza la situación y genera recomendaciones de: qué tipo de comercial asignar, qué agente IA activar ahora mismo, y qué hacer en las próximas 2 horas para no perder este lead.',
          },
        },
      ]),
    },
    {
      name: 'Entrada a negociación — documentación 📋',
      description: 'Al llegar a negociación, solicita automáticamente los documentos necesarios',
      trigger_type: 'stage_changed',
      trigger_config: JSON.stringify({ to_stage: 'negociacion' }),
      conditions: '[]',
      actions: JSON.stringify([
        {
          type: 'activate_agent',
          config: {
            agent_type: 'documentador',
            prompt_template: '{{lead_name}} acaba de pasar a etapa de negociación. Genera un mensaje amable que solicite los documentos básicos para compradores. Explica brevemente POR QUÉ se necesita cada documento. Tono positivo: estamos avanzando hacia la operación.',
          },
        },
        {
          type: 'activate_agent',
          config: {
            agent_type: 'financiero',
            prompt_template: '{{lead_name}} está en negociación con presupuesto de {{budget}}€ en {{zone}}. Genera un resumen de los gastos totales estimados de la operación (entrada + ITP + notaría + registro + gestoría + tasación) para que sepa exactamente qué necesita tener preparado.',
          },
        },
        {
          type: 'notify_team',
          config: {
            message: '💼 {{lead_name}} ha entrado en NEGOCIACIÓN. Score: {{score}}. Revisión del caso recomendada.',
            for_role: 'manager',
            level: 'importante',
          },
        },
      ]),
    },
    {
      name: 'Reactivación mensual leads fríos ❄️→🌡️',
      description: 'Cada mes reactiva leads con score bajo con contenido de valor',
      trigger_type: 'time_schedule',
      trigger_config: JSON.stringify({ cron: '0 10 1 * *' }),
      conditions: JSON.stringify([{ field: 'score', operator: 'lt', value: 40 }]),
      actions: JSON.stringify([{
        type: 'activate_agent',
        config: {
          agent_type: 'nurturing',
          prompt_template: 'Lead frío: {{lead_name}}, score {{score}}, buscaba en {{zone}} con presupuesto {{budget}}€. Genera un mensaje mensual de valor que: mencione algo nuevo del mercado en {{zone}}, no suene a campaña de marketing masiva, y sea personal y breve (máximo 3 frases). El objetivo es que recuerden que existimos cuando estén listos.',
        },
      }]),
    },
    // ══════════════════════════════════════════════════════════
    // AUTOMATIZACIONES DE INTELIGENCIA
    // ══════════════════════════════════════════════════════════
    {
      name: 'Briefing matutino al equipo ☀️',
      description: 'Cada mañana laborable a las 8:00, envía briefing personalizado a cada comercial',
      trigger_type: 'time_schedule',
      trigger_config: JSON.stringify({ cron: '0 8 * * 1-5' }),
      conditions: '[]',
      actions: JSON.stringify([
        {
          type: 'activate_agent',
          config: {
            agent_type: 'notificador',
            prompt_template: 'Genera el briefing matutino para el equipo de ventas de {{agency_name}}. Sin datos específicos disponibles, genera un briefing motivador con: recordatorio de las mejores prácticas del día, consejo de ventas inmobiliario del día, y un recordatorio de revisar los leads sin respuesta de ayer.',
          },
        },
        {
          type: 'notify_team',
          config: {
            message: '☀️ Briefing matutino disponible. Revisa tus leads prioritarios del día.',
            for_role: 'comercial',
            level: 'info',
          },
        },
      ]),
    },
    {
      name: 'Informe semanal al manager 📊',
      description: 'Cada lunes a las 8:30, genera análisis del equipo de la semana anterior',
      trigger_type: 'time_schedule',
      trigger_config: JSON.stringify({ cron: '30 8 * * 1' }),
      conditions: '[]',
      actions: JSON.stringify([
        {
          type: 'activate_agent',
          config: {
            agent_type: 'analista',
            prompt_template: 'Genera el informe semanal para el manager de {{agency_name}}. Incluye: análisis de rendimiento del equipo (sin datos específicos, usa benchmarks del sector), las 3 métricas más importantes a monitorear esta semana, y 3 recomendaciones de acción concretas para mejorar la conversión.',
          },
        },
        {
          type: 'notify_team',
          config: {
            message: '📊 Informe semanal generado. Disponible en el panel de Analytics.',
            for_role: 'manager',
            level: 'info',
          },
        },
      ]),
    },
    {
      name: 'Alerta: score de lead caliente bajando ⚠️',
      description: 'Si un lead caliente baja más de 15 puntos, avisar al comercial asignado',
      trigger_type: 'score_dropped',
      trigger_config: JSON.stringify({ points: 15 }),
      conditions: JSON.stringify([{ field: 'score', operator: 'gte', value: 60 }]),
      actions: JSON.stringify([
        {
          type: 'notify_team',
          config: {
            message: '⚠️ {{lead_name}} ha bajado de score significativamente. Puede estar perdiendo interés. Revisar conversación.',
            for_role: 'comercial',
            level: 'importante',
          },
        },
        {
          type: 'activate_agent',
          config: {
            agent_type: 'coordinador',
            prompt_template: 'El lead {{lead_name}} ha bajado de score significativamente y estaba en etapa {{stage}}. Analiza qué puede haber pasado y genera 2-3 recomendaciones concretas para recuperar el interés de este lead.',
          },
        },
      ]),
    },
    // ══════════════════════════════════════════════════════════
    // AUTOMATIZACIONES DE CONTENIDO
    // ══════════════════════════════════════════════════════════
    {
      name: 'Avisar lead cuando hay propiedad compatible 🏠',
      description: 'Cuando hay una nueva propiedad, avisar a leads con perfil compatible',
      trigger_type: 'property_matched',
      trigger_config: '{}',
      conditions: '[]',
      actions: JSON.stringify([{
        type: 'activate_agent',
        config: {
          agent_type: 'vendedor',
          prompt_template: 'Ha entrado una nueva propiedad que podría interesar a {{lead_name}}. El lead busca en {{zone}} con presupuesto {{budget}}€ y lleva en el sistema con score {{score}}. Genera un mensaje que: presente la propiedad con entusiasmo real (no genérico), explique POR QUÉ encaja específicamente con SU búsqueda, y proponga una visita de forma natural.',
        },
      }]),
    },
    {
      name: 'Valoración automática para leads que quieren vender 🏷️',
      description: 'Lead que dice que quiere vender su propiedad recibe valoración estimada automática',
      trigger_type: 'message_received',
      trigger_config: JSON.stringify({ intent: 'sell' }),
      conditions: '[]',
      actions: JSON.stringify([
        {
          type: 'activate_agent',
          config: {
            agent_type: 'tasador',
            prompt_template: 'Un lead ({{lead_name}}) ha indicado que quiere vender su propiedad en {{zone}}. Genera una respuesta que: 1) Confirme que podemos ayudarle 2) Explique brevemente cómo funciona nuestro proceso de valoración gratuita 3) Solicite los datos básicos de la propiedad (tipo, m², habitaciones, planta, estado) para hacer una primera estimación de valor de mercado.',
          },
        },
        {
          type: 'change_stage',
          config: { new_stage: 'contactado' },
        },
        {
          type: 'create_task',
          config: {
            title: 'Contactar a {{lead_name}} para visita de valoración',
            assign_to: 'manager',
            due_hours: 4,
          },
        },
      ]),
    },
    {
      name: 'Cierre: felicitación y pedir referidos 🎉',
      description: 'Cuando una operación se cierra, felicitar y aprovechar para pedir referidos',
      trigger_type: 'stage_changed',
      trigger_config: JSON.stringify({ to_stage: 'cerrado' }),
      conditions: '[]',
      actions: JSON.stringify([
        {
          type: 'activate_agent',
          config: {
            agent_type: 'vendedor',
            prompt_template: 'La operación con {{lead_name}} se ha cerrado exitosamente. ¡Enhorabuena! Genera un mensaje de felicitación genuino y cálido que: 1) Celebre el momento con ellos 2) Les recuerde que estamos disponibles para cualquier duda post-compra 3) De forma muy natural y sin presión, mencione que si conocen a alguien buscando algo similar, será un placer ayudarles. Tono celebratorio y humano.',
          },
        },
        {
          type: 'notify_team',
          config: {
            message: '🎉 CIERRE EXITOSO: {{lead_name}} ha completado la operación. ¡Enhorabuena al equipo!',
            for_role: 'admin',
            level: 'importante',
          },
        },
        {
          type: 'create_task',
          config: {
            title: 'Solicitar reseña a {{lead_name}} (Google My Business)',
            assign_to: 'manager',
            due_hours: 168,
          },
        },
      ]),
    },
  ];

  for (const sa of seedAutomations) {
    try {
      run(
        `INSERT INTO automations (id, agency_id, name, description, is_active, trigger_type, trigger_event, trigger_config, conditions, actions, run_count, created_at)
         VALUES (@id, @agency_id, @name, @description, 1, @trigger_type, @trigger_type, @trigger_config, @conditions, @actions, @floor, datetime('now'))`,
        {
          id: uuidv4(),
          agency_id: agencyId,
          name: sa.name,
          description: sa.description,
          trigger_type: sa.trigger_type,
          trigger_config: sa.trigger_config,
          conditions: sa.conditions,
          actions: sa.actions,
          floor: Math.floor(Math.random() * 100),
        }
      )
    } catch (e) { console.log('Automation seed error:', e.message) }
  }
  console.log(`✅ ${seedAutomations.length} automatizaciones insertadas.`);
}

async function initializeRAG() {
  try {
    const { indexProperty, reindexAgencyProperties } = await import('./rag/indexer-properties.js');
    const { seedDefaultKnowledgeBase } = await import('./rag/indexer-knowledge.js');

    const agencies = all('SELECT id FROM agencies');
    if (!agencies || agencies.length === 0) return;

    for (const agency of agencies) {
      try {
        const propertyCount = get('SELECT COUNT(*) as count FROM property_embeddings WHERE agency_id = @aid', { aid: agency.id });
        const kbCount = get('SELECT COUNT(*) as count FROM knowledge_base_embeddings WHERE agency_id = @aid', { aid: agency.id });

        if (!propertyCount || propertyCount.count === 0) {
          console.log(`[RAG] Indexando propiedades para agencia ${agency.id}...`);
          const results = await reindexAgencyProperties(agency.id);
          console.log(`[RAG] ${results.length} propiedades indexadas.`);
        }

        if (!kbCount || kbCount.count === 0) {
          console.log(`[RAG] Sembrando knowledge base para agencia ${agency.id}...`);
          const results = await seedDefaultKnowledgeBase(agency.id);
          console.log(`[RAG] ${results.length} entradas de conocimiento indexadas.`);
        }
      } catch (err) {
        console.warn(`[RAG] Error para agencia ${agency.id}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[RAG] Initialization skipped:', err.message);
  }
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando gracefully...');
  server.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
});
