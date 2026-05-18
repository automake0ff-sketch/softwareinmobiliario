import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth } from '../middleware/auth.js'
import { sendToDestination } from '../services/destinations.js'

const router = Router()
router.use(auth)

// GET /api/destinations — listar destinos de la agencia
router.get('/', (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const destinations = all(
      'SELECT id, type, name, is_active, last_tested_at, last_test_ok, created_at FROM agency_destinations WHERE agency_id = @agency_id ORDER BY created_at DESC',
      { agency_id: agencyId }
    ).map(d => ({ ...d, credentials: undefined }))

    res.json(destinations)
  } catch (error) {
    console.error('Error listing destinations:', error)
    res.status(500).json({ error: 'Error al obtener destinos' })
  }
})

// GET /api/destinations/types — tipos disponibles
router.get('/types', (req, res) => {
  res.json([
    { id: 'whatsapp', label: 'WhatsApp Business', icon: 'MessageCircle', color: '#25d366',
      fields: [
        { key: 'token', label: 'Token de acceso', type: 'password' },
        { key: 'phone_number_id', label: 'Phone Number ID', type: 'text' },
      ]
    },
    { id: 'email_sendgrid', label: 'SendGrid Email', icon: 'Mail', color: '#1a82e2',
      fields: [
        { key: 'api_key', label: 'API Key', type: 'password' },
        { key: 'from_email', label: 'Email remitente', type: 'email' },
        { key: 'from_name', label: 'Nombre remitente', type: 'text' },
        { key: 'default_to', label: 'Email destino fijo (opcional)', type: 'email' },
      ]
    },
    { id: 'email_smtp', label: 'Email SMTP propio', icon: 'Server', color: '#6366f1',
      fields: [
        { key: 'host', label: 'Servidor SMTP', type: 'text' },
        { key: 'port', label: 'Puerto', type: 'text' },
        { key: 'user', label: 'Usuario', type: 'text' },
        { key: 'password', label: 'Contraseña', type: 'password' },
        { key: 'from_email', label: 'Email remitente', type: 'email' },
        { key: 'from_name', label: 'Nombre remitente', type: 'text' },
      ]
    },
    { id: 'webhook', label: 'Webhook HTTP', icon: 'Link', color: '#f59e0b',
      fields: [
        { key: 'url', label: 'URL del webhook', type: 'url' },
        { key: 'method', label: 'Método (POST/GET)', type: 'text' },
        { key: 'auth_type', label: 'Autenticación (bearer/basic/none)', type: 'text' },
        { key: 'auth_value', label: 'Token o usuario:pass', type: 'password' },
      ]
    },
    { id: 'telegram', label: 'Telegram', icon: 'MessageCircle', color: '#2ca5e0',
      fields: [
        { key: 'bot_token', label: 'Bot Token', type: 'password' },
        { key: 'chat_id', label: 'Chat ID', type: 'text' },
      ]
    },
    { id: 'slack', label: 'Slack', icon: 'MessageCircle', color: '#4a154b',
      fields: [
        { key: 'webhook_url', label: 'Webhook URL de Slack', type: 'url' },
      ]
    },
    { id: 'notion', label: 'Notion', icon: 'FileText', color: '#000000',
      fields: [
        { key: 'api_key', label: 'Integration Token', type: 'password' },
        { key: 'database_id', label: 'Database ID', type: 'text' },
      ]
    },
    { id: 'airtable', label: 'Airtable', icon: 'Grid', color: '#ff6b35',
      fields: [
        { key: 'api_key', label: 'Personal Access Token', type: 'password' },
        { key: 'base_id', label: 'Base ID', type: 'text' },
        { key: 'table_name', label: 'Nombre de la tabla', type: 'text' },
      ]
    },
    { id: 'crm_field', label: 'Campo del CRM', icon: 'Database', color: '#06b6d4', fields: [] },
    { id: 'internal_notification', label: 'Notificación interna', icon: 'Bell', color: '#ef4444', fields: [] },
  ])
})

// POST /api/destinations — crear nuevo destino
router.post('/', (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const { type, name, credentials } = req.body
    if (!type || !name) return res.status(400).json({ error: 'type y name son requeridos' })

    const id = uuidv4()
    run(
      `INSERT INTO agency_destinations (id, agency_id, type, name, credentials, is_active, created_at)
       VALUES (@id, @agency_id, @type, @name, @credentials, 1, datetime('now'))`,
      { id, agency_id: agencyId, type, name, credentials: JSON.stringify(credentials || {}) }
    )

    const created = get('SELECT id, type, name, is_active, created_at FROM agency_destinations WHERE id = @id', { id })
    res.status(201).json(created)
  } catch (error) {
    console.error('Error creating destination:', error)
    res.status(500).json({ error: 'Error al crear destino' })
  }
})

// PUT /api/destinations/:id — actualizar destino
router.put('/:id', (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const dest = get('SELECT * FROM agency_destinations WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: agencyId })
    if (!dest) return res.status(404).json({ error: 'Destino no encontrado' })

    const { name, credentials, is_active } = req.body
    run(
      `UPDATE agency_destinations SET name = @name, credentials = @credentials, is_active = @is_active WHERE id = @id`,
      {
        name: name || dest.name,
        credentials: JSON.stringify(credentials || JSON.parse(dest.credentials || '{}')),
        is_active: is_active !== undefined ? (is_active ? 1 : 0) : dest.is_active,
        id: req.params.id,
      }
    )

    res.json({ message: 'Destino actualizado' })
  } catch (error) {
    console.error('Error updating destination:', error)
    res.status(500).json({ error: 'Error al actualizar destino' })
  }
})

// DELETE /api/destinations/:id
router.delete('/:id', (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const dest = get('SELECT id FROM agency_destinations WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: agencyId })
    if (!dest) return res.status(404).json({ error: 'Destino no encontrado' })

    run('DELETE FROM agency_destinations WHERE id = @id', { id: req.params.id })
    res.json({ message: 'Destino eliminado' })
  } catch (error) {
    console.error('Error deleting destination:', error)
    res.status(500).json({ error: 'Error al eliminar destino' })
  }
})

// POST /api/destinations/:id/test — probar destino
router.post('/:id/test', async (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const dest = get('SELECT * FROM agency_destinations WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: agencyId })
    if (!dest) return res.status(404).json({ error: 'Destino no encontrado' })

    const result = await sendToDestination({
      destConfig: { type: dest.type, destination_id: dest.id },
      content: `✅ Prueba de conexión desde el CRM. Destino "${dest.name}" configurado correctamente. ${new Date().toLocaleString('es-ES')}`,
      ctx: {
        lead_name: 'Lead de Prueba',
        phone: '+34 600 000 000',
        email: 'test@crm.app',
        score: 75,
        stage: 'interesado',
        zone: 'Centro',
        budget_max: 250000,
        agency_name: 'Mi Agencia',
      },
      agencyId,
    })

    const testOk = result.ok ? 1 : 0
    run(`UPDATE agency_destinations SET last_tested_at = datetime('now'), last_test_ok = @test_ok WHERE id = @id`,
      { test_ok: testOk, id: req.params.id })

    res.json({ ok: result.ok, detail: result.detail })
  } catch (error) {
    console.error('Error testing destination:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
