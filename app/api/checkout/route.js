import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { idUsuarioActual, emailUsuarioActual } = await req.json();

    if (!idUsuarioActual || !emailUsuarioActual) {
      return NextResponse.json(
        { error: 'Falta el ID o el Email del usuario actual.' },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      client_reference_id: String(idUsuarioActual),
      customer_email: emailUsuarioActual,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_DOMAIN}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_DOMAIN}/pricing?canceled=true`,
    });

    return NextResponse.json({ url: session.url });

  } catch (error) {
    console.error('Error al crear sesión de Stripe:', error);
    return NextResponse.json(
      { error: 'Error interno al procesar el pago' },
      { status: 500 }
    );
  }
}