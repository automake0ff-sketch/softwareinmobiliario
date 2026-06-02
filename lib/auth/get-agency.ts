import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Inicializamos el cliente de Supabase para el servidor
// Usamos variables de entorno para proteger las credenciales
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function getAgency() {
  const cookieStore = cookies();
  
  // 1. Creamos el cliente de Supabase pasando las cookies para mantener la sesión del usuario
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false
    }
  });

  // 2. Obtenemos el usuario que está logueado actualmente
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { agency: null, user: null, error: 'No autenticado' };
  }

  // 3. Buscamos la agencia asociada a este usuario en la tabla 'agencies'
  // Nota: Aquí se ejecuta de forma automática la función de Supabase y el RLS que creaste en el Paso 1
  const { data: agency, error: dbError } = await supabase
    .from('agencies')
    .select('*')
    .single(); // Trae una única fila debido a las reglas de RLS

  if (dbError || !agency) {
    return { agency: null, user, error: 'No se encontró una agencia vinculada' };
  }

  // Si todo está bien, devolvemos la agencia y el usuario autenticado
  return { agency, user, error: null };
}
