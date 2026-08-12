const PRICES_CENTS = {
  starter_monthly: 7900, starter_yearly: 79000,
  profesional_monthly: 19900, profesional_yearly: 199000,
  agencia_monthly: 49900, agencia_yearly: 499000,
}

export const PLAN_ORDER = { starter: 1, profesional: 2, agencia: 3 }

export function planIncludes(userPlan, requiredPlan) {
  return PLAN_ORDER[userPlan] >= PLAN_ORDER[requiredPlan]
}

export const SECTION_PLAN_REQUIREMENTS = {
  '/dashboard': { minPlan: 'starter', message: '' },
  '/pipeline': { minPlan: 'starter', message: '' },
  '/leads': { minPlan: 'starter', message: '' },
  '/properties': { minPlan: 'starter', message: '' },
  '/conversations': { minPlan: 'starter', message: '' },
  '/agents': { minPlan: 'starter', message: '' },
  '/automations': { minPlan: 'starter', message: '' },
  '/analytics': { minPlan: 'profesional', message: 'Analytics avanzado disponible desde plan Profesional' },
  '/team': { minPlan: 'profesional', message: 'Gestión de equipo disponible desde plan Profesional' },
  '/settings': { minPlan: 'starter', message: '' },
}

export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 79,
    priceYearly: 69,
    priceCentsMonthly: PRICES_CENTS.starter_monthly,
    priceCentsYearly: PRICES_CENTS.starter_yearly,
    leads: 500,
    agents: 3,
    offices: 1,
    users: 5,
    automations: 10,
    availableAgentTypes: ['captador', 'vendedor', 'coordinador'],
    features: {
      whiteLabel: false,
      apiAccess: false,
      advancedAutomation: false,
      fullAnalytics: false,
      whatsappApi: true,
      metaAds: false,
      prioritySupport: false,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
  },
  profesional: {
    id: 'profesional',
    name: 'Profesional',
    price: 199,
    priceYearly: 169,
    priceCentsMonthly: PRICES_CENTS.profesional_monthly,
    priceCentsYearly: PRICES_CENTS.profesional_yearly,
    leads: 2000,
    agents: 8,
    offices: 3,
    users: 15,
    automations: -1,
    availableAgentTypes: ['captador', 'vendedor', 'coordinador', 'copywriter', 'tasador', 'analista', 'agendador', 'nurturing'],
    features: {
      whiteLabel: false,
      apiAccess: true,
      advancedAutomation: true,
      fullAnalytics: true,
      whatsappApi: true,
      metaAds: true,
      prioritySupport: true,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
  },
  agencia: {
    id: 'agencia',
    name: 'Agencia',
    price: 499,
    priceYearly: 419,
    priceCentsMonthly: PRICES_CENTS.agencia_monthly,
    priceCentsYearly: PRICES_CENTS.agencia_yearly,
    leads: -1,
    agents: 12,
    offices: -1,
    users: -1,
    automations: -1,
    availableAgentTypes: ['captador', 'vendedor', 'coordinador', 'copywriter', 'tasador', 'analista', 'agendador', 'nurturing', 'documentador', 'seo', 'financiero', 'notificador'],
    features: {
      whiteLabel: true,
      apiAccess: true,
      advancedAutomation: true,
      fullAnalytics: true,
      whatsappApi: true,
      metaAds: true,
      prioritySupport: true,
      customIntegrations: true,
      dedicatedAccountManager: true,
    },
  },
};

export const PAYMENT_METHODS = {
  stripe: { id: 'stripe', name: 'Tarjeta (Stripe)', icon: 'credit-card' },
  paypal: { id: 'paypal', name: 'PayPal', icon: 'paypal' },
  transfer: { id: 'transfer', name: 'Transferencia Bancaria', icon: 'bank' },
};

import { v4 as uuidv4 } from 'uuid'

export class BillingService {
  constructor(config = {}) {
    this.config = config;
  }

  async _db() {
    return await import('../db/db.js');
  }

