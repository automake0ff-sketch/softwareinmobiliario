const PRICES_CENTS = {
  starter_monthly: 1900, starter_yearly: 19000,
  profesional_monthly: 3900, profesional_yearly: 39000,
  agencia_monthly: 7900, agencia_yearly: 79000,
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
    price: 19,
    priceYearly: 190,
    priceCentsMonthly: PRICES_CENTS.starter_monthly,
    priceCentsYearly: PRICES_CENTS.starter_yearly,
    leads: 500,
    agents: 3,
    offices: 1,
    users: 2,
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
    price: 39,
    priceYearly: 390,
    priceCentsMonthly: PRICES_CENTS.profesional_monthly,
    priceCentsYearly: PRICES_CENTS.profesional_yearly,
    leads: 2000,
    agents: 8,
    offices: 3,
    users: 5,
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
    price: 79,
    priceYearly: 790,
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
};

import crypto from 'node:crypto'

// Verificación de la firma de los webhooks de Stripe, sin depender del paquete 'stripe'.
// Formato de la cabecera: "t=1700000000,v1=<hmac>[,v1=<hmac>...]" con HMAC-SHA256 de "t.cuerpo".
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) throw new Error('Falta la firma de Stripe.')
  const parts = String(header).split(',').map((p) => p.trim().split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length) throw new Error('Cabecera de firma de Stripe no válida.')
  const ts = Number(t)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) throw new Error('La firma de Stripe ha caducado.')
  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  const ok = sigs.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
  if (!ok) throw new Error('La firma de Stripe no coincide.')
  return JSON.parse(payload)
}

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
  async _activateAgencyPlan(agencyId, planSlug, status = 'active') {
    const { run: runQuery } = await this._db();
    await runQuery(
      `UPDATE agencies SET plan = @plan, plan_status = @status, updated_at = NOW() WHERE id = @id`,
      { plan: planSlug, status, id: agencyId }
    );
  }

  // Solo cambia el estado (sin tocar el plan): lo usan los eventos de Stripe.
  async _setAgencyStatus(agencyId, status) {
    const { run: runQuery } = await this._db();
    await runQuery(
      `UPDATE agencies SET plan_status = @status, updated_at = NOW() WHERE id = @id`,
      { status, id: agencyId }
    );
  }

  // Estados de Stripe -> estados de la aplicación. Con 'active', 'trialing' y 'past_due'
  // se puede usar la aplicación (past_due da margen mientras Stripe reintenta el cobro).
  static mapStripeStatus(stripeStatus) {
    switch (stripeStatus) {
      case 'active': return 'active';
      case 'trialing': return 'trialing';
      case 'past_due': return 'past_due';
      case 'unpaid': return 'unpaid';
      case 'canceled':
      case 'incomplete_expired': return 'canceled';
      default: return 'inactive'; // incomplete, paused, etc.
    }
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
      const resp = await fetch(`${this.stripeBase}/v1/customers`, {
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

  // Prueba gratuita con tarjeta: 3 días y, al terminar, la suscripción se cobra con 10 % de descuento.
  // Duración del descuento: 'forever' (todas las renovaciones), 'once' (solo el primer cobro).
  static TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 3);
  static TRIAL_DISCOUNT_PERCENT = Number(process.env.TRIAL_DISCOUNT_PERCENT || 10);
  static TRIAL_DISCOUNT_DURATION = process.env.TRIAL_DISCOUNT_DURATION || 'forever';

  get stripeBase() {
    return process.env.STRIPE_API_BASE || 'https://api.stripe.com';
  }

  async _stripe(path, { method = 'GET', params } = {}) {
    const resp = await fetch(`${this.stripeBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: params,
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  }

  // Crea (una sola vez) el cupón del descuento de la prueba y devuelve su id.
  async _ensureTrialCoupon() {
    const pct = BillingService.TRIAL_DISCOUNT_PERCENT;
    const duration = BillingService.TRIAL_DISCOUNT_DURATION;
    const id = `propia-trial-${pct}-${duration}`;
    const found = await this._stripe(`/v1/coupons/${id}`);
    if (found.ok) return id;
    const params = new URLSearchParams({ id, percent_off: String(pct), duration, name: `Prueba PropIA -${pct}%` });
    const created = await this._stripe('/v1/coupons', { method: 'POST', params });
    if (!created.ok && created.data?.error?.code !== 'resource_already_exists') {
      throw new Error(created.data?.error?.message || 'No se pudo crear el cupón de descuento');
    }
    return id;
  }

  async _trialEligible(agencyId) {
    const { get: getRow } = await this._db();
    const prev = await getRow(
      'SELECT id FROM subscriptions WHERE agency_id = @aid AND stripe_subscription_id IS NOT NULL LIMIT 1',
      { aid: agencyId }
    );
    return !prev;
  }

  async createCheckoutSession(agency, planId, interval, requestOrigin) {
    interval = interval === 'year' ? 'year' : 'month';
    const plan = PLANS[planId];
    if (!plan) throw new Error(`Invalid plan: ${planId}`);

    const amountCents = interval === 'year' ? plan.priceCentsYearly : plan.priceCentsMonthly;
    const trial = await this._trialEligible(agency.id);
    const discountPct = trial ? BillingService.TRIAL_DISCOUNT_PERCENT : 0;
    const trialDays = trial ? BillingService.TRIAL_DAYS : 0;

    let baseUrl = this.config.appUrl || 'http://localhost:5173';
    if (requestOrigin) {
      try {
        const parsed = new URL(requestOrigin);
        baseUrl = `${parsed.protocol}//${parsed.host}`;
      } catch {
        console.warn(`[STRIPE] requestOrigin inválido, ignorado: ${requestOrigin}`);
      }
    }
    if (process.env.NODE_ENV === 'production' && baseUrl.includes('localhost')) {
      console.error(`[STRIPE] ALERTA: redirigiendo checkout a una URL localhost en producción (${baseUrl}). Revisa APP_URL.`);
    }

    // Sin clave de Stripe: SOLO en desarrollo/test se simula (y se activa la prueba).
    // En producción nunca se activa un plan sin pasar por Stripe.
    if (!this.config.secretKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Los pagos no están configurados. Contacta con soporte.');
      }
      const { run } = await this._db();
      const now = new Date().toISOString();
      const trialEnd = trial ? new Date(Date.now() + trialDays * 86400000).toISOString() : null;
      const periodEnd = trialEnd || new Date(Date.now() + (interval === 'year' ? 365 : 30) * 86400000).toISOString();
      const planUuid = await this._planUuid(planId);
      await run(
        `INSERT INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, payment_method, created_at, updated_at)
         VALUES (@id, @agency_id, @plan_id, @status, @cycle, @start, @end, @trial_end, 'stripe', @now, @now)
         ON CONFLICT (agency_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, billing_cycle = EXCLUDED.billing_cycle,
           current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
           trial_end = EXCLUDED.trial_end, updated_at = EXCLUDED.updated_at`,
        { id: uuidv4(), agency_id: agency.id, plan_id: planUuid, status: trial ? 'trialing' : 'active', cycle: interval === 'year' ? 'yearly' : 'monthly', start: now, end: periodEnd, trial_end: trialEnd, now }
      );
      await this._activateAgencyPlan(agency.id, planId, trial ? 'trialing' : 'active');
      return { mock: true, sessionId: `mock_cs_${Date.now()}`, url: `${baseUrl}/pricing?success=true`, plan: plan.name, interval, trial, trialDays, discountPercent: discountPct };
    }

    const existingSub = await (await this._db()).get(
      'SELECT stripe_customer_id FROM subscriptions WHERE agency_id = @aid AND stripe_customer_id IS NOT NULL',
      { aid: agency.id }
    );

    const params = new URLSearchParams({
      success_url: `${baseUrl}/pricing?success=true`,
      cancel_url: `${baseUrl}/pricing?canceled=true`,
      mode: 'subscription',
      client_reference_id: agency.id || '',
      payment_method_collection: 'always',
    });
    params.append('payment_method_types[0]', 'card');
    if (existingSub?.stripe_customer_id) params.append('customer', existingSub.stripe_customer_id);
    else if (agency.email) params.append('customer_email', agency.email);

    const meta = { agency_id: agency.id || '', plan_id: planId, interval };
    for (const [k, v] of Object.entries(meta)) {
      params.append(`metadata[${k}]`, v);
      params.append(`subscription_data[metadata][${k}]`, v); // para que los eventos de la suscripción sepan de qué agencia son
    }
    if (trial) {
      params.append('subscription_data[trial_period_days]', String(trialDays));
      params.append('subscription_data[trial_settings][end_behavior][missing_payment_method]', 'cancel');
      const coupon = await this._ensureTrialCoupon();
      params.append('discounts[0][coupon]', coupon);
    }

    params.append('line_items[0][price_data][currency]', 'eur');
    params.append('line_items[0][price_data][product_data][name]', `PropIA ${plan.name} (${interval === 'year' ? 'Anual' : 'Mensual'})`);
    params.append('line_items[0][price_data][unit_amount]', String(amountCents));
    params.append('line_items[0][price_data][recurring][interval]', interval);
    params.append('line_items[0][quantity]', '1');

    const res = await this._stripe('/v1/checkout/sessions', { method: 'POST', params });
    if (!res.ok || !res.data?.url) {
      throw new Error(res.data?.error?.message || 'No se pudo iniciar el pago con Stripe.');
    }
    return { sessionId: res.data.id, url: res.data.url, plan: plan.name, interval, trial, trialDays, discountPercent: discountPct };
  }

  async _agencyBySubscription(stripeSubscriptionId) {
    if (!stripeSubscriptionId) return null;
    const { all } = await this._db();
    const rows = await all('SELECT agency_id FROM subscriptions WHERE stripe_subscription_id = @sub_id', { sub_id: stripeSubscriptionId });
    return rows?.[0]?.agency_id || null;
  }

  async handleWebhook(event) {
    const { run } = await this._db();
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const agencyId = session.metadata?.agency_id;
          const planId = session.metadata?.plan_id;
          const interval = session.metadata?.interval || 'month';
          if (!agencyId || !planId || !PLANS[planId]) break;
          // Con prueba gratuita no hay cobro todavía: 'no_payment_required'.
          const status = session.payment_status === 'paid' ? 'active' : 'trialing';
          const now = new Date().toISOString();
          const planUuid = await this._planUuid(planId);
          await run(
            `INSERT INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, stripe_subscription_id, stripe_customer_id, payment_method, current_period_start, current_period_end, updated_at)
             VALUES (@id, @agency_id, @plan_id, @status, @cycle, @stripe_sub, @stripe_cus, 'stripe', @start, @end, @now)
             ON CONFLICT (agency_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, billing_cycle = EXCLUDED.billing_cycle,
               stripe_subscription_id = EXCLUDED.stripe_subscription_id, stripe_customer_id = EXCLUDED.stripe_customer_id,
               payment_method = 'stripe', updated_at = EXCLUDED.updated_at`,
            {
              id: uuidv4(), agency_id: agencyId, plan_id: planUuid, status, cycle: interval === 'year' ? 'yearly' : 'monthly',
              stripe_sub: session.subscription, stripe_cus: session.customer, start: now,
              end: new Date(Date.now() + (interval === 'year' ? 365 : 30) * 86400000).toISOString(), now,
            }
          );
          await this._activateAgencyPlan(agencyId, planId, status);
          console.log(`[STRIPE] Suscripción ${status}: ${agencyId} -> ${planId}`);
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const agencyId = sub.metadata?.agency_id || await this._agencyBySubscription(sub.id);
          if (!agencyId) break;
          // 'deleted' siempre es una baja, aunque el objeto aún diga otra cosa.
          const status = event.type === 'customer.subscription.deleted' ? 'canceled' : BillingService.mapStripeStatus(sub.status);
          // La tabla subscriptions solo admite trialing/active/past_due/canceled/expired/pending.
          const subStatus = { unpaid: 'expired', inactive: 'pending' }[status] || status;
          await run(
            `UPDATE subscriptions SET status = @status, cancel_at_period_end = @cancel, current_period_end = COALESCE(@period_end, current_period_end),
               trial_end = COALESCE(@trial_end, trial_end), stripe_subscription_id = COALESCE(stripe_subscription_id, @sub_id),
               canceled_at = CASE WHEN @status = 'canceled' THEN NOW() ELSE canceled_at END, updated_at = NOW()
             WHERE agency_id = @agency_id`,
            {
              status: subStatus, cancel: sub.cancel_at_period_end ? 1 : 0, sub_id: sub.id, agency_id: agencyId,
              period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
              trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            }
          );
          await this._setAgencyStatus(agencyId, status);
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object;
          const agencyId = await this._agencyBySubscription(invoice.subscription);
          if (!agencyId) break;
          if (invoice.amount_paid > 0) {
            await run(
              `INSERT INTO payment_history (id, agency_id, amount, currency, status, payment_method, stripe_invoice_id, stripe_payment_intent_id, invoice_url, invoice_pdf_url, description, period_start, period_end, created_at)
               VALUES (@id, @agency_id, @amount, @currency, 'succeeded', 'card', @inv_id, @pi_id, @inv_url, @pdf_url, @desc, @p_start, @p_end, NOW())`,
              {
                id: uuidv4(), agency_id: agencyId, amount: invoice.amount_paid, currency: invoice.currency?.toUpperCase() || 'EUR',
                inv_id: invoice.id, pi_id: invoice.payment_intent, inv_url: invoice.hosted_invoice_url, pdf_url: invoice.invoice_pdf,
                desc: 'Suscripción PropIA',
                p_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
                p_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
              }
            );
            // Un cobro correcto recupera una cuenta en 'past_due' o 'trialing'.
            await run("UPDATE subscriptions SET status = 'active', updated_at = NOW() WHERE agency_id = @a", { a: agencyId });
            await this._setAgencyStatus(agencyId, 'active');
          }
          break;
        }
        case 'invoice.payment_failed': {
          const failed = event.data.object;
          const agencyId = await this._agencyBySubscription(failed.subscription);
          if (!agencyId) break;
          await run("UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE agency_id = @a", { a: agencyId });
          await this._setAgencyStatus(agencyId, 'past_due');
          break;
        }
      }
      return { received: true };
    } catch (e) {
      console.error('[Stripe webhook error]', e);
      // 500: Stripe reintentará el evento. Con 200 se perdería para siempre.
      return { received: false, error: e.message };
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
    const subs = await all(
      `SELECT s.*, p.slug AS plan_slug
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.agency_id = @agency_id
       ORDER BY s.created_at DESC LIMIT 1`,
      { agency_id: agencyId }
    );
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
    const planSlug = sub.plan_slug || 'starter';
    const plan = PLANS[planSlug] || PLANS.starter;
    return {
      id: sub.id,
      planId: planSlug,
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

  // Durante la prueba, cancelar corta el acceso al momento y no se cobra nada.
  // Con la suscripción ya cobrada, se cancela al final del periodo pagado (el acceso sigue hasta entonces).
  async cancelSubscription(agencyId) {
    const { run, all } = await this._db();
    const subs = await all('SELECT * FROM subscriptions WHERE agency_id = @agency_id ORDER BY created_at DESC LIMIT 1', { agency_id: agencyId });
    const sub = subs?.[0];
    if (!sub || !['trialing', 'active', 'past_due'].includes(sub.status)) {
      return { success: false, status: sub?.status || 'inactive', error: 'No tienes una suscripción activa que cancelar.' };
    }
    const atPeriodEnd = sub.status === 'active';

    if (sub.stripe_subscription_id && this.config.secretKey) {
      const call = atPeriodEnd
        ? await this._stripe(`/v1/subscriptions/${sub.stripe_subscription_id}`, { method: 'POST', params: new URLSearchParams({ cancel_at_period_end: 'true' }) })
        : await this._stripe(`/v1/subscriptions/${sub.stripe_subscription_id}`, { method: 'DELETE' });
      if (!call.ok) {
        // Si Stripe no confirma la baja, NO se da por cancelada: se seguiría cobrando.
        return { success: false, status: sub.status, error: 'No se pudo cancelar en Stripe. Inténtalo de nuevo o contacta con soporte.' };
      }
    }

    if (atPeriodEnd) {
      await run('UPDATE subscriptions SET cancel_at_period_end = true, updated_at = NOW() WHERE agency_id = @agency_id', { agency_id: agencyId });
      return { success: true, status: 'active', cancelAtPeriodEnd: true, accessUntil: sub.current_period_end };
    }
    await run('UPDATE subscriptions SET status = \'canceled\', canceled_at = NOW(), updated_at = NOW() WHERE agency_id = @agency_id', { agency_id: agencyId });
    await this._setAgencyStatus(agencyId, 'canceled');
    return { success: true, status: 'canceled', cancelAtPeriodEnd: false };
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
