import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = req.body;
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (userId) {
          await supabaseAdmin.from('inmosaas').update({
            plan_activo: 'starter',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            actualizado_en: new Date().toISOString(),
          }).eq('user_id', userId);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await supabaseAdmin.from('inmosaas').update({
          plan_activo: null,
          actualizado_en: new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id);
        break;
      }
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { api: { bodyParser: false } };
