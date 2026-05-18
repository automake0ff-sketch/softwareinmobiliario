import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const PLAN_ORDER = { starter: 1, profesional: 2, agencia: 3, enterprise: 4 };

const REQUIRES_ICONS = {
  whatsapp: '💬', email: '📧', slack: '💜',
  telegram: '✈️', notion: '📓', airtable: '🗃️',
  sheets: '📊', webhook: '🔗',
};

router.get('/', (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    const category = req.query.category;

    const agency = get('SELECT plan FROM agencies WHERE id = @id', { id: agencyId });
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' });

    const agencyPlanLevel = PLAN_ORDER[agency.plan] || 1;

    let query = `
      SELECT * FROM automation_templates
      WHERE is_active = 1
    `;
    const params = {};
    if (category) {
      query += ' AND category = @category';
      params.category = category;
    }
    query += ' ORDER BY is_featured DESC, installs DESC';

    const templates = all(query, params);

    const agencyAutomations = all(
      'SELECT name FROM automations WHERE agency_id = @aid',
      { aid: agencyId }
    );
    const installedNames = new Set(agencyAutomations.map(a => a.name));

    const templatesWithAccess = templates.map(t => {
      const requires = JSON.parse(t.requires || '[]');
      return {
        ...t,
        requires: Array.isArray(requires) ? requires : [],
        conditions: JSON.parse(t.conditions || '[]'),
        actions: JSON.parse(t.actions || '[]'),
        trigger_config: JSON.parse(t.trigger_config || '{}'),
        can_install: (PLAN_ORDER[t.min_plan] || 1) <= agencyPlanLevel,
        already_installed: installedNames.has(t.name),
      };
    });

    res.json(templatesWithAccess);
  } catch (error) {
    console.error('[TEMPLATES] Error listing:', error.message);
    res.status(500).json({ error: 'Error al listar plantillas' });
  }
});

router.post('/:id/install', (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    const templateId = req.params.id;

    const template = get(
      'SELECT * FROM automation_templates WHERE id = @id AND is_active = 1',
      { id: templateId }
    );
    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    const existing = get(
      'SELECT id FROM automations WHERE agency_id = @aid AND name = @name',
      { aid: agencyId, name: template.name }
    );
    if (existing) {
      return res.status(409).json({ error: 'Ya tienes esta plantilla instalada' });
    }

    const automationId = uuidv4();
    run(
      `INSERT INTO automations (id, agency_id, name, description, is_active,
        trigger_type, trigger_event, trigger_config, conditions, actions, run_count, created_at)
       VALUES (@id, @agency_id, @name, @description, 0,
        @trigger_type, @trigger_type, @trigger_config, @conditions, @actions, 0, datetime('now'))`,
      {
        id: automationId,
        agency_id: agencyId,
        name: template.name,
        description: template.description,
        trigger_type: template.trigger_type,
        trigger_config: template.trigger_config,
        conditions: template.conditions,
        actions: template.actions,
      }
    );

    run('UPDATE automation_templates SET installs = installs + 1 WHERE id = @id', { id: templateId });

    console.log(`[TEMPLATES] Installed "${template.name}" for agency ${agencyId}`);

    res.json({ automation_id: automationId, name: template.name });
  } catch (error) {
    console.error('[TEMPLATES] Error installing:', error.message);
    res.status(500).json({ error: 'Error al instalar plantilla' });
  }
});

router.get('/categories', (req, res) => {
  const categories = all(
    'SELECT category, COUNT(*) as count FROM automation_templates WHERE is_active = 1 GROUP BY category ORDER BY count DESC'
  );
  res.json(categories);
});

export default router;
