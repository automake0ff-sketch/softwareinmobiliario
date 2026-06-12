import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, nombreAgencia, telefono, ciudad, apiWhatsapp, apiCorreo } = req.body;

    if (!email || !password || !nombreAgencia) {
      return res.status(400).json({ 
        error: 'El email, la contraseña y el nombre de la agencia son obligatorios.' 
      });
    }

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      if (authError?.message?.includes('already registered') || authError?.message?.includes('already been registered')) {
        return res.status(400).json({ error: 'Este email ya está registrado. Por favor inicia sesión.' });
      }
      return res.status(400).json({ error: authError?.message || 'Error al crear el usuario.' });
    }

    const userId = authData.user.id;

    // 2. Create agency profile in inmosaas table
    const { error: profileError } = await supabaseAdmin
      .from('inmosaas')
      .upsert({
        user_id: userId,
        email,
        nombre_completo: nombreAgencia,
        nombre_empresa: nombreAgencia,
        ciudad: ciudad || '',
        telefono: telefono || '',
        api_whatsapp: apiWhatsapp || '',
        api_correo: apiCorreo || '',
        actualizado_en: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Don't fail - the trigger will have created a partial profile
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Agencia creada correctamente',
      user_id: userId 
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
