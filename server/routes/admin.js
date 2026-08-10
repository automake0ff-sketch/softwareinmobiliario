import { Router } from 'express';
import { all, get } from '../db/db.js';
import { auth, requireRole } from '../middleware/auth.js';

const PLAN_ORDER = { starter: 1, profesional: 2, agencia: 3, enterprise: 4 };

// ── Helper: calcular MRR aproximado ──
async function calculateMRR() {
  const agencies = await all('SELECT plan, plan_status FROM agencies WHERE plan_status IN (\'active\', \'trialing\')')
  const PRICES = { starter: 79, profesional: 199, agencia: 499, enterprise: 999 }
  let mrr = 0
  for (const a of agencies) {
    if (a.plan_status === 'active') {
      mrr += PRICES[a.plan] || 0
    }
  }
  return mrr
}

const router = Router();
router.use(auth);
router.use(requireRole('admin', 'super_admin'));

router.get('/metrics', async (req, res) => {
  try {
    const totalAgencies = (await get('SELECT COUNT(*) as count FROM agencies')).count;
    const activeAgencies = (await get("SELECT COUNT(*) as count FROM agencies WHERE plan_status = 'active'")).count;
    const trialAgencies = (await get("SELECT COUNT(*) as count FROM agencies WHERE plan_status = 'trialing'")).count;
    const canceledAgencies = (await get("SELECT COUNT(*) as count FROM agencies WHERE plan_status = 'canceled'")).count;
    const newThisWeek = (await get("SELECT COUNT(*) as count FROM agencies WHERE created_at >= NOW() - INTERVAL '7 days'")).count;

    const planStarter = (await get("SELECT COUNT(*) as count FROM agencies WHERE plan = 'starter'")).count;
    const planProfesional = (await get("SELECT COUNT(*) as count FROM agencies WHERE plan = 'profesional'")).count;
    const planAgencia = (await get("SELECT COUNT(*) as count FROM agencies WHERE plan = 'agencia'")).count;
    const planEnterprise = (await get("SELECT COUNT(*) as count FROM agencies WHERE plan = 'enterprise'")).count;

    const leadsToday = (await get("SELECT COUNT(*) as count FROM leads WHERE created_at >= DATE_TRUNC('day', NOW())")).count;
    const leadsTotal = (await get('SELECT COUNT(*) as count FROM leads')).count;
    const propertiesTotal = (await get('SELECT COUNT(*) as count FROM properties')).count;

    const aiActionsToday = (await get("SELECT COUNT(*) as count FROM activities WHERE type = 'ia_response' AND created_at >= DATE_TRUNC('day', NOW())")).count;
    const automationsToday = (await get("SELECT COUNT(*) as count FROM automation_logs WHERE created_at >= DATE_TRUNC('day', NOW())")).count;

    const conversationsToday = (await get("SELECT COUNT(*) as count FROM conversations WHERE created_at >= DATE_TRUNC('day', NOW())")).count;

    const usersTotal = (await get('SELECT COUNT(*) as count FROM users WHERE role != \'ia_agent\'')).count;
    const comercialTotal = (await get("SELECT COUNT(*) as count FROM users WHERE role = 'comercial'")).count;

    const topTemplates = await all(
      'SELECT name, installs FROM automation_templates ORDER BY installs DESC LIMIT 10'
    );

    const mrr = await calculateMRR();

    res.json({
      totalAgencies,
      activeAgencies,
      trialAgencies,
      canceledAgencies,
      newThisWeek,
      planStarter,
      planProfesional,
      planAgencia,
      planEnterprise,
      mrr,
      leadsToday,
      leadsTotal,
      propertiesTotal,
      aiActionsToday,
      automationsToday,
      conversationsToday,
      usersTotal,
      comercialTotal,
      topTemplates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ADMIN] Error getting metrics:', error.message);
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
});

router.get('/agencies', async (req, res) => {
  try {
    const agencies = await all(`
      SELECT a.id, a.name, a.slug, a.plan, a.plan_status, a.city, a.email, a.phone,
             a.onboarding_completed, a.onboarding_step, a.created_at, a.timezone,
             (SELECT COUNT(*) FROM users u WHERE u.agency_id = a.id) as user_count,
             (SELECT COUNT(*) FROM leads l WHERE l.agency_id = a.id) as lead_count,
             (SELECT COUNT(*) FROM properties p WHERE p.agency_id = a.id) as property_count
      FROM agencies a
      ORDER BY a.created_at DESC
    `);
    res.json(agencies);
  } catch (error) {
    console.error('[ADMIN] Error listing agencies:', error.message);
    res.status(500).json({ error: 'Error al listar agencias' });
  }
});

export default router;
