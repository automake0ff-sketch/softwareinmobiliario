import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { get, run } from '../db/db.js';

const router = Router();
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * POST /api/auth/social-login-or-register
 * El frontend (Layout.jsx) llama esto tras cada SIGNED_IN de Supabase.
 * Recibe el supabase_uid, crea agencia+usuario si es el primer login,
 * y devuelve un JWT propio firmado con SUPABASE_JWT_SECRET.
 */
router.post('/social-login-or-register', async (req, res) => {
  try {
    const { email, name, supabase_uid } = req.body;
    if (!supabase_uid) {
      return res.status(400).json({ error: 'Se requiere supabase_uid' });
    }

    let user = await get(
      `SELECT u.id, u.name, u.email, u.role, u.agency_id, u.office_id, a.plan, a.plan_status,
              a.name as agency_name, a.slug as agency_slug
       FROM users u LEFT JOIN agencies a ON a.id = u.agency_id
       WHERE u.id = @id AND u.active = true`,
      { id: supabase_uid }
    );

    // IMPORTANTE: no basta con comprobar "!user". El trigger on_auth_user_created
    // de Supabase (supabase/migrations/00002_rls.sql) crea automáticamente la fila
    // en public.users en cuanto Supabase Auth inserta en auth.users — lo cual pasa
    // ANTES de que el frontend llegue a llamar a este endpoint. Esa fila del trigger
    // siempre tiene agency_id NULL y role 'comercial' por defecto. Sin este chequeo
    // adicional, "user" ya existiría (creado por el trigger) y todo este bloque de
    // aprovisionamiento se saltaría siempre — dejando al usuario sin agencia para
    // siempre. Tratamos "existe pero sin agencia" igual que "no existe".
    if (!user || !user.agency_id) {
      const agencyId = supabase_uid;
      const userEmail = email || '';
      const userName = name || (userEmail ? userEmail.split('@')[0] : 'Usuario');
      const slug = 'inmo-' + agencyId.replace(/-/g, '').slice(0, 12);

      await run(
        `INSERT INTO agencies (id, name, slug, plan, plan_status)
         VALUES (@id, @name, @slug, 'starter', 'active')
         ON CONFLICT (id) DO NOTHING`,
        { id: agencyId, name: 'Mi Inmobiliaria', slug }
      );

      await run(
        `INSERT INTO auth.users (id, email) VALUES (@id, @email) ON CONFLICT (id) DO NOTHING`,
        { id: supabase_uid, email: email || '' }
      );

      // UPSERT real: si el trigger ya creó la fila (caso normal en producción),
      // la actualizamos con los valores correctos en vez de dejarla como estaba.
      await run(
        `INSERT INTO users (id, email, name, role, agency_id, active)
         VALUES (@id, @email, @name, 'admin', @agency_id, true)
         ON CONFLICT (id) DO UPDATE SET
           agency_id = COALESCE(users.agency_id, EXCLUDED.agency_id),
           role = CASE WHEN users.agency_id IS NULL THEN EXCLUDED.role ELSE users.role END,
           email = CASE WHEN users.email = '' OR users.email IS NULL THEN EXCLUDED.email ELSE users.email END`,
        { id: supabase_uid, email: userEmail, name: userName, agency_id: agencyId }
      );

      user = await get(
        `SELECT u.id, u.name, u.email, u.role, u.agency_id, u.office_id, a.plan, a.plan_status,
                a.name as agency_name, a.slug as agency_slug
         FROM users u LEFT JOIN agencies a ON a.id = u.agency_id
         WHERE u.id = @id AND u.active = true`,
        { id: supabase_uid }
      );
    }

    if (!user) {
      return res.status(500).json({ error: 'No se pudo crear o recuperar el usuario.' });
    }

    const token = jwt.sign(
      { sub: user.id, email: email || '' },
      SUPABASE_JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        agency_id: user.agency_id,
        office_id: user.office_id,
        token,
      },
      agency: {
        id: user.agency_id,
        name: user.agency_name,
        slug: user.agency_slug,
        plan: user.plan,
        plan_status: user.plan_status,
      },
    });
  } catch (err) {
    console.error('[AUTH-SYNC] Error:', err.message);
    res.status(500).json({ error: 'Error interno sincronizando la sesión.' });
  }
});

export default router;
