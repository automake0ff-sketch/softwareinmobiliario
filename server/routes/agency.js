import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth, requireRole } from '../middleware/auth.js';
import { checkFeature } from '../services/plan-checker.js';

const router = Router();
router.use(auth);

router.get('/:id', (req, res) => {
  try {
    const agency = get('SELECT * FROM agencies WHERE id = @id', { id: req.params.id });
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada.' });

    const offices = all('SELECT * FROM offices WHERE agency_id = @agency_id ORDER BY name', { agency_id: req.params.id });
    const users = all('SELECT id, email, name, role, office_id, avatar, phone, active FROM users WHERE agency_id = @agency_id ORDER BY name', { agency_id: req.params.id });

    res.json({ ...agency, offices, users });
  } catch (error) {
    console.error('Error getting agency:', error);
    res.status(500).json({ error: 'Error al obtener agencia.' });
  }
});

router.post('/', requireRole('admin'), (req, res) => {
  try {
    const { name, slug, logo_url, primary_color, domain, custom_domain } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Faltan campos obligatorios: name, slug.' });

    const existing = get('SELECT id FROM agencies WHERE slug = @slug', { slug });
    if (existing) return res.status(409).json({ error: 'Ya existe una agencia con ese slug.' });

    const id = uuidv4();
    const finalDomain = custom_domain || domain || null;
    run(
      `INSERT INTO agencies (id, name, slug, logo_url, primary_color, custom_domain, created_at)
       VALUES (@id, @name, @slug, @logo_url, @primary_color, @custom_domain, NOW())`,
      { id, name, slug, logo_url, primary_color: primary_color || '#2563eb', custom_domain: finalDomain }
    );

    const agency = get('SELECT * FROM agencies WHERE id = @id', { id });
    res.status(201).json(agency);
  } catch (error) {
    console.error('Error creating agency:', error);
    res.status(500).json({ error: 'Error al crear agencia.' });
  }
});

