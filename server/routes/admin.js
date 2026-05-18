import { Router } from 'express';
import { all, get } from '../db/db.js';
import { auth, requireRole } from '../middleware/auth.js';

const PLAN_ORDER = { starter: 1, profesional: 2, agencia: 3, enterprise: 4 };

// ── Helper: calcular MRR aproximado ──
function calculateMRR() {
  const agencies = all('SELECT plan, plan_status FROM agencies WHERE plan_status IN (\'active\', \'trialing\')')
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

router.get('/metrics', (req, res) => {
  try {
    const totalAgencies = get('SELECT COUNT(*) as count FROM agencies').count;
    const activeAgencies = get("SELECT COUNT(*) as count FROM agencies WHERE plan_status = 'active'").count;
    const trialAgencies = get("SELECT COUNT(*) as count FROM agencies WHERE plan_status = 'trialing'").count;
    const canceledAgencies = get("SELECT COUNT(*) as count FROM agencies WHERE plan_status = 'canceled'").count;
    const newThisWeek = get("SELECT COUNT(*) as count FROM agencies WHERE created_at >= datetime('now', '-7 days')").count;

    const planStarter = get("SELECT COUNT(*) as count FROM agencies WHERE plan = 'starter'").count;
    const planProfesional = get("SELECT COUNT(*) as count FROM agencies WHERE plan = 'profesional'").count;
    const planAgencia = get("SELECT COUNT(*) as count FROM agencies WHERE plan = 'agencia'").count;
    const planEnterprise = get("SELECT COUNT(*) as count FROM agencies WHERE plan = 'enterprise'").count;

    const leadsToday = get("SELECT COUNT(*) as count FROM leads WHERE created_at >= datetime('now', 'start of day')").count;
    const leadsTotal = get('SELECT COUNT(*) as count FROM leads').count;
    const propertiesTotal = get('SELECT COUNT(*) as count FROM properties').count;

    const aiActionsToday = get("SELECT COUNT(*) as count FROM activities WHERE type = 'ia_response' AND created_at >= datetime('now', 'start of day')").count;
    const automationsToday = get("SELECT COUNT(*) as count FROM automation_logs WHERE created_at >= datetime('now', 'start of day')").count;

    const conversationsToday = get("SELECT COUNT(*) as count FROM conversations WHERE created_at >= datetime('now', 'start of day')").count;

    const usersTotal = get('SELECT COUNT(*) as count FROM users WHERE role != \'ia_agent\'').count;
    const comercialTotal = get("SELECT COUNT(*) as count FROM users WHERE role = 'comercial'").count;

    const topTemplates = all(
      'SELECT name, installs FROM automation_templates ORDER BY installs DESC LIMIT 10'
    );

    const mrr = calculateMRR();

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

router.get('/agencies', (req, res) => {
  try {
    const agencies = all(`
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
