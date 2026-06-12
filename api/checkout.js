import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { idUsuarioActual, emailUsuarioActual, idPrecio } = req.body;

    if (!idUsuarioActual || !emailUsuarioActual) {
      return res.status(400).json({ error: 'Falta el ID o el Email del usuario.' });
    }

    // NEVER use localhost in production - always use the Vercel URL
    const appUrl = (process.env.VITE_APP_URL || process.env.APP_URL || '')
      .replace('http://localhost:3000', '')
      .replace('http://localhost:5173', '') || 'https://softwareinmobiliario-3ytt-duyc8za84.vercel.app';

    // Use passed price ID or fall back to env
    const priceId = idPrecio || process.env.STRIPE_PRICE_ID;
    
    if (!priceId || priceId.includes('price_xxx') || priceId.includes('id_de_stripe')) {
      return res.status(400).json({ 
        error: 'Plan de pago no configurado. Contacta con soporte.' 
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      client_reference_id: String(idUsuarioActual),
      customer_email: emailUsuarioActual,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message });
  }
}
