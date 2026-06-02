import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAgency } from '@/lib/auth/get-agency';

// Inicializamos el cliente de Supabase para el servidor
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 🕵️‍♂️ Seguridad: Validamos la sesión y la existencia de la agencia del usuario
    const { agency, error: authError } = await getAgency();

    if (authError || !agency) {
      return NextResponse.json(
        { error: 'No autorizado. Debes iniciar sesión para instalar plantillas.' },
        { status: 401 }
      );
    }

    // 💳 Monetización: El plan debe estar activo en la tabla 'agencies'
    if (agency.estado !== 'activo' || !agency.plan_activo) {
      return NextResponse.json(
        { 
          error: 'Acceso denegado.', 
          requierePago: true,
          mensaje: 'Tu plan actual no te permite instalar automatizaciones. Por favor, realiza el pago en Stripe.' 
        },
        { status: 403 }
      );
    }

    // El ID de la plantilla que viene directamente desde la URL de Next.js
    const templateId = params.id;

    if (!templateId) {
      return NextResponse.json(
        { error: 'El ID de la plantilla es obligatorio.' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 🚀 Ejecutar la función nativa de Supabase (install_template)
    const { data, error: rpcError } = await supabase.rpc('install_template', {
      p_template_id: templateId,
      p_agency_id: agency.id
    });

    if (rpcError) {
      console.error('Error al ejecutar rpc install_template:', rpcError);
      return NextResponse.json(
        { error: `Error durante la instalación en la base de datos: ${rpcError.message}` },
        { status: 500 }
      );
    }

    // Respuesta de éxito
    return NextResponse.json({
      success: true,
      mensaje: 'La plantilla de automatización ha sido instalada correctamente en tu CRM.',
      resultado: data
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error crítico en el endpoint de instalación:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor al intentar instalar la plantilla.' },
      { status: 500 }
    );
  }
}
