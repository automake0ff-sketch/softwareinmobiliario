const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db/db.js'); // Assuming db utilities are exported here

// Endpoint para validar usuario de Clerk/Supabase y emitir JWT local
router.post('/social-login-sync', async (req, res) => {
  const { email, supabase_uid } = req.body;
  if (!email && !supabase_uid) {
    return res.status(400).json({ error: 'Se requiere email o supabase_uid' });
  }

  // 1. Buscar usuario en SQLite por email o uid
  const user = db.get('SELECT * FROM users WHERE email = @email OR supabase_uid = @uid', {
    email: email || '',
    uid: supabase_uid || ''
  });

  if (!user) {
    return res.status(404).json({ error: 'Usuario no sincronizado' });
  }

  // 2. Generar token JWT de nuestro sistema
  const JWT_SECRET = process.env.JWT_SECRET || 'crm-inmobiliario-secret-dev-key-2026';
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

  // 3. Obtener agencia del usuario
  const agency = db.get('SELECT * FROM agencies WHERE id = @id', { id: user.agency_id });

  // 4. Responder con datos y token
  res.json({
    user: { ...user, token },
    agency,
  });
});

module.exports = router;
