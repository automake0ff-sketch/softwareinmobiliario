import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Middleware to extract user ID from Clerk session header (simplified for this example)
function getUserId(req) {
  const authHeader = req.headers['authorization'] || '';
  // Expected format: Bearer clerkId
  const token = authHeader.split(' ')[1];
  return token; // Assume token is the clerk userId
}

router.post('/step2', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
  }
  const { nombreEmpresa, ciudad, telefonoCorp, telefonoPersonal } = req.body;
  if (!nombreEmpresa || !ciudad || !telefonoCorp) {
    return res.status(400).json({ success: false, error: 'Datos incompletos' });
  }
  try {
    const { data: nuevaEmpresa, error: errorEmpresa } = await supabase
      .from('empresas')
      .insert({ nombre_empresa: nombreEmpresa, ciudad, telefono_corporativo: telefonoCorp })
      .select('id')
      .single();
    if (errorEmpresa || !nuevaEmpresa) {
      return res.status(500).json({ success: false, error: 'No se pudo crear la empresa' });
    }
    const updateData = { empresa_id: nuevaEmpresa.id, onboarding_paso: 3 };
    if (telefonoPersonal) updateData.telefono = telefonoPersonal;
    const { error: errorUsuario } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('clerk_id', userId);
    if (errorUsuario) {
      return res.status(500).json({ success: false, error: 'Error al vincular el usuario a la empresa' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;
