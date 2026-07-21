import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { checkLimit } from '../services/plan-checker.js';
import { safeJsonParse } from '../lib/safe-json.js';

// Auto-run schema migrations for automations table
try {
  await run('ALTER TABLE automations ADD COLUMN IF NOT EXISTS template_id TEXT');
} catch (e) {
  // Column already exists
}

const router = Router();
router.use(auth);

const PLAN_ORDER = { starter: 1, profesional: 2, agencia: 3, enterprise: 4 };

const REQUIRES_ICONS = {
  whatsapp: '💬', email: '📧', slack: '💜',
  telegram: '✈️', notion: '📓', airtable: '🗃️',
  sheets: '📊', webhook: '🔗',
};

router.get('/', async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    const category = req.query.category;

    const agency = await get('SELECT plan FROM agencies WHERE id = @id', { id: agencyId });
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' });

    const agencyPlanLevel = PLAN_ORDER[agency.plan] || 1;

    let query = `
      SELECT * FROM automation_templates
      WHERE is_active = true
    `;
    const params = {};
    if (category) {
      query += ' AND category = @category';
      params.category = category;
    }
    query += ' ORDER BY is_featured DESC, installs DESC';

    const templates = await all(query, params);

    const agencyAutomations = await all(
      'SELECT template_id FROM automations WHERE agency_id = @aid AND template_id IS NOT NULL',
      { aid: agencyId }
    );
    const installedTemplateIds = new Set(agencyAutomations.map(a => a.template_id));

    const templatesWithAccess = templates.map(t => {
      const requires = safeJsonParse(t.requires || '[]');
      return {
        ...t,
        requires: Array.isArray(requires) ? requires : [],
        conditions: safeJsonParse(t.conditions || '[]'),
        actions: safeJsonParse(t.actions || '[]'),
        trigger_config: safeJsonParse(t.trigger_config || '{}'),
        can_install: (PLAN_ORDER[t.min_plan] || 1) <= agencyPlanLevel,
        already_installed: installedTemplateIds.has(t.id),
      };
    });

    res.json(templatesWithAccess);
  } catch (error) {
    console.error('[TEMPLATES] Error listing:', error.message);
    res.status(500).json({ error: 'Error al listar plantillas' });
  }
});

router.post('/:id/install', checkLimit('automations'), async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    const templateId = req.params.id;

    // 1. Carga la plantilla de automation_templates
    const template = await get(
      'SELECT * FROM automation_templates WHERE id = @id AND is_active = true',
      { id: templateId }
    );
    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    // 2. Verifica que el plan de la agencia permite esta plantilla (comparar min_plan con plan actual)
    const agency = await get('SELECT plan FROM agencies WHERE id = @id', { id: agencyId });
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' });

    const agencyPlanLevel = PLAN_ORDER[agency.plan] || 1;
    const templateMinPlanLevel = PLAN_ORDER[template.min_plan] || 1;

    if (agencyPlanLevel < templateMinPlanLevel) {
      return res.status(402).json({
        error: `Esta plantilla requiere el plan ${template.min_plan}. Tu plan actual es ${agency.plan}.`,
        code: 'PLAN_UPGRADE_REQUIRED',
        current_plan: agency.plan,
        upgrade_to: template.min_plan,
      });
    }

    // 3. Comprueba si ya está instalada (busca en automations WHERE template_id=X AND agency_id=Y)
    const existing = await get(
      'SELECT id FROM automations WHERE agency_id = @aid AND template_id = @template_id',
      { aid: agencyId, template_id: templateId }
    );
    if (existing) {
      return res.status(409).json({ error: 'Ya tienes esta plantilla instalada' });
    }

    // 4. Si no está instalada, hace INSERT en automations con is_active=false y template_id referenciando la plantilla
    const automationId = uuidv4();
    await run(
      `INSERT INTO automations (id, agency_id, name, description, is_active, active,
        trigger_type, trigger_event, trigger_config, conditions, actions, run_count, created_at, template_id)
       VALUES (@id, @agency_id, @name, @description, 0, 0,
        @trigger_type, @trigger_type, @trigger_config, @conditions, @actions, 0, NOW(), @template_id)`,
      {
        id: automationId,
        agency_id: agencyId,
        name: template.name,
        description: template.description,
        trigger_type: template.trigger_type,
        trigger_config: template.trigger_config,
        conditions: template.conditions,
        actions: template.actions,
        template_id: templateId,
      }
    );

    // 5. Incrementa automation_templates.installs en +1
    await run('UPDATE automation_templates SET installs = installs + 1 WHERE id = @id', { id: templateId });

    console.log(`[TEMPLATES] Installed template "${template.name}" (ID: ${templateId}) for agency ${agencyId}`);

    // 6. Devuelve {ok: true, automation_id, name: template.name, message: 'Instalada correctamente'}
    res.json({
      ok: true,
      automation_id: automationId,
      name: template.name,
      message: 'Instalada correctamente'
    });
  } catch (error) {
    console.error('[TEMPLATES] Error installing:', error.message);
    res.status(500).json({ error: 'Error al instalar plantilla' });
  }
});

router.get('/categories', async (req, res) => {
  const categories = await all(
    'SELECT category, COUNT(*) as count FROM automation_templates WHERE is_active = true GROUP BY category ORDER BY count DESC'
  );
  res.json(categories);
});

export default router;

