import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { v4 as uuidv4 } from 'uuid'
import { get, run, all } from '../db/db.js'
import { auth, requirePlatformAdmin } from '../middleware/auth.js'

// Captura de leads de la propia web de marketing de PropIA (no de los
// clientes de PropIA — esto es para conseguir clientes, no para las
// agencias inmobiliarias que ya pagan). Público, sin auth.
const router = Router()

const leadMagnetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20, // por IP; suficiente para uso real, corta bots básicos
  message: { error: 'Demasiadas solicitudes, inténtalo más tarde.' },
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

router.post('/lead-magnet', leadMagnetLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const name = String(req.body?.name || '').trim().slice(0, 120) || null
    const agencyName = String(req.body?.agency_name || '').trim().slice(0, 160) || null
    const source = String(req.body?.source || 'lead_magnet').trim().slice(0, 60)

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email no válido' })

    const existing = await get('SELECT id FROM marketing_leads WHERE email = @email', { email })
    if (existing) {
      await run(
        'UPDATE marketing_leads SET name = COALESCE(@name, name), agency_name = COALESCE(@agency_name, agency_name), last_seen_at = NOW() WHERE id = @id',
        { name, agency_name: agencyName, id: existing.id }
      )
      return res.json({ ok: true, already_subscribed: true })
    }

    await run(
      `INSERT INTO marketing_leads (id, email, name, agency_name, source, created_at, last_seen_at)
       VALUES (@id, @email, @name, @agency_name, @source, NOW(), NOW())`,
      { id: uuidv4(), email, name, agency_name: agencyName, source }
    )
    // Envío del lead magnet en sí: NO automatizado todavía (no hay proveedor
    // de email propio conectado para esta lista). Queda registrado y visible
    // en /api/marketing/leads para exportar o conectar a Brevo/Mailchimp.
    console.log(`[MARKETING] Nuevo lead de marketing: ${email} (${source})`)
    res.json({ ok: true, already_subscribed: false })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Panel simple para Alejandro (no para clientes de pago): usa el mismo
// guard por email que /api/admin (ver server/middleware/auth.js).
router.get('/leads', auth, requirePlatformAdmin, async (req, res) => {
  try {
    const rows = await all('SELECT email, name, agency_name, source, created_at, last_seen_at FROM marketing_leads ORDER BY created_at DESC LIMIT 500')
    res.json({ items: rows, count: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
