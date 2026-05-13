import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { defaultQueue } from '../services/queue.js';
import { realtime } from '../services/realtime.js';

const router = Router();

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'inmobiliaria_webhook_2024';

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[META] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Verification failed.');
});

router.post('/', (req, res) => {
  try {
    res.status(200).send('EVENT_RECEIVED');
    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'leads') {
          processMetaLead(change.value, entry.id);
        }
      }
    }
  } catch (error) {
    console.error('[META] Webhook error:', error.message);
  }
});

async function processMetaLead(leadData, pageId) {
  try {
    const fieldData = {};
    for (const field of leadData.field_data || []) {
      fieldData[field.name] = field.values?.[0] || '';
    }

    const name = fieldData.full_name || fieldData.name || 'Lead Meta';
    const phone = fieldData.phone_number || fieldData.phone || '';
    const email = fieldData.email || '';
    const city = fieldData.city || fieldData.ciudad || '';
    const budget = parseFloat(fieldData.budget || fieldData.presupuesto || 0) || null;
    const propertyType = fieldData.property_type || fieldData.tipo_propiedad || '';
    const message = fieldData.message || fieldData.mensaje || '';
    const adName = fieldData.ad_name || leadData.ad_name || '';
    const adsetName = fieldData.adset_name || leadData.adset_name || '';
    const campaignName = fieldData.campaign_name || leadData.campaign_name || '';

    const firstAgency = get('SELECT id FROM agencies LIMIT 1');
    if (!firstAgency) {
      console.log('[META] No agency found');
      return;
    }

    const existingLead = email ? get('SELECT id FROM leads WHERE email = @email', { email }) : null;
    if (existingLead) {
      run("UPDATE leads SET last_activity = datetime('now'), updated_at = datetime('now') WHERE id = @id", { id: existingLead.id });
      run(
        `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
         VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, datetime('now'))`,
        {
          id: uuidv4(), agency_id: firstAgency.id, lead_id: existingLead.id,
          type: 'webhook',
          description: 'Lead actualizado desde Meta Ads',
          metadata: JSON.stringify({ adName, adsetName, campaignName, pageId }),
        }
      );
      return;
    }

    const leadId = uuidv4();
    run(
      `INSERT INTO leads (id, agency_id, name, phone, email, budget, zone, property_interest, source, status, created_at, updated_at)
       VALUES (@id, @agency_id, @name, @phone, @email, @budget, @zone, @property_interest, @source, @status, datetime('now'), datetime('now'))`,
      {
        id: leadId, agency_id: firstAgency.id, name, phone, email, budget,
        zone: city, property_interest: propertyType, source: 'meta_ads', status: 'nuevo',
      }
    );

    const utmId = uuidv4();
    run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, datetime('now'))`,
      {
        id: utmId, agency_id: firstAgency.id, lead_id: leadId, type: 'utm_data',
        description: 'UTM data from Meta Ads',
        metadata: JSON.stringify({
          utm_source: 'meta',
          utm_medium: 'ads',
          utm_campaign: campaignName,
          utm_content: adName,
          utm_term: adsetName,
          adName,
          adsetName,
          campaignName,
          pageId,
        }),
      }
    );

    if (message) {
      const convId = uuidv4();
      const msgs = [{ role: 'lead', content: message, timestamp: new Date().toISOString() }];
      run(
        `INSERT INTO conversations (id, lead_id, channel, messages, created_at)
         VALUES (@id, @lead_id, @channel, @messages, datetime('now'))`,
        { id: convId, lead_id: leadId, channel: 'web', messages: JSON.stringify(msgs) }
      );
    }

    run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, datetime('now'))`,
      {
        id: uuidv4(), agency_id: firstAgency.id, lead_id: leadId,
        type: 'webhook',
        description: `Nuevo lead importado desde Meta Ads: ${name}`,
        metadata: JSON.stringify({ adName, adsetName, campaignName, fieldData }),
      }
    );

    if (realtime) {
      realtime.broadcastActivity({
        type: 'new_meta_lead',
        leadId,
        leadName: name,
        description: `Nuevo lead desde Meta Ads: ${name}`,
        campaign: campaignName,
        phone,
        email,
      });
    }

    defaultQueue.add('process_new_lead', {
      leadId,
      agencyId: firstAgency.id,
      source: 'meta_ads',
      utm: { utm_source: 'meta', utm_medium: 'ads', utm_campaign: campaignName },
      adName,
      adsetName,
      campaignName,
    });

    console.log(`[META] Lead creado: ${name} (${leadId}) - Campaña: ${campaignName}`);
  } catch (error) {
    console.error('[META] Error processing lead:', error.message);
  }
}

export default router;
