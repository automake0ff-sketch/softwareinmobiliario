import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { defaultQueue } from '../services/queue.js';
import { realtime } from '../services/realtime.js';
import { PLANS } from '../services/plans.js';

async function checkAgencyMetaAds(agencyId) {
  const agency = await get('SELECT plan, plan_status FROM agencies WHERE id = @aid', { aid: agencyId })
  if (!agency || agency.plan_status !== 'active') return false
  const plan = PLANS[agency.plan]
  if (!plan) return false
  return plan.features?.meta_ads === true
}

const router = Router();

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'inmobiliaria_webhook_2024';
const META_APP_SECRET = process.env.META_APP_SECRET;

// Misma lógica que en server/webhooks/whatsapp.js: valida que el POST venga
// realmente de Meta comprobando el HMAC-SHA256 sobre el body crudo.
// Si META_APP_SECRET no está configurado, se deja pasar (comportamiento previo)
// pero se avisa por log, para no romper despliegues que aún no lo tengan seteado.
function verifySignature(req) {
  if (!META_APP_SECRET) {
    console.warn('[META] META_APP_SECRET no configurado — firma del webhook sin verificar.');
    return true;
  }
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(rawBody).digest('hex');
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function parseBody(req) {
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
  }
  return req.body || {};
}

router.get('/', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[META] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Verification failed.');
});

router.post('/', async (req, res) => {
  try {
    if (!verifySignature(req)) {
      console.warn('[META] Invalid signature');
      return res.status(401).send('Invalid signature');
    }
    res.status(200).send('EVENT_RECEIVED');
    const body = parseBody(req);
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

    let agency = null;
    if (pageId) {
      agency = await get('SELECT id, name FROM agencies WHERE meta_page_id = @pid', { pid: String(pageId) });
    }
    if (!agency) {
      console.log(`[META] No agency found for page_id: ${pageId}. Lead discarded.`);
      return;
    }

    if (!(await checkAgencyMetaAds(agency.id))) {
      console.log(`[META] Agency ${agency.id} (${agency.name}) does not have meta_ads feature. Lead discarded.`);
      return;
    }

    const existingLead = email ? await get('SELECT id FROM leads WHERE email = @email', { email }) : null;
    if (existingLead) {
      await run("UPDATE leads SET last_activity = NOW(), updated_at = NOW() WHERE id = @id", { id: existingLead.id });
      await run(
        `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
         VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, NOW())`,
        {
          id: uuidv4(), agency_id: agency.id, lead_id: existingLead.id,
          type: 'webhook',
          description: 'Lead actualizado desde Meta Ads',
          metadata: JSON.stringify({ adName, adsetName, campaignName, pageId }),
        }
      );
      return;
    }

    const leadId = uuidv4();
    await run(
      `INSERT INTO leads (id, agency_id, name, phone, email, budget, zone, property_interest, source, status, created_at, updated_at)
       VALUES (@id, @agency_id, @name, @phone, @email, @budget, @zone, @property_interest, @source, @status, NOW(), NOW())`,
      {
        id: leadId, agency_id: agency.id, name, phone, email, budget,
        zone: city, property_interest: propertyType, source: 'meta_ads', status: 'nuevo',
      }
    );

    const utmId = uuidv4();
    await run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, NOW())`,
      {
        id: utmId, agency_id: agency.id, lead_id: leadId, type: 'utm_data',
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
      await run(
        `INSERT INTO conversations (id, agency_id, lead_id, channel, created_at)
         VALUES (@id, @agency_id, @lead_id, @channel, NOW())`,
        { id: convId, agency_id: agency.id, lead_id: leadId, channel: 'web' }
      );
      await run(
        `INSERT INTO messages (id, conversation_id, author, content, message_type, is_read, created_at)
         VALUES (@id, @conversation_id, 'lead', @content, 'text', false, NOW())`,
        { id: uuidv4(), conversation_id: convId, content: message }
      );
    }

    await run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, NOW())`,
      {
        id: uuidv4(), agency_id: agency.id, lead_id: leadId,
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
      agencyId: agency.id,
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
