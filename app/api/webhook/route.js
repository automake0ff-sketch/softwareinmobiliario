import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// 🛡️ Inicializamos Supabase con la clave de servicio secreta (Service Role)
// Esto permite al webhook actualizar los datos saltándose el RLS de forma segura
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const body = await req.text(); 
  const sig = req.headers.get('stripe-signature');
  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    console.error(`❌ Error en Webhook: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // 💳 Procesamos el evento cuando el pago se completa con éxito
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Recuperamos el ID de la inmobiliaria (que pasamos como client_reference_id)
    const idInmobiliaria = session.client_reference_id; 
    
    // Obtenemos el ID del precio del plan comprado en Stripe
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const idPrecioPagado = lineItems.data?.[0]?.price?.id; 

    try {
      // 🚀 ACTUALIZACIÓN DIRECTA EN SUPABASE
      // Modificamos la tabla 'agencies' (tu paso 1-a) para activar el plan comercial
      const { error } = await supabase
        .from('agencies')
        .update({ 
          plan_activo: idPrecioPagado, 
          estado: 'activo' 
        })
        .eq('id', idInmobiliaria); // O la columna que uses como llave primaria

      if (error) throw error;

      console.log(`✅ Supabase actualizado con éxito para la agencia ID: ${idInmobiliaria}`);

    } catch (dbError) {
      console.error("❌ Error al actualizar Supabase desde Webhook:", dbError);
      return NextResponse.json({ error: "Error guardando el pago" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}