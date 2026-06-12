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
    const { email, password, name, phone, agencyName, agencyCity, agencyPhone, agencyEmail, plan } = req.body;
    // Just return success - the actual user was already created by Supabase Auth in the frontend
    // This endpoint is for the legacy SQLite backend compatibility
    return res.status(200).json({
      success: true,
      user: { id: 'supabase-user', email, name, role: 'admin', agency_id: 'supabase-agency' },
      agency: { id: 'supabase-agency', name: agencyName || 'Mi Agencia' },
      token: 'supabase-managed'
    });
  } catch (error) {
    console.error('Register compat error:', error);
    return res.status(500).json({ error: 'Error interno.' });
  }
}
