import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usamos el cliente de Supabase con el rol de administración (Service Role)
// Esto es indispensable para poder crear la agencia sorteando restricciones iniciales antes del pago
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req) {
  try {
    // 1. Extraemos los campos que provienen de tu formulario por pasos (Datos personales, Agencia, APIs...)
    const {
      email,
      password,
      nombreAgencia,
      telefono,
      apiWhatsapp,
      apiCorreo
    } = await req.json();

    // Validación básica de campos requeridos
    if (!email || !password || !nombreAgencia) {
      return NextResponse.json(
        { error: 'El email, la contraseña y el nombre de la agencia son obligatorios.' },
        { status: 400 }
      );
    }

    // 2. Registramos al usuario en el sistema de Autenticación nativo de Supabase (auth.users)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true // Se marca como verificado automáticamente para agilizar el onboarding
    });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { error: `Error de autenticación: ${authError?.message}` },
        { status: 400 }
      );
    }

    const newUserId = authData.user.id;

    // 3. Insertamos la fila en tu tabla 'agencies' (tu paso 1-a de la lista)
    // Vinculamos el registro con las columnas y credenciales de APIs que configuró el usuario
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from('agencies')
      .insert([
        {
          id: newUserId, // Usamos el ID del usuario de auth como clave primaria para el RLS
          name: nombreAgencia,
          email_corporativo: email,
          telefono_contacto: telefono || null,
          api_whatsapp_key: apiWhatsapp || null,
          api_correo_key: apiCorreo || null,
          estado: 'pendiente_pago', // Queda en espera hasta interceptar el webhook de Stripe
          plan_activo: null
        }
      ])
      .select()
      .single();

    if (agencyError) {
      // 🛡️ Limpieza de seguridad: si la tabla falla, borramos el usuario de auth para evitar registros corruptos
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { error: `Error al crear el registro de la agencia: ${agencyError.message}` },
        { status: 500 }
      );
    }

    // 4. Devolvemos una respuesta exitosa con los datos estructurados
    // Tu frontend usará este ID de agencia para iniciar el flujo de Stripe Checkout
    return NextResponse.json(
      {
        success: true,
        mensaje: 'Agencia e integraciones creadas correctamente.',
        idInmobiliaria: agencyData.id,
        emailInmobiliaria: agencyData.email_corporativo
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error crítico en el endpoint de registro:', error);
    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al procesar el registro.' },
      { status: 500 }
    );
  }
}