  // subscriptions.plan_id es UUID (FK a plans.id); el resto de la app usa
  // slugs ('starter'/'profesional'/'agencia'). Traduce uno a otro.
  async _planUuid(planSlug) {
    const { get: getRow } = await this._db();
    const row = await getRow('SELECT id FROM plans WHERE slug = @slug', { slug: planSlug });
    if (!row) throw new Error(`Plan '${planSlug}' no encontrado en la tabla plans (¿falta aplicar la migración 00007_seed_plans.sql?)`);
    return row.id;
  }

  // agencies.plan / agencies.plan_status son la fuente de verdad real que usa
  // el resto de la app para limites y features (ver server/middleware/auth.js).
  // La tabla subscriptions solo guarda metadatos de facturación; sin esta
  // actualización, un pago completado con éxito no desbloquea nada para el cliente.
  async _activateAgencyPlan(agencyId, planSlug) {
    const { run: runQuery } = await this._db();
    await runQuery(
      `UPDATE agencies SET plan = @plan, plan_status = 'active', updated_at = NOW() WHERE id = @id`,
      { plan: planSlug, id: agencyId }
    );
  }

  async createCustomer(agency) {
    if (!this.config.secretKey) {
      return { mock: true, customerId: `mock_cus_${agency.id?.substring(0, 8) || Date.now()}` };
    }
    try {
      const params = new URLSearchParams({
        name: agency.name,
        email: agency.email || '',
      });
      params.append('metadata[agency_id]', agency.id || '');
      const resp = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });
      const data = await resp.json();
      return data;
    } catch (e) {
      return { mock: true, customerId: `mock_cus_${Date.now()}`, error: e.message };
    }
  }

  async createCheckoutSession(agency, planId, interval, paymentMethod, priceId) {
    interval = interval || 'month';
    paymentMethod = paymentMethod || 'stripe';
    const plan = PLANS[planId];
    if (!plan) throw new Error(`Invalid plan: ${planId}`);

    const amountCents = interval === 'year' ? plan.priceCentsYearly : plan.priceCentsMonthly;
    const amount = amountCents / 100;
    const periodDays = interval === 'year' ? 365 : 30;

    if (!this.config.secretKey || paymentMethod !== 'stripe') {
      const { all, run } = await this._db();
      const subId = uuidv4();
      const now = new Date().toISOString();
      const end = new Date(Date.now() + periodDays * 86400000).toISOString();
      const planUuid = await this._planUuid(planId);

      await run(
        `INSERT INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, payment_method, created_at, updated_at)
         VALUES (@id, @agency_id, @plan_id, @status, @billing_cycle, @period_start, @period_end, @trial_end, @payment_method, @created_at, @updated_at)
         ON CONFLICT (agency_id) DO UPDATE SET
           plan_id = EXCLUDED.plan_id,
           status = EXCLUDED.status,
           billing_cycle = EXCLUDED.billing_cycle,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           trial_end = EXCLUDED.trial_end,
           payment_method = EXCLUDED.payment_method,
           updated_at = EXCLUDED.updated_at`,
        {
          id: subId,
          agency_id: agency.id,
          plan_id: planUuid,
          status: paymentMethod === 'transfer' ? 'pending' : 'active',
          billing_cycle: interval === 'year' ? 'yearly' : 'monthly',
          period_start: now,
          period_end: end,
          trial_end: null,
          payment_method: paymentMethod,
          created_at: now,
          updated_at: now,
        }
      )

      // Transferencia queda 'pending' hasta confirmar el ingreso -> no activar aun.
      if (paymentMethod !== 'transfer') {
        await this._activateAgencyPlan(agency.id, planId);
      }

      return {
        mock: true,
        sessionId: `mock_cs_${Date.now()}`,
        paymentMethod,
        url: `${this.config.appUrl || 'http://localhost:5173'}/pricing?success=true`,
        plan: plan.name,
        amount,
        amountCents,
        interval,
        message: paymentMethod === 'transfer'
          ? 'Solicitud recibida. Te enviaremos los datos de transferencia por email.'
          : undefined,
      };
    }

    let existingCustomerId = null;
    if (this.config.secretKey && paymentMethod === 'stripe') {
      const { get: getRow } = await this._db();
      const existingSub = await getRow(
        'SELECT stripe_customer_id FROM subscriptions WHERE agency_id = @aid AND stripe_customer_id IS NOT NULL',
        { aid: agency.id }
      );
      existingCustomerId = existingSub?.stripe_customer_id || null;
    }

    try {
      const params = new URLSearchParams({
        success_url: `${this.config.appUrl || 'http://localhost:5173'}/pricing?success=true`,
        cancel_url: `${this.config.appUrl || 'http://localhost:5173'}/pricing?canceled=true`,
        mode: 'subscription',
      });
      if (existingCustomerId) {
        params.append('customer', existingCustomerId);
      } else if (agency.email) {
        params.append('customer_email', agency.email);
      }
      params.append('metadata[agency_id]', agency.id || '');
      params.append('metadata[plan_id]', planId || '');
      params.append('metadata[interval]', interval || '');

      // priceId debe ser un Price ID real de Stripe (price_xxx). Si llega un
      // Product ID (prod_xxx) -- error común al copiar desde el dashboard de
      // Stripe -- Stripe rechazaría la sesión con 'No such price'. En ese
      // caso, generamos el precio dinámicamente en vez de fallar.
      const validPriceId = priceId && priceId.startsWith('price_') ? priceId : null;
      if (!validPriceId && priceId) {
        console.warn(`[STRIPE] priceId '${priceId}' no es un Price ID válido (¿es un Product ID 'prod_'? hace falta el 'price_' del dashboard de Stripe > Producto > Precios). Generando precio dinámico como fallback.`);
      }

      if (validPriceId) {
        params.append('line_items[0][price]', validPriceId);
        params.append('line_items[0][quantity]', '1');
      } else {
        params.append('line_items[0][price_data][currency]', 'eur');
        params.append('line_items[0][price_data][product_data][name]', `${plan.name} (${interval === 'year' ? 'Anual' : 'Mensual'})`);
        params.append('line_items[0][price_data][unit_amount]', amountCents.toString());
        params.append('line_items[0][price_data][recurring][interval]', interval === 'year' ? 'year' : 'month');
        params.append('line_items[0][quantity]', '1');
      }

      const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });
      const data = await resp.json();
      return { ...data, paymentMethod };
    } catch (e) {
      return { mock: true, sessionId: `mock_cs_${Date.now()}`, paymentMethod, error: e.message };
    }
  }

  async handleWebhook(event) {
    const { run, all } = await this._db();
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const agencyId = session.metadata?.agency_id;
          const planId = session.metadata?.plan_id;
          const interval = session.metadata?.interval || 'month';
          if (agencyId && planId) {
            const now = new Date().toISOString();
            const end = new Date(Date.now() + (interval === 'year' ? 365 : 30) * 86400000).toISOString();
            const planUuid = await this._planUuid(planId);
            await run(
              `INSERT INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end, updated_at)
               VALUES (@id, @agency_id, @plan_id, 'active', @billing_cycle, @stripe_sub, @stripe_cus, @period_start, @period_end, @updated_at)
               ON CONFLICT (agency_id) DO UPDATE SET
                 plan_id = EXCLUDED.plan_id,
                 status = EXCLUDED.status,
                 billing_cycle = EXCLUDED.billing_cycle,
                 stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                 stripe_customer_id = EXCLUDED.stripe_customer_id,
                 current_period_start = EXCLUDED.current_period_start,
                 current_period_end = EXCLUDED.current_period_end,
                 updated_at = EXCLUDED.updated_at`,
              {
                id: uuidv4(),
                agency_id: agencyId,
                plan_id: planUuid,
          billing_cycle: interval === 'year' ? 'yearly' : 'monthly',
                stripe_sub: session.subscription,
                stripe_cus: session.customer,
                period_start: now,
                period_end: end,
                updated_at: now,
              }
            )
            await this._activateAgencyPlan(agencyId, planId);
            console.log(`[STRIPE] Suscripción activada: ${agencyId} -> ${planId}`);
          }
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object;
          const agencySub = await all('SELECT agency_id FROM subscriptions WHERE stripe_subscription_id = @sub_id', { sub_id: invoice.subscription });
          const agencyId = agencySub?.[0]?.agency_id;
          if (agencyId) {
            await run(
              `INSERT INTO payment_history (id, agency_id, amount, currency, status, payment_method, stripe_invoice_id, stripe_payment_intent_id, invoice_url, invoice_pdf_url, description, period_start, period_end, created_at)
               VALUES (@id, @agency_id, @amount, @currency, 'succeeded', 'card', @inv_id, @pi_id, @inv_url, @pdf_url, @desc, @p_start, @p_end, NOW())`,
              {
                id: uuidv4(),
                agency_id: agencyId,
                amount: invoice.amount_paid,
                currency: invoice.currency?.toUpperCase() || 'EUR',
                inv_id: invoice.id,
                pi_id: invoice.payment_intent,
                inv_url: invoice.hosted_invoice_url,
                pdf_url: invoice.invoice_pdf,
                desc: `Suscripción PropIA`,
                p_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
                p_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
              }
            )
          }
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const meta = sub.metadata || {};
          const agencyId = meta.agency_id;
          if (agencyId) {
            const status = sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : sub.status === 'canceled' ? 'canceled' : sub.status === 'trialing' ? 'trialing' : 'expired';
            await run(
              `UPDATE subscriptions SET status = @status, cancel_at_period_end = @cancel, current_period_end = @period_end, updated_at = NOW() WHERE agency_id = @agency_id`,
              {
                status,
                cancel: sub.cancel_at_period_end ? 1 : 0,
                period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
                agency_id: agencyId,
              }
            )
            if (sub.status === 'canceled' || sub.status === 'expired') {
              await run('UPDATE subscriptions SET canceled_at = NOW() WHERE agency_id = @agency_id', { agency_id: agencyId })
            }
          }
          break;
        }
        case 'invoice.payment_failed': {
          const failed = event.data.object;
          const agencySub = await all('SELECT agency_id FROM subscriptions WHERE stripe_subscription_id = @sub_id', { sub_id: failed.subscription });
          const failAgencyId = agencySub?.[0]?.agency_id;
          if (failAgencyId) {
            await run('UPDATE subscriptions SET status = \'past_due\' WHERE agency_id = @agency_id', { agency_id: failAgencyId })
          }
          break;
        }
      }
      return { received: true };
    } catch (e) {
      console.error('[Stripe webhook error]', e);
      return { received: true, error: e.message };
    }
  }

  async handlePayPalWebhook(event) {
    const { run, all } = await this._db();
    try {
      const resource = event.resource || {};
      const agencyId = resource.custom_id || resource.metadata?.agency_id;

      switch (event.event_type) {
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
        case 'BILLING.SUBSCRIPTION.UPDATED': {
          if (agencyId) {
            const planId = resource.plan_id?.includes('starter') ? 'starter' :
                           resource.plan_id?.includes('profesional') ? 'profesional' : 'agencia';
            const planUuid = await this._planUuid(planId);
            await run(
              `INSERT INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, paypal_subscription_id, paypal_plan_id, updated_at)
               VALUES (@id, @agency_id, @plan_id, 'active', 'monthly', @paypal_sub, @paypal_plan, NOW())
               ON CONFLICT (agency_id) DO UPDATE SET
                 plan_id = EXCLUDED.plan_id,
                 status = EXCLUDED.status,
                 billing_cycle = EXCLUDED.billing_cycle,
                 paypal_subscription_id = EXCLUDED.paypal_subscription_id,
                 paypal_plan_id = EXCLUDED.paypal_plan_id,
                 updated_at = EXCLUDED.updated_at`,
              {
                id: uuidv4(), agency_id: agencyId, plan_id: planUuid,
                paypal_sub: resource.id, paypal_plan: resource.plan_id,
              }
            )
            await this._activateAgencyPlan(agencyId, planId);
          }
          break;
        }
        case 'BILLING.SUBSCRIPTION.CANCELLED': {
          if (agencyId) {
            await run('UPDATE subscriptions SET status = \'canceled\', canceled_at = NOW() WHERE agency_id = @agency_id', { agency_id: agencyId })
          }
          break;
        }
        case 'PAYMENT.SALE.COMPLETED': {
          if (agencyId) {
            await run(
              `INSERT INTO payment_history (id, agency_id, amount, currency, status, payment_method, paypal_transaction_id, created_at)
               VALUES (@id, @agency_id, @amount, 'EUR', 'succeeded', 'paypal', @txn_id, NOW())`,
              {
                id: uuidv4(), agency_id: agencyId,
                amount: resource.amount?.total ? Math.round(parseFloat(resource.amount.total) * 100) : 0,
                txn_id: resource.id,
              }
            )
          }
          break;
        }
      }
      return { received: true }
    } catch (e) {
      console.error('[PayPal webhook error]', e)
      return { received: true, error: e.message }
    }
  }

  async getSubscription(agencyId) {
    const { all } = await this._db();
    const subs = await all('SELECT * FROM subscriptions WHERE agency_id = @agency_id ORDER BY created_at DESC LIMIT 1', { agency_id: agencyId });
    const sub = subs?.[0];
    if (!sub) {
      const plan = PLANS.starter;
      return {
        planId: 'starter',
        planName: plan.name,
        price: plan.price,
        status: 'inactive',
        mock: true,
        features: plan.features,
        limits: { leads: plan.leads, agents: plan.agents, offices: plan.offices, users: plan.users, automations: plan.automations },
      };
    }
    const plan = PLANS[sub.plan_id] || PLANS.starter;
    return {
      id: sub.id,
      planId: sub.plan_id,
      planName: plan.name,
      price: plan.price,
      status: sub.status,
      billingCycle: sub.billing_cycle,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      trialEnd: sub.trial_end,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      paymentMethod: sub.payment_method,
      stripeSubscriptionId: sub.stripe_subscription_id,
      stripeCustomerId: sub.stripe_customer_id,
      paypalSubscriptionId: sub.paypal_subscription_id,
      features: plan.features,
      limits: { leads: plan.leads, agents: plan.agents, offices: plan.offices, users: plan.users, automations: plan.automations, availableAgentTypes: plan.availableAgentTypes },
    };
  }

  async upsertSubscription(data) {
    const { run } = await this._db();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, cancel_at_period_end, payment_method, stripe_customer_id, stripe_subscription_id, paypal_subscription_id, paypal_plan_id, updated_at)
       VALUES (@id, @agency_id, @plan_id, @status, @billing_cycle, @period_start, @period_end, @trial_end, @cancel, @payment_method, @stripe_cus, @stripe_sub, @paypal_sub, @paypal_plan, @updated_at)
       ON CONFLICT (agency_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = EXCLUDED.status,
         billing_cycle = EXCLUDED.billing_cycle,
         current_period_start = EXCLUDED.current_period_start,
         current_period_end = EXCLUDED.current_period_end,
         trial_end = EXCLUDED.trial_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         payment_method = EXCLUDED.payment_method,
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         paypal_subscription_id = EXCLUDED.paypal_subscription_id,
         paypal_plan_id = EXCLUDED.paypal_plan_id,
         updated_at = EXCLUDED.updated_at`,
      {
        id: data.id || uuidv4(),
        agency_id: data.agency_id,
        plan_id: data.plan_id || 'starter',
        status: data.status || 'active',
        billing_cycle: data.billing_cycle || 'monthly',
        period_start: data.current_period_start || now,
        period_end: data.current_period_end,
        trial_end: data.trial_end,
        cancel: data.cancel_at_period_end ? 1 : 0,
        payment_method: data.payment_method || 'stripe',
        stripe_cus: data.stripe_customer_id,
        stripe_sub: data.stripe_subscription_id,
        paypal_sub: data.paypal_subscription_id,
        paypal_plan: data.paypal_plan_id,
        updated_at: now,
      }
    )
  }

  async cancelSubscription(agencyId) {
    const { run, all } = await this._db();
    const subs = await all('SELECT * FROM subscriptions WHERE agency_id = @agency_id ORDER BY created_at DESC LIMIT 1', { agency_id: agencyId });
    const sub = subs?.[0];

    if (sub?.stripe_subscription_id && this.config.secretKey) {
      try {
        await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.config.secretKey}` },
        });
      } catch (e) { /* ignore */ }
    }

    await run('UPDATE subscriptions SET status = \'canceled\', canceled_at = NOW(), updated_at = NOW() WHERE agency_id = @agency_id', { agency_id: agencyId });
    return { success: true, status: 'canceled' };
  }

  async getInvoices(agencyId) {
    const { all } = await this._db();
    const invoices = await all('SELECT * FROM payment_history WHERE agency_id = @agency_id ORDER BY created_at DESC LIMIT 50', { agency_id: agencyId });
    return { invoices: invoices || [] };
  }

  async checkLimits(agencyId) {
    const sub = await this.getSubscription(agencyId);
    const plan = PLANS[sub.planId] || PLANS.starter;

    const { all: all2 } = await this._db();
    const leadsCount = all2('SELECT COUNT(*) as count FROM leads WHERE agency_id = @agency_id', { agency_id: agencyId });
    const agentsCount = all2('SELECT COUNT(*) as count FROM ai_agents WHERE agency_id = @agency_id AND status = \'active\'', { agency_id: agencyId });
    const officesCount = all2('SELECT COUNT(*) as count FROM offices WHERE agency_id = @agency_id', { agency_id: agencyId });
    const usersCount = all2('SELECT COUNT(*) as count FROM users WHERE agency_id = @agency_id AND active = true', { agency_id: agencyId });
    const automationsCount = all2('SELECT COUNT(*) as count FROM automations WHERE agency_id = @agency_id', { agency_id: agencyId });

    const leadsUsed = leadsCount?.[0]?.count || 0;
    const agentsActive = agentsCount?.[0]?.count || 0;
    const officesUsed = officesCount?.[0]?.count || 0;
    const usersUsed = usersCount?.[0]?.count || 0;
    const automationsUsed = automationsCount?.[0]?.count || 0;

    return {
      withinLimits: true,
      planId: sub.planId,
      plan: plan.name,
      leadsUsed,
      leadsLimit: plan.leads,
      leadsRemaining: plan.leads === -1 ? -1 : Math.max(0, plan.leads - leadsUsed),
      agentsActive,
      agentsAllowed: plan.agents,
      officesUsed,
      officesAllowed: plan.offices,
      usersUsed,
      usersAllowed: plan.users,
      automationsUsed,
      automationsAllowed: plan.automations,
      availableAgentTypes: plan.availableAgentTypes,
    };
  }
}