router.patch('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = get('SELECT * FROM agencies WHERE id = @id', { id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Agencia no encontrada.' });

    // Mapear domain a custom_domain para compatibilidad
    if (req.body.domain !== undefined && req.body.custom_domain === undefined) {
      req.body.custom_domain = req.body.domain;
    }

    const whiteLabelFields = ['logo_url', 'primary_color', 'custom_domain'];
    const hasWhiteLabelUpdate = whiteLabelFields.some(f => req.body[f] !== undefined);
    if (hasWhiteLabelUpdate) {
      const featureCheck = checkFeature('white_label')(req, res, () => {})
      if (featureCheck !== undefined) return // 402 sent by middleware
    }

    const allowed = ['name', 'slug', 'logo_url', 'primary_color', 'custom_domain',
      'email', 'phone', 'address', 'city', 'province', 'website',
      'idealista_api_key', 'idealista_api_secret', 'idealista_import_mode', 'idealista_office_id',
    ];
    const updates = [];
    const params = { id: req.params.id };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = @${field}`);
        params[field] = req.body[field];
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });
    run(`UPDATE agencies SET ${updates.join(', ')} WHERE id = @id`, params);

    const agency = get('SELECT * FROM agencies WHERE id = @id', { id: req.params.id });
    res.json(agency);
  } catch (error) {
    console.error('Error updating agency:', error);
    res.status(500).json({ error: 'Error al actualizar agencia.' });
  }
});

router.get('/:id/stats', (req, res) => {
  try {
    const aid = req.params.id;

    const totalLeads = get('SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid', { aid }).count;
    const leadsByStatus = all('SELECT status, COUNT(*) as count FROM leads WHERE agency_id = @aid GROUP BY status', { aid });
    const totalProperties = get('SELECT COUNT(*) as count FROM properties WHERE agency_id = @aid', { aid }).count;
    const propertiesByStatus = all('SELECT status, COUNT(*) as count FROM properties WHERE agency_id = @aid GROUP BY status', { aid });
    const totalUsers = get('SELECT COUNT(*) as count FROM users WHERE agency_id = @aid AND active = 1', { aid }).count;

    const leadsThisMonth = get(
      "SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= datetime('now', 'start of month')",
      { aid }
    ).count;

    const conversion = get(
      "SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND status IN ('reserva','cerrado')",
      { aid }
    ).count;

    const avgScore = get('SELECT AVG(ia_score) as avg FROM leads WHERE agency_id = @aid AND ia_score > 0', { aid }).avg;

    const topZone = get(
      'SELECT zone, COUNT(*) as count FROM leads WHERE agency_id = @aid AND zone IS NOT NULL GROUP BY zone ORDER BY count DESC LIMIT 1',
      { aid }
    );

    res.json({
      totalLeads,
      leadsByStatus,
      totalProperties,
      propertiesByStatus,
      totalUsers,
      leadsThisMonth,
      conversionRate: totalLeads > 0 ? ((conversion / totalLeads) * 100).toFixed(1) : 0,
      avgScore: avgScore ? Number(avgScore).toFixed(1) : null,
      topZone: topZone ? topZone.zone : null,
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

router.get('/:id/ranking', (req, res) => {
  try {
    const aid = req.params.id;

    const ranking = all(
      `SELECT u.id, u.name, u.avatar, u.office_id, o.name AS office_name,
              COUNT(l.id) AS total_leads,
              SUM(CASE WHEN l.status IN ('reserva','cerrado') THEN 1 ELSE 0 END) AS converted,
              AVG(l.ia_score) AS avg_score
       FROM users u
       LEFT JOIN leads l ON l.assigned_to = u.id
       LEFT JOIN offices o ON u.office_id = o.id
       WHERE u.agency_id = @aid AND u.role = 'comercial'
       GROUP BY u.id
       ORDER BY converted DESC, avg_score DESC`,
      { aid }
    );

    res.json(ranking);
  } catch (error) {
    console.error('Error getting ranking:', error);
    res.status(500).json({ error: 'Error al obtener ranking.' });
  }
});

// ── Campos permitidos para configuración de agencia ──
const CONFIG_FIELDS = [
  'name','slug','city','email','phone','address','website','instagram','facebook','linkedin','tiktok',
  'whatsapp_number','whatsapp_token','whatsapp_phone_id',
  'sendgrid_api_key','sendgrid_from_email','sendgrid_from_name',
  'smtp_host','smtp_port','smtp_user','smtp_password',
  'telegram_bot_token','telegram_chat_id',
  'slack_webhook_url',
  'notion_api_key','notion_database_id',
  'airtable_api_key','airtable_base_id','airtable_table',
  'google_sheets_id',
  'zapier_webhook_url','make_webhook_url','n8n_webhook_url',
  'onboarding_completed','onboarding_step',
  'online_meeting_url','appointment_attendant_name','working_hours','timezone',
  'idealista_api_key','idealista_api_secret','idealista_import_mode','idealista_office_id',
  'email_signature','auto_send_email','auto_send_whatsapp','require_email_confirmation',
  'require_whatsapp_confirmation','default_channel','reminder_2h_enabled',
  'app_Url',
]

// GET /api/agency/config — Obtener configuración de la agencia actual
router.get('/config', (req, res) => {
  try {
    const agencyId = req.user?.agency_id
    if (!agencyId) return res.status(401).json({ error: 'No agency context' })
    const agency = get('SELECT * FROM agencies WHERE id = @id', { id: agencyId })
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' })
    const config = {}
    for (const field of CONFIG_FIELDS) {
      config[field] = agency[field] ?? ''
    }
    res.json(config)
  } catch (error) {
    console.error('Error getting agency config:', error)
    res.status(500).json({ error: 'Error al obtener configuración' })
  }
})

// PATCH /api/agency/config — Actualizar configuración de la agencia
router.patch('/config', (req, res) => {
  try {
    const agencyId = req.user?.agency_id
    if (!agencyId) return res.status(401).json({ error: 'No agency context' })
    const safeUpdate = {}
    for (const [key, value] of Object.entries(req.body)) {
      if (CONFIG_FIELDS.includes(key)) safeUpdate[key] = value
    }
    if (Object.keys(safeUpdate).length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para actualizar' })
    }
    safeUpdate.id = agencyId
    const setClauses = Object.keys(safeUpdate)
      .filter(k => k !== 'id')
      .map(k => `${k} = @${k}`)
      .join(', ')
    run(`UPDATE agencies SET ${setClauses} WHERE id = @id`, safeUpdate)
    const updated = get('SELECT * FROM agencies WHERE id = @id', { id: agencyId })
    const config = {}
    for (const field of CONFIG_FIELDS) {
      config[field] = updated[field] ?? ''
    }
    res.json(config)
  } catch (error) {
    console.error('Error updating agency config:', error)
    res.status(500).json({ error: 'Error al actualizar configuración' })
  }
})

// POST /api/agency/test-integration — Probar conexión con integraciones
router.post('/test-integration', async (req, res) => {
  try {
    const agencyId = req.user?.agency_id
    if (!agencyId) return res.status(401).json({ error: 'No agency context' })
    const { integration, config } = req.body
    if (!integration) return res.status(400).json({ error: 'integration requerido' })

    const creds = config || {}

    switch (integration) {
      case 'whatsapp': {
        if (!creds.whatsapp_token || !creds.whatsapp_phone_id) {
          return res.json({ ok: false, msg: 'Faltan token o Phone Number ID' })
        }
        const r = await fetch(
          `https://graph.facebook.com/v18.0/${creds.whatsapp_phone_id}`,
          { headers: { Authorization: `Bearer ${creds.whatsapp_token}` } }
        )
        const d = await r.json()
        return res.json({
          ok: r.ok,
          msg: r.ok
            ? `✓ WhatsApp conectado: ${d.display_phone_number || creds.whatsapp_phone_id}`
            : `Error: ${d.error?.message || r.status}`
        })
      }

      case 'email': {
        if (creds.sendgrid_api_key) {
          const r = await fetch('https://api.sendgrid.com/v3/user/profile', {
            headers: { Authorization: `Bearer ${creds.sendgrid_api_key}` }
          })
          return res.json({ ok: r.ok, msg: r.ok ? '✓ SendGrid conectado correctamente' : 'Error: API key inválida' })
        }
        return res.json({ ok: false, msg: 'Sin credenciales de email configuradas' })
      }

      case 'notifications': {
        const results = []
        if (creds.slack_webhook_url) {
          const r = await fetch(creds.slack_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: '✅ PropIA conectado correctamente a Slack' }),
          })
          results.push(r.ok ? '✓ Slack OK' : '✗ Slack error')
        }
        if (creds.telegram_bot_token && creds.telegram_chat_id) {
          const r = await fetch(
            `https://api.telegram.org/bot${creds.telegram_bot_token}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: creds.telegram_chat_id, text: '✅ PropIA conectado correctamente a Telegram' }),
            }
          )
          results.push(r.ok ? '✓ Telegram OK' : '✗ Telegram error')
        }
        if (results.length === 0) {
          return res.json({ ok: false, msg: 'Sin credenciales de notificación configuradas' })
        }
        return res.json({ ok: results.every(r => r.startsWith('✓')), msg: results.join(' · ') })
      }

      case 'webhooks': {
        const url = creds.zapier_webhook_url || creds.make_webhook_url || creds.n8n_webhook_url
        if (!url) return res.json({ ok: false, msg: 'Sin webhooks configurados' })
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true, source: 'PropIA', timestamp: new Date().toISOString() }),
        })
        return res.json({ ok: r.ok, msg: r.ok ? `✓ Webhook respondió con ${r.status}` : `✗ Error ${r.status}` })
      }

      default:
        return res.json({ ok: false, msg: 'Integración desconocida' })
    }
  } catch (err) {
    res.json({ ok: false, msg: String(err) })
  }
})

router.get('/:id/feed', (req, res) => {
  try {
    const activities = all(
      `SELECT a.*, u.name AS user_name, l.name AS lead_name
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN leads l ON a.lead_id = l.id
       WHERE a.agency_id = @agency_id
       ORDER BY a.created_at DESC LIMIT 50`,
      { agency_id: req.params.id }
    );

    res.json(activities);
  } catch (error) {
    console.error('Error getting feed:', error);
    res.status(500).json({ error: 'Error al obtener feed de actividad.' });
  }
});

export default router;
