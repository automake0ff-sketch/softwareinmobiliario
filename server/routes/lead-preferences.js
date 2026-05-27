import { Router } from 'express';
import { get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/:leadId/preferences', (req, res) => {
  try {
    const { leadId } = req.params;
    const agencyId = req.user.agency_id;

    const lead = get('SELECT id FROM leads WHERE id = @id AND agency_id = @aid', { id: leadId, aid: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    let prefs = get('SELECT * FROM lead_preferences WHERE lead_id = @lid', { lid: leadId });
    if (!prefs) {
      run(
        `INSERT INTO lead_preferences (lead_id, preferred_channel, consent_email, consent_whatsapp, consent_calls)
         VALUES (@lid, 'whatsapp', 1, 1, 0)`,
        { lid: leadId }
      );
      prefs = get('SELECT * FROM lead_preferences WHERE lead_id = @lid', { lid: leadId });
    }

    res.json(prefs);
  } catch (error) {
    console.error('Error getting lead preferences:', error);
    res.status(500).json({ error: 'Error al obtener preferencias del lead' });
  }
});

router.patch('/:leadId/preferences', (req, res) => {
  try {
    const { leadId } = req.params;
    const agencyId = req.user.agency_id;

    const lead = get('SELECT id FROM leads WHERE id = @id AND agency_id = @aid', { id: leadId, aid: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const allowed = ['preferred_channel', 'preferred_time', 'consent_email', 'consent_whatsapp', 'consent_calls', 'notes'];
    const updates = [];
    const params = { lid: leadId };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = @${field}`);
        params[field] = req.body[field];
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    run(
      `INSERT INTO lead_preferences (lead_id, preferred_channel, consent_email, consent_whatsapp, consent_calls)
       VALUES (@lid, 'whatsapp', 1, 1, 0)
       ON CONFLICT(lead_id) DO UPDATE SET ${updates.join(', ')}`,
      params
    );

    const prefs = get('SELECT * FROM lead_preferences WHERE lead_id = @lid', { lid: leadId });
    res.json(prefs);
  } catch (error) {
    console.error('Error updating lead preferences:', error);
    res.status(500).json({ error: 'Error al actualizar preferencias del lead' });
  }
});

export default router;