export function checkPlanLimit(type) {
  return async (req, res, next) => {
    try {
      const agencyId = req.user?.agency_id;
      if (!agencyId) return next();

      const billing = new BillingService();
      const limits = await billing.checkLimits(agencyId);
      const plan = PLANS[limits.planId] || PLANS.starter;

      let exceeded = false;
      let message = '';

      if (type === 'leads' && plan.leads !== -1 && limits.leadsUsed >= plan.leads) {
        exceeded = true;
        message = `Límite de leads alcanzado (${plan.leads}). Actualiza tu plan en Facturación.`;
      } else if (type === 'agents' && plan.agents !== -1 && limits.agentsActive >= plan.agents) {
        exceeded = true;
        message = `Límite de agentes IA alcanzado (${plan.agents}). Actualiza tu plan en Facturación.`;
      } else if (type === 'offices' && plan.offices !== -1 && limits.officesUsed >= plan.offices) {
        exceeded = true;
        message = `Límite de oficinas alcanzado (${plan.offices}). Actualiza tu plan en Facturación.`;
      } else if (type === 'users' && plan.users !== -1 && limits.usersUsed >= plan.users) {
        exceeded = true;
        message = `Límite de usuarios alcanzado (${plan.users}). Actualiza tu plan en Facturación.`;
      } else if (type === 'automations' && plan.automations !== -1 && limits.automationsUsed >= plan.automations) {
        exceeded = true;
        message = `Límite de automatizaciones alcanzado (${plan.automations}). Actualiza tu plan en Facturación.`;
      }

      if (exceeded) {
        return res.status(403).json({ error: message, code: 'plan_limit_exceeded', limit: type });
      }

      next();
    } catch (e) {
      next();
    }
  };
}

export default BillingService;
