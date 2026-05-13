import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
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

app.use(cors());

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
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

app.post('/webhooks/paypal', express.json({ type: 'application/json' }), async (req, res) => {
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
  const { default: metaWebhook } = await import('./webhooks/meta.js');
  const { default: whatsappWebhook, waClient, MESSAGE_TEMPLATES } = await import('./webhooks/whatsapp.js');

  app.use('/api/leads', leadsRouter);
  app.use('/api/properties', propertiesRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/agency', agencyRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/webhooks/meta', metaWebhook);
  app.use('/webhooks/whatsapp', whatsappWebhook);
  app.use('/api/rag', (await import('./routes/rag.js')).default);
  app.use('/api/tools', (await import('./routes/tools.js')).default);
  app.use('/api/mcp', (await import('./routes/mcp.js')).default);
  app.use('/api/automations', (await import('./routes/automations.js')).default);
  app.use('/api/automations', (await import('./routes/automations-execute-realtime.js')).default);

  // Run DB migrations for automations table
  runMigration();

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

      const agentResponse = generateAgentResponse(agentType, lead, messageBody, history);

      if (phoneNumber && agentResponse) {
        try {
          await waClient.sendText(phoneNumber, agentResponse);
        } catch (e) {
          console.error('[QUEUE] WhatsApp send error:', e.message);
        }
      }

      history.push({ role: 'agent', content: agentResponse, timestamp: new Date().toISOString() });
      run(
        `UPDATE conversations SET messages = @messages WHERE id = @id`,
        { messages: JSON.stringify(history), id: conversationId }
      );

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
        'SELECT * FROM automations WHERE agency_id = @agency_id AND trigger_event = @trigger AND active = 1',
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

  app.get('/api/billing/plans', (req, res) => {
    res.json({ plans: Object.values(PLANS), paymentMethods: Object.values(PAYMENT_METHODS) });
  });

  app.get('/api/billing/subscription', async (req, res) => {
    const agencyId = req.headers['x-auth-agency'] || get('SELECT id FROM agencies LIMIT 1')?.id;
    if (!agencyId) return res.status(400).json({ error: 'No agency found' });
    const sub = await stripe.getSubscription(agencyId);
    res.json(sub);
  });

  app.get('/api/billing/limits', async (req, res) => {
    const agencyId = req.headers['x-auth-agency'] || get('SELECT id FROM agencies LIMIT 1')?.id;
    if (!agencyId) return res.status(400).json({ error: 'No agency found' });
    const limits = await stripe.checkLimits(agencyId);
    res.json(limits);
  });

  app.post('/api/billing/create-checkout', async (req, res) => {
    try {
      const { planId, interval, paymentMethod } = req.body;
      const agencyId = req.headers['x-auth-agency'] || get('SELECT id FROM agencies LIMIT 1')?.id;
      if (!agencyId) return res.status(400).json({ error: 'No agency found' });
      const agency = get('SELECT * FROM agencies WHERE id = @id', { id: agencyId });
      if (!PLANS[planId]) return res.status(400).json({ error: 'Invalid plan' });
      const session = await stripe.createCheckoutSession(agency, planId, interval, paymentMethod);
      res.json(session);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/billing/cancel', (req, res) => {
    const agencyId = req.headers['x-auth-agency'] || get('SELECT id FROM agencies LIMIT 1')?.id;
    if (!agencyId) return res.status(400).json({ error: 'No agency found' });
    stripe.cancelSubscription(agencyId).then(r => res.json(r));
  });

  app.get('/api/billing/invoices', async (req, res) => {
    const agencyId = req.headers['x-auth-agency'] || get('SELECT id FROM agencies LIMIT 1')?.id;
    if (!agencyId) return res.status(400).json({ error: 'No agency found' });
    const invoices = await stripe.getInvoices(agencyId);
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

  app.get('/api/health', (req, res) => {
    const queueStats = defaultQueue.getStats();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      queue: queueStats,
      websocketClients: realtime.getConnectedClients(),
      services: {
        realtime: true,
        queue: true,
        calendar: !!process.env.GOOGLE_CLIENT_ID,
        email: !!(process.env.SENDGRID_API_KEY || process.env.SMTP_HOST),
        twilio: !!(process.env.TWILIO_ACCOUNT_SID),
        stripe: !!process.env.STRIPE_SECRET_KEY,
        paypal: !!(process.env.PAYPAL_CLIENT_ID),
        whatsapp: !!(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID),
      },
    });
  });

  const dataDir = join(__dirname, '..', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  try {
    const count = get('SELECT COUNT(*) as count FROM agencies');
    if (!count || count.count === 0) {
      seedDemoData();
    } else {
      seedAutomationsForExistingAgencies();
    }
  } catch (e) {
    console.log('Seeding demo data...');
    seedDemoData();
  }

  server.listen(PORT, () => {
    console.log(`🏢 CRM Inmobiliario API corriendo en puerto ${PORT}`);
    console.log(`📍 http://localhost:${PORT}/api/health`);
    initializeRAG();
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
  return agentResponses[Math.floor(Math.random() * agentResponses.length)];
}

// DB Migration: Expand tables schema
function runMigration() {
  const migrations = [
    `ALTER TABLE automations ADD COLUMN description TEXT DEFAULT ''`,
    `ALTER TABLE automations ADD COLUMN is_active INTEGER DEFAULT 1`,
    `ALTER TABLE automations ADD COLUMN trigger_type TEXT DEFAULT 'lead_created'`,
    `ALTER TABLE automations ADD COLUMN trigger_config TEXT DEFAULT '{}'`,
    `ALTER TABLE automations ADD COLUMN conditions TEXT DEFAULT '[]'`,
    `ALTER TABLE automations ADD COLUMN actions TEXT DEFAULT '[]'`,
    `ALTER TABLE automations ADD COLUMN run_count INTEGER DEFAULT 0`,
    `ALTER TABLE automations ADD COLUMN last_run_at TEXT`,
    `CREATE TABLE IF NOT EXISTS automation_logs (
      id TEXT PRIMARY KEY,
      automation_id TEXT REFERENCES automations(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'success',
      actions_executed TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // Activities table: add title + agent_type for automation logging
    `ALTER TABLE activities ADD COLUMN title TEXT`,
    `ALTER TABLE activities ADD COLUMN agent_type TEXT`,
    // Leads table: add extra columns used by automation engine
    `ALTER TABLE leads ADD COLUMN last_contact_at TEXT`,
    `ALTER TABLE leads ADD COLUMN ia_score_label TEXT`,
    `ALTER TABLE leads ADD COLUMN ia_next_action TEXT`,
    `ALTER TABLE leads ADD COLUMN ia_insights TEXT`,
    `ALTER TABLE leads ADD COLUMN pipeline_stage TEXT`,
    `ALTER TABLE leads ADD COLUMN pipeline_stage_updated_at TEXT`,
    `ALTER TABLE leads ADD COLUMN operation_type TEXT`,
    `ALTER TABLE leads ADD COLUMN budget_max REAL`,
    `ALTER TABLE leads ADD COLUMN zones TEXT`,
    `ALTER TABLE leads ADD COLUMN urgency TEXT`,
    `ALTER TABLE leads ADD COLUMN property_type TEXT`,
  ]
  for (const sql of migrations) {
    try { run(sql) } catch { /* column may already exist */ }
  }
}

function seedDemoData() {
  console.log('Seeding demo data...');

  const agencyId = uuidv4();
  try {
    run(
      `INSERT INTO agencies (id, name, slug, logo_url, primary_color, domain, created_at)
       VALUES (@id, @name, @slug, @logo_url, @primary_color, @domain, datetime('now'))`,
      { id: agencyId, name: 'InmoTech Realty', slug: 'inmotech-reality', logo_url: '', primary_color: '#2563eb', domain: '' }
    );
  } catch (e) {
    console.log('Agency already exists, skipping seed');
    return;
  }

  const offices = [
    { name: 'Oficina Central Madrid', city: 'Madrid', address: 'Calle de Velázquez 42', phone: '+34 91 123 45 67' },
    { name: 'Oficina Barcelona', city: 'Barcelona', address: 'Av. Diagonal 320', phone: '+34 93 234 56 78' },
    { name: 'Oficina Valencia', city: 'Valencia', address: 'Calle Colón 15', phone: '+34 96 345 67 89' },
  ];

  const officeIds = offices.map(o => {
    const id = uuidv4();
    run(
      `INSERT INTO offices (id, agency_id, name, city, address, phone, created_at)
       VALUES (@id, @agency_id, @name, @city, @address, @phone, datetime('now'))`,
      { id, agency_id: agencyId, name: o.name, city: o.city, address: o.address, phone: o.phone }
    );
    return id;
  });

  const m1 = uuidv4();
  run(`INSERT INTO users (id, email, name, password_hash, role, agency_id, office_id, phone, created_at)
    VALUES (@id, @email, @name, @password_hash, @role, @agency_id, @office_id, @phone, datetime('now'))`,
    { id: m1, email: 'manager@inmotech.es', name: 'Carlos Martínez', password_hash: 'demo', role: 'manager', agency_id: agencyId, office_id: officeIds[0], phone: '+34 611 111 111' });

  const m2 = uuidv4();
  run(`INSERT INTO users (id, email, name, password_hash, role, agency_id, office_id, phone, created_at)
    VALUES (@id, @email, @name, @password_hash, @role, @agency_id, @office_id, @phone, datetime('now'))`,
    { id: m2, email: 'manager2@inmotech.es', name: 'Laura García', password_hash: 'demo', role: 'manager', agency_id: agencyId, office_id: officeIds[1], phone: '+34 622 222 222' });

  const comercialData = [
    { name: 'Ana López', email: 'ana@inmotech.es', office: 0, phone: '+34 633 333 333' },
    { name: 'Pedro Sánchez', email: 'pedro@inmotech.es', office: 0, phone: '+34 644 444 444' },
    { name: 'María Fernández', email: 'maria@inmotech.es', office: 1, phone: '+34 655 555 555' },
    { name: 'Javier Ruiz', email: 'javier@inmotech.es', office: 1, phone: '+34 666 666 666' },
    { name: 'Sara Díaz', email: 'sara@inmotech.es', office: 2, phone: '+34 677 777 777' },
  ];

  const comercialIds = comercialData.map(c => {
    const id = uuidv4();
    run(`INSERT INTO users (id, email, name, password_hash, role, agency_id, office_id, phone, created_at)
      VALUES (@id, @email, @name, @password_hash, @role, @agency_id, @office_id, @phone, datetime('now'))`,
      { id, email: c.email, name: c.name, password_hash: 'demo', role: 'comercial', agency_id: agencyId, office_id: officeIds[c.office], phone: c.phone });
    return id;
  });

  const leadTemplates = [
    { name: 'Alejandro Gómez', phone: '+34 600 111 111', email: 'alejandro.gomez@email.com', budget: 250000, zone: 'Salamanca', property_interest: 'Piso', source: 'idealista', status: 'nuevo', assigned: null, score: 85 },
    { name: 'Beatriz Herrera', phone: '+34 600 222 222', email: 'beatriz.herrera@email.com', budget: 350000, zone: 'Chamberí', property_interest: 'Ático', source: 'web', status: 'contactado', assigned: 0, score: 72 },
    { name: 'Carlos Ruiz', phone: '+34 600 333 333', email: 'carlos.ruiz@email.com', budget: 180000, zone: 'Carabanchel', property_interest: 'Piso', source: 'meta_ads', status: 'interesado', assigned: 1, score: 65 },
    { name: 'Diana Martín', phone: '+34 600 444 444', email: 'diana.martin@email.com', budget: 500000, zone: 'Chamartín', property_interest: 'Chalet', source: 'whatsapp', status: 'visita_agendada', assigned: 2, score: 93 },
    { name: 'Eduardo Torres', phone: '+34 600 555 555', email: 'eduardo.torres@email.com', budget: 220000, zone: 'Usera', property_interest: 'Piso', source: 'idealista', status: 'negociacion', assigned: 0, score: 78 },
    { name: 'Fátima López', phone: '+34 600 666 666', email: 'fatima.lopez@email.com', budget: 420000, zone: 'Eixample', property_interest: 'Piso', source: 'web', status: 'reserva', assigned: 2, score: 95 },
    { name: 'Guillermo Sánchez', phone: '+34 600 777 777', email: 'guillermo.sanchez@email.com', budget: 150000, zone: 'Ciutat Vella', property_interest: 'Estudio', source: 'email', status: 'cerrado', assigned: 3, score: 60 },
    { name: 'Helena Díaz', phone: '+34 600 888 888', email: 'helena.diaz@email.com', budget: 300000, zone: 'Gràcia', property_interest: 'Piso', source: 'meta_ads', status: 'nuevo', assigned: null, score: 45 },
    { name: 'Ignacio Vega', phone: '+34 600 999 999', email: 'ignacio.vega@email.com', budget: 600000, zone: 'Pedralbes', property_interest: 'Casa', source: 'idealista', status: 'interesado', assigned: 3, score: 88 },
    { name: 'Julia Romero', phone: '+34 611 000 000', email: 'julia.romero@email.com', budget: 190000, zone: 'Ruzafa', property_interest: 'Piso', source: 'web', status: 'contactado', assigned: 4, score: 55 },
    { name: 'Kevin Navarro', phone: '+34 611 111 000', email: 'kevin.navarro@email.com', budget: 280000, zone: 'Ensanche', property_interest: 'Piso', source: 'whatsapp', status: 'nuevo', assigned: null, score: 35 },
    { name: 'Laura Castillo', phone: '+34 611 222 000', email: 'laura.castillo@email.com', budget: 450000, zone: 'El Cabanyal', property_interest: 'Chalet', source: 'manual', status: 'visita_agendada', assigned: 4, score: 82 },
    { name: 'Miguel Ángel Torres', phone: '+34 611 333 000', email: 'miguel.torres@email.com', budget: 320000, zone: 'Almagro', property_interest: 'Ático', source: 'idealista', status: 'negociacion', assigned: 1, score: 90 },
    { name: 'Natalia Jiménez', phone: '+34 611 444 000', email: 'natalia.jimenez@email.com', budget: 210000, zone: 'Tetuán', property_interest: 'Piso', source: 'meta_ads', status: 'interesado', assigned: 0, score: 68 },
    { name: 'Óscar Delgado', phone: '+34 611 555 000', email: 'oscar.delgado@email.com', budget: 550000, zone: 'Sarrià', property_interest: 'Casa', source: 'web', status: 'nuevo', assigned: null, score: 25 },
    { name: 'Patricia Flores', phone: '+34 611 666 000', email: 'patricia.flores@email.com', budget: 170000, zone: 'Villaverde', property_interest: 'Piso', source: 'email', status: 'contactado', assigned: 1, score: 42 },
    { name: 'Rafael Mendoza', phone: '+34 611 777 000', email: 'rafael.mendoza@email.com', budget: 380000, zone: 'Retiro', property_interest: 'Piso', source: 'idealista', status: 'reserva', assigned: 2, score: 96 },
    { name: 'Sofía Guerrero', phone: '+34 611 888 000', email: 'sofia.guerrero@email.com', budget: 250000, zone: 'La Latina', property_interest: 'Piso', source: 'whatsapp', status: 'cerrado', assigned: 3, score: 75 },
    { name: 'Tomás Iglesias', phone: '+34 611 999 000', email: 'tomas.iglesias@email.com', budget: 700000, zone: 'La Moraleja', property_interest: 'Chalet', source: 'web', status: 'nuevo', assigned: null, score: 15 },
    { name: 'Valentina Ríos', phone: '+34 622 000 000', email: 'valentina.rios@email.com', budget: 200000, zone: 'Benimaclet', property_interest: 'Piso', source: 'meta_ads', status: 'interesado', assigned: 4, score: 58 },
  ];

  const leadIds = leadTemplates.map(lt => {
    const id = uuidv4();
    const assigned = lt.assigned !== null ? comercialIds[lt.assigned] : null;
    try {
      run(
        `INSERT INTO leads (id, agency_id, office_id, assigned_to, name, phone, email, budget, zone, property_interest, source, status, ia_score, ia_insight, ia_summary, created_at, updated_at)
         VALUES (@id, @agency_id, @office_id, @assigned_to, @name, @phone, @email, @budget, @zone, @property_interest, @source, @status, @ia_score, @ia_insight, @ia_summary, datetime('now'), datetime('now'))`,
        {
          id, agency_id: agencyId, office_id: officeIds[Math.floor(Math.random() * 3)],
          assigned_to: assigned, name: lt.name, phone: lt.phone, email: lt.email,
          budget: lt.budget, zone: lt.zone, property_interest: lt.property_interest,
          source: lt.source, status: lt.status, ia_score: lt.score,
          ia_insight: lt.score > 70 ? 'Alta probabilidad de compra. Responde rápido y hace preguntas concretas.' : lt.score > 40 ? 'Muestra interés pero necesita seguimiento. Compara varias opciones.' : 'Lead frío. Poco engagement. Recomendar campaña de re-engagement.',
          ia_summary: `${lt.name} busca ${lt.property_interest.toLowerCase()} en ${lt.zone} con presupuesto de ${lt.budget.toLocaleString('es-ES')}€. ` + (lt.score > 70 ? 'Cliente calificado con alta intención de compra.' : lt.score > 40 ? 'Cliente en fase de investigación, requiere nutrición.' : 'Cliente con interés inicial, necesita ser calificado.')
        }
      );
    } catch (e) { console.log('Lead insert error (might be duplicate):', e.message); }
    return id;
  });

  const properties = [
    { title: 'Ático de lujo en Salamanca', desc: 'Impresionante ático de 120m2 con terraza de 40m2. Reformado, 3 hab, 2 baños.', price: 495000, type: 'ático', city: 'Madrid', zone: 'Salamanca', beds: 3, baths: 2, surf: 120, office: 0 },
    { title: 'Piso reformado en Chamberí', desc: 'Piso exterior 85m2 reformado. 3 hab, 1 baño, cocina americana, balcón.', price: 295000, type: 'piso', city: 'Madrid', zone: 'Chamberí', beds: 3, baths: 1, surf: 85, office: 0 },
    { title: 'Chalet independiente La Moraleja', desc: 'Chalet 350m2 en parcela 800m2. 5 hab, 4 baños, piscina, jardín.', price: 1250000, type: 'chalet', city: 'Madrid', zone: 'La Moraleja', beds: 5, baths: 4, surf: 350, office: 0 },
    { title: 'Estudio céntrico Ciutat Vella', desc: 'Estudio 35m2 en centro Barcelona. Amueblado, cocina abierta.', price: 145000, type: 'estudio', city: 'Barcelona', zone: 'Ciutat Vella', beds: 1, baths: 1, surf: 35, office: 1 },
    { title: 'Piso con encanto en Gràcia', desc: 'Piso 70m2 en Gràcia. 2 hab, 1 baño, balcón, ascensor.', price: 265000, type: 'piso', city: 'Barcelona', zone: 'Gràcia', beds: 2, baths: 1, surf: 70, office: 1 },
    { title: 'Casa modernista en Eixample', desc: 'Casa 200m2 modernista. 4 hab, 2 baños, patio, techos altos.', price: 580000, type: 'casa', city: 'Barcelona', zone: 'Eixample', beds: 4, baths: 2, surf: 200, office: 1 },
    { title: 'Piso luminoso en Ruzafa', desc: 'Piso 90m2 en Ruzafa. 3 hab, 2 baños, terraza, garaje.', price: 220000, type: 'piso', city: 'Valencia', zone: 'Ruzafa', beds: 3, baths: 2, surf: 90, office: 2 },
    { title: 'Ático dúplex Ensanche', desc: 'Ático dúplex 110m2, terraza 30m2, vistas. 3 hab, 2 baños, piscina.', price: 350000, type: 'ático', city: 'Valencia', zone: 'Ensanche', beds: 3, baths: 2, surf: 110, office: 2 },
    { title: 'Piso en Almagro con ascensor', desc: 'Piso 100m2 en Almagro. 3 hab, 2 baños, parquet, armarios.', price: 390000, type: 'piso', city: 'Madrid', zone: 'Almagro', beds: 3, baths: 2, surf: 100, office: 0 },
    { title: 'Casa rural Sierra Madrid', desc: 'Casa rural 180m2, parcela 2000m2. 4 hab, chimenea, porche.', price: 280000, type: 'casa', city: 'Madrid', zone: 'Sierra Norte', beds: 4, baths: 2, surf: 180, office: 0 },
    { title: 'Piso obra nueva Villaverde', desc: 'Piso 65m2 obra nueva. 2 hab, terraza, trastero. Entrega 2026.', price: 195000, type: 'piso', city: 'Madrid', zone: 'Villaverde', beds: 2, baths: 1, surf: 65, office: 0 },
    { title: 'Piso en Benimaclet terraza', desc: 'Piso 75m2, terraza 15m2. 2 hab, reformado, armarios.', price: 175000, type: 'piso', city: 'Valencia', zone: 'Benimaclet', beds: 2, baths: 1, surf: 75, office: 2 },
    { title: 'Chalet adosado El Cabanyal', desc: 'Chalet 150m2 a 200m playa. 4 hab, 2 baños, patio, terraza.', price: 320000, type: 'chalet', city: 'Valencia', zone: 'El Cabanyal', beds: 4, baths: 2, surf: 150, office: 2 },
    { title: 'Local comercial Gran Vía', desc: 'Local 80m2 en Gran Vía. Escaparate 6m, altura 4m.', price: 450000, type: 'local', city: 'Madrid', zone: 'Centro', beds: 0, baths: 1, surf: 80, office: 0 },
    { title: 'Oficina Pedralbes', desc: 'Oficina 120m2 zona negocios. Recepción, 3 despachos, sala reuniones.', price: 520000, type: 'local', city: 'Barcelona', zone: 'Pedralbes', beds: 0, baths: 2, surf: 120, office: 1 },
  ];

  const propertyIds = properties.map(p => {
    const id = uuidv4();
    run(
      `INSERT INTO properties (id, agency_id, office_id, title, description, price, type, city, zone, bedrooms, bathrooms, surface, features, status, created_at)
       VALUES (@id, @agency_id, @office_id, @title, @description, @price, @type, @city, @zone, @bedrooms, @bathrooms, @surface, @features, @status, datetime('now'))`,
      { id, agency_id: agencyId, office_id: officeIds[p.office], title: p.title, description: p.desc, price: p.price, type: p.type, city: p.city, zone: p.zone, bedrooms: p.beds, bathrooms: p.baths, surface: p.surf, features: '[]', status: Math.random() > 0.3 ? 'disponible' : 'reservado' }
    );
    return id;
  });

  const agentTypes = [
    { type: 'captador', name: 'Carlos Captador' },
    { type: 'vendedor', name: 'Vicky Vendedora' },
    { type: 'coordinador', name: 'Cristina Coordinadora' },
    { type: 'copywriter', name: 'César Copy' },
    { type: 'tasador', name: 'Tomás Tasador' },
    { type: 'analista', name: 'Ada Analista' },
    { type: 'agendador', name: 'Alicia Agendadora' },
    { type: 'nurturing', name: 'Nadia Nurturing' },
    { type: 'documentador', name: 'Damián Documentador' },
    { type: 'seo', name: 'Sergio SEO' },
    { type: 'financiero', name: 'Felipe Financiero' },
    { type: 'notificador', name: 'Nora Notificadora' },
  ];
  const agentIds = agentTypes.map(a => {
    const id = uuidv4();
    run(`INSERT INTO ai_agents (id, agency_id, type, name, status, config, metrics, created_at)
      VALUES (@id, @agency_id, @type, @name, 'active', @config, @metrics, datetime('now'))`,
      { id, agency_id: agencyId, type: a.type, name: a.name, config: '{}', metrics: JSON.stringify({ executions: Math.floor(Math.random() * 500), today: Math.floor(Math.random() * 30) }) });
    return id;
  });

  const matchings = [
    { leadIdx: 0, propIdx: 0, score: 92, reason: 'Presupuesto y zona coinciden exactamente con la propiedad' },
    { leadIdx: 1, propIdx: 1, score: 88, reason: 'Busca piso en Chamberí, presupuesto alineado' },
    { leadIdx: 3, propIdx: 2, score: 85, reason: 'Chalet en zona premium, presupuesto suficiente' },
    { leadIdx: 4, propIdx: 3, score: 75, reason: 'Piso en Usera, presupuesto ajustado pero viable' },
    { leadIdx: 6, propIdx: 4, score: 70, reason: 'Estudio en Ciutat Vella, presupuesto adecuado' },
    { leadIdx: 8, propIdx: 5, score: 90, reason: 'Casa en Pedralbes, cliente premium' },
    { leadIdx: 11, propIdx: 12, score: 82, reason: 'Chalet en El Cabanyal, busca zona de playa' },
    { leadIdx: 12, propIdx: 8, score: 87, reason: 'Ático en Almagro, alto poder adquisitivo' },
  ];
  matchings.forEach(m => {
    if (!leadIds[m.leadIdx] || !propertyIds[m.propIdx]) return;
    run(`INSERT INTO matchings (id, lead_id, property_id, score, reason, created_at)
      VALUES (@id, @lead_id, @property_id, @score, @reason, datetime('now'))`,
      { id: uuidv4(), lead_id: leadIds[m.leadIdx], property_id: propertyIds[m.propIdx], score: m.score, reason: m.reason });
  });

  const sampleTasks = [
    { leadIdx: 0, assignedIdx: 0, title: 'Llamar a Alejandro para presentación', desc: 'Contactar para explicar servicios de la agencia', due: 1 },
    { leadIdx: 1, assignedIdx: 1, title: 'Enviar dossier de propiedades en Chamberí', desc: 'Seleccionar las 5 mejores opciones', due: 2 },
    { leadIdx: 3, assignedIdx: 2, title: 'Preparar visita al chalet de La Moraleja', desc: 'Confirmar disponibilidad con el propietario', due: 1 },
    { leadIdx: 5, assignedIdx: 2, title: 'Revisar documentación para reserva', desc: 'Verificar que toda la documentación está en orden', due: 3 },
    { leadIdx: 8, assignedIdx: 3, title: 'Seguimiento post-visita Pedralbes', desc: 'Llamar para conocer impresiones tras la visita', due: 2 },
    { leadIdx: 12, assignedIdx: 1, title: 'Negociar condiciones del ático en Almagro', desc: 'Reunión con el propietario para ajustar precio', due: 5 },
  ];
  sampleTasks.forEach(t => {
    if (!leadIds[t.leadIdx]) return;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + t.due);
    run(`INSERT INTO tasks (id, lead_id, assigned_to, title, description, due_date, completed, created_at)
      VALUES (@id, @lead_id, @assigned_to, @title, @description, @due_date, 0, datetime('now'))`,
      { id: uuidv4(), lead_id: leadIds[t.leadIdx], assigned_to: comercialIds[t.assignedIdx] || comercialIds[0], title: t.title, description: t.desc, due_date: dueDate.toISOString() });
  });

  const planData = [
    { id: 'starter', name: 'Starter', price_monthly: 7900, price_yearly: 6900, max_users: 5, max_offices: 1, max_agents: 3, max_leads_per_month: 500, max_automations: 10, available_agent_types: JSON.stringify(['captador','vendedor','coordinador']), feature_whatsapp: 1, feature_meta_ads: 0, feature_white_label: 0, feature_api_access: 0, feature_analytics_advanced: 0, feature_priority_support: 0, feature_dedicated_support: 0, description: 'Para agentes y pequeñas agencias.', sort_order: 1 },
    { id: 'profesional', name: 'Profesional', price_monthly: 19900, price_yearly: 16900, max_users: 15, max_offices: 3, max_agents: 8, max_leads_per_month: 2000, max_automations: -1, available_agent_types: JSON.stringify(['captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing']), feature_whatsapp: 1, feature_meta_ads: 1, feature_white_label: 0, feature_api_access: 1, feature_analytics_advanced: 1, feature_priority_support: 1, feature_dedicated_support: 0, description: 'Para agencias en crecimiento.', sort_order: 2 },
    { id: 'agencia', name: 'Agencia', price_monthly: 49900, price_yearly: 41900, max_users: -1, max_offices: -1, max_agents: 12, max_leads_per_month: -1, max_automations: -1, available_agent_types: JSON.stringify(['captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing','documentador','seo','financiero','notificador']), feature_whatsapp: 1, feature_meta_ads: 1, feature_white_label: 1, feature_api_access: 1, feature_analytics_advanced: 1, feature_priority_support: 1, feature_dedicated_support: 1, description: 'Para agencias consolidadas.', sort_order: 3 },
  ];
  planData.forEach(p => {
    run(`INSERT OR REPLACE INTO plans (id, name, description, price_monthly, price_yearly, max_users, max_offices, max_agents, max_leads_per_month, max_automations, available_agent_types, feature_whatsapp, feature_meta_ads, feature_white_label, feature_api_access, feature_analytics_advanced, feature_priority_support, feature_dedicated_support, sort_order)
      VALUES (@id, @name, @description, @price_monthly, @price_yearly, @max_users, @max_offices, @max_agents, @max_leads_per_month, @max_automations, @available_agent_types, @feature_whatsapp, @feature_meta_ads, @feature_white_label, @feature_api_access, @feature_analytics_advanced, @feature_priority_support, @feature_dedicated_support, @sort_order)`,
      { ...p });
  });

  leadIds.slice(0, 10).forEach((lid, i) => {
    if (!lid) return;
    const msgs = [
      { role: 'lead', content: 'Hola, estoy interesado en el piso que vi en su web.', ts: new Date(Date.now() - 86400000 * (5 - i)).toISOString() },
      { role: 'agent', content: '¡Buenos días! Encantado de atenderle. ¿Podría indicarme qué tipo de propiedad busca?', ts: new Date(Date.now() - 86400000 * (4 - i)).toISOString() },
      { role: 'lead', content: 'Busco un piso de unos 200-250 mil euros en zona céntrica.', ts: new Date(Date.now() - 86400000 * (3 - i)).toISOString() },
    ];
    try {
      run(`INSERT INTO conversations (id, lead_id, channel, messages, created_at)
        VALUES (@id, @lead_id, @channel, @messages, datetime('now'))`,
        { id: uuidv4(), lead_id: lid, channel: 'whatsapp', messages: JSON.stringify(msgs) });
    } catch (e) {}
  });

  [0, 2, 4, 6, 8, 10, 12, 14].forEach(i => {
    if (!leadIds[i]) return;
    const types = ['lead_created', 'status_change', 'conversation', 'visita', 'email_sent', 'lead_assigned'];
    const descs = ['Lead registrado en el sistema', 'Estado actualizado', 'Conversación por WhatsApp', 'Visita agendada', 'Email enviado', 'Lead asignado a comercial'];
    const idx = Math.floor(Math.random() * types.length);
    run(`INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, created_at)
      VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, datetime('now'))`,
      { id: uuidv4(), agency_id: agencyId, lead_id: leadIds[i], user_id: comercialIds[i % comercialIds.length], type: types[idx], description: descs[idx] });
  });

  [1, 3, 5, 7, 9].forEach(i => {
    if (!leadIds[i]) return;
    const agentActivities = [
      { type: 'ia_insight', desc: 'Lead analizado por agente IA', agentIdx: 0 },
      { type: 'ia_match', desc: 'Propiedad recomendada por IA', agentIdx: 6 },
      { type: 'ia_nurturing', desc: 'Mensaje de nurturing enviado', agentIdx: 7 },
      { type: 'ia_document', desc: 'Documentación solicitada automáticamente', agentIdx: 8 },
      { type: 'ia_notification', desc: 'Notificación de match enviada', agentIdx: 11 },
    ];
    const a = agentActivities[i % agentActivities.length];
    run(`INSERT INTO activities (id, agency_id, lead_id, agent_id, type, description, created_at)
      VALUES (@id, @agency_id, @lead_id, @agent_id, @type, @description, datetime('now'))`,
      { id: uuidv4(), agency_id: agencyId, lead_id: leadIds[i], agent_id: agentIds[a.agentIdx], type: a.type, description: a.desc });
  });

  [0, 3, 6, 9, 12].forEach(i => {
    if (!leadIds[i]) return;
    run(`INSERT INTO notifications (id, agency_id, user_id, lead_id, title, body, type, created_at)
      VALUES (@id, @agency_id, @user_id, @lead_id, @title, @body, @type, datetime('now'))`,
      { id: uuidv4(), agency_id: agencyId, user_id: comercialIds[i % comercialIds.length], lead_id: leadIds[i], title: 'Nuevo lead asignado', body: `Se te ha asignado un nuevo lead: ${leadTemplates[i].name}`, type: 'lead_assigned' });
  });

  seedAutomationsIntoDb(agencyId);

  console.log('✅ Demo data seeded successfully.');
}

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

    const agency = get('SELECT id FROM agencies LIMIT 1');
    if (!agency) return;

    const propertyCount = get('SELECT COUNT(*) as count FROM property_embeddings WHERE agency_id = @aid', { aid: agency.id });
    const kbCount = get('SELECT COUNT(*) as count FROM knowledge_base_embeddings WHERE agency_id = @aid', { aid: agency.id });

    if (!propertyCount || propertyCount.count === 0) {
      console.log('[RAG] Indexando propiedades existentes...');
      const results = await reindexAgencyProperties(agency.id);
      console.log(`[RAG] ${results.length} propiedades indexadas.`);
    }

    if (!kbCount || kbCount.count === 0) {
      console.log('[RAG] Sembrando knowledge base por defecto...');
      const results = await seedDefaultKnowledgeBase(agency.id);
      console.log(`[RAG] ${results.length} entradas de conocimiento indexadas.`);
    }
  } catch (err) {
    console.warn('[RAG] Initialization skipped:', err.message);
  }
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
