import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAgency } from '@/lib/auth/get-agency';

// Inicializamos el cliente estándar de Supabase para el cliente (respeta el RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET() {
  try {
    // ¡Seguridad: Verificamos si el usuario está autenticado y tiene una agencia activa
    const { agency, error: authError } = await getAgency();

    if (authError || !agency) {
      return NextResponse.json(
        { error: 'No autorizado. Debes iniciar sesión para ver las plantillas.' },
        { status: 401 }
      );
    }

    // ¡Control de Monetología: Verificamos si la agencia ha pagado su suscriptión
    if (agency.estado !== 'activo' || !agency.plan_activo) {
      return NextResponse.json(
        { 
          error: 'Acceso restringido.', 
          requierePago: true,
          mensaje: 'Debes activar un plan en PropIA para acceder al catálogo de plantillas de automatización.'  
        },
        { status: 403 }
      );
    }

    // Inicializamos Supabase para realizar la consulta
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // CONSULTA: Traemos las plantillas globales desde la tabla 'automation_templates'
    // Asumimos que las plantillas globales tienen una bandera o columna como 'is_global'
    const { data: templates, error: dbError } = await supabase
      .from('automation_templates')
      .select('*')
      .order('created_at', { ascending: true });

    if (dbError) {
      return NextResponse.json(
        { error: `Error al recuperar las plantillas: ${dbError.message}` },
        { status: 500 }
      );
    }

    // Devolvemos el array con las 25 plantillas al frontend
    return NextResponse.json({
      success: true,
      count: templates?.length || 0,
      templates: templates || []
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error crítico en el endpoint de plantillas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor al procesar la solicitación.' },
      { status: 500 }
    );
  }
}
