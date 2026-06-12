import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos.' });
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const { data: profile } = await supabase
      .from('inmosaas')
      .select('*')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    return res.status(200).json({
      token: authData.session.access_token,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        name: profile?.nombre_completo || profile?.nombre_empresa || email,
        role: 'admin',
        agency_id: authData.user.id,
      },
      agency: {
        id: authData.user.id,
        name: profile?.nombre_empresa || 'Mi Agencia',
        city: profile?.ciudad || '',
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
