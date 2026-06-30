import { Router } from 'express';
import crypto from 'crypto';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { defaultQueue } from '../services/queue.js';
import { realtime } from '../services/realtime.js';

const router = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'whatsapp_inmo_verify';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const WHATSAPP_API_VERSION = 'v18.0';
const GRAPH_API_BASE = 'graph.facebook.com';

class WhatsAppClient {
  constructor() {
    this.isConfigured = !!(META_ACCESS_TOKEN && META_PHONE_NUMBER_ID);
  }

  _request(payload) {
    return new Promise((resolve) => {
      if (!this.isConfigured) {
        console.log('[WHATSAPP MOCK]', JSON.stringify(payload).substring(0, 200));
        return resolve({ mock: true, messageId: `mock_${Date.now()}` });
      }
      const data = JSON.stringify(payload);
      const options = {
        hostname: GRAPH_API_BASE,
        path: `/${WHATSAPP_API_VERSION}/${META_PHONE_NUMBER_ID}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        },
      };
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); }
        });
      });
      req.on('error', (e) => {
        console.error('[WHATSAPP] Request error:', e.message);
        resolve({ error: e.message });
      });
      req.write(data);
      req.end();
    });
  }

  async sendText(to, body) {
    return this._request({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body },
    });
  }

  async sendTemplate(to, templateName, params) {
    return this._request({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'es' },
        components: params ? [{
          type: 'body',
          parameters: params.map((p) => ({ type: 'text', text: p })),
        }] : [],
      },
    });
  }

  async markAsRead(messageId) {
    return this._request({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  async sendMedia(to, type, url) {
    return this._request({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type,
      [type]: { link: url },
    });
  }

  async sendInteractiveButtons(to, header, body, buttons) {
    return this._request({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: header ? { type: 'text', text: header } : undefined,
        body: { text: body },
        action: {
          buttons: buttons.map((b, i) => ({
            type: 'reply',
            reply: { id: b.id || `btn_${i}`, title: b.title.substring(0, 20) },
          })),
        },
      },
    });
  }

  async sendInteractiveList(to, header, body, sections) {
    return this._request({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: header ? { type: 'text', text: header } : undefined,
        body: { text: body },
        footer: { text: 'CRM Inmobiliario IA' },
        action: {
          button: 'Ver opciones',
          sections: sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.substring(0, 24),
              description: r.description ? r.description.substring(0, 72) : undefined,
            })),
          })),
        },
      },
    });
  }
}

const waClient = new WhatsAppClient();

const MESSAGE_TEMPLATES = {
  welcome: 'welcome',
  visit_confirmation: 'visit_confirmation',
  visit_reminder_24h: 'visit_reminder_24h',
  follow_up: 'follow_up',
  document_request: 'document_request',
};

function verifySignature(req) {
  if (!META_APP_SECRET) return true;
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(JSON.stringify(req.body)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WHATSAPP] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Verification failed.');
});

router.post('/', (req, res) => {
  try {
    if (!verifySignature(req)) {
      console.warn('[WHATSAPP] Invalid signature');
      return res.status(401).send('Invalid signature');
    }
    res.status(200).send('EVENT_RECEIVED');
    waClient.markAsRead(req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id);

    for (const entry of req.body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.value?.messages) {
          for (const message of change.value.messages) {
            handleIncomingMessage(message, change.value.metadata, change.value.contacts);
          }
        }
      }
    }
  } catch (error) {
    console.error('[WHATSAPP] Webhook error:', error.message);
  }
});

async function handleIncomingMessage(message, metadata, contacts) {
  try {
    const from = message.from;
    const msgType = message.type;
    let text = '';
    let mediaUrl = null;

    if (msgType === 'text') {
      text = message.text?.body || '';
    } else if (msgType === 'interactive') {
      const interactive = message.interactive;
      text = interactive?.button_reply?.title || interactive?.list_reply?.title || '';
    } else if (msgType === 'audio') {
      text = '[Audio]';
      mediaUrl = message.audio?.id;
    } else if (msgType === 'image') {
      text = '[Imagen]';
      mediaUrl = message.image?.id;
    } else if (msgType === 'document') {
      text = '[Documento]';
      mediaUrl = message.document?.id;
    }

    const contactName = contacts?.[0]?.profile?.name || from;
    const phoneNumber = from;

    let existingLead = get('SELECT * FROM leads WHERE phone = @phone', { phone: phoneNumber });

    const phoneNumberId = metadata?.phone_number_id;
    const displayPhoneNumber = metadata?.display_phone_number;
    let agency = null;
    if (phoneNumberId) {
      agency = get('SELECT id, name FROM agencies WHERE whatsapp_phone_id = @pid', { pid: String(phoneNumberId) });
    }
    if (!agency && displayPhoneNumber) {
      agency = get('SELECT id, name FROM agencies WHERE whatsapp_number = @wnum', { wnum: displayPhoneNumber });
    }
    if (!agency) {
      console.log('[WHATSAPP] No agency found for phone_number_id:', phoneNumberId, '/ number:', displayPhoneNumber);
      return;
    }

    let leadId;
    if (existingLead) {
      leadId = existingLead.id;
      run("UPDATE leads SET last_activity = NOW(), updated_at = NOW() WHERE id = @id", { id: leadId });
    } else {
      leadId = uuidv4();
      run(
        `INSERT INTO leads (id, agency_id, name, phone, source, status, created_at, updated_at)
         VALUES (@id, @agency_id, @name, @phone, @source, @status, NOW(), NOW())`,
        { id: leadId, agency_id: agency.id, name: contactName, phone: phoneNumber, source: 'whatsapp', status: 'nuevo' }
      );
      existingLead = get('SELECT * FROM leads WHERE id = @id', { id: leadId });
    }

    const messageId = uuidv4();
    const newMessage = { role: 'lead', content: text, timestamp: new Date().toISOString(), message_id: message.id };

    let existingConv = get(
      'SELECT id, messages FROM conversations WHERE lead_id = @lead_id AND channel = \'whatsapp\' ORDER BY created_at DESC LIMIT 1',
      { lead_id: leadId }
    );

    if (existingConv) {
      const msgs = JSON.parse(existingConv.messages || '[]');
      msgs.push(newMessage);
      run(
        `UPDATE conversations SET messages = @messages WHERE id = @id`,
        { messages: JSON.stringify(msgs), id: existingConv.id }
      );
    } else {
      existingConv = { id: uuidv4() };
      run(
        `INSERT INTO conversations (id, agency_id, lead_id, channel, messages, created_at)
         VALUES (@id, @agency_id, @lead_id, @channel, @messages, NOW())`,
        { id: existingConv.id, agency_id: agency.id, lead_id: leadId, channel: 'whatsapp', messages: JSON.stringify([newMessage]) }
      );
    }

    const mappedType = ({ text: 'text', interactive: 'text', audio: 'audio', image: 'image', document: 'document' })[msgType] || 'text';
    run(
      `INSERT INTO messages (id, conversation_id, author, content, message_type, created_at)
       VALUES (@id, @conversation_id, @author, @content, @message_type, NOW())`,
      {
        id: messageId,
        conversation_id: existingConv.id,
        author: 'lead',
        content: text,
        message_type: mappedType,
      }
    );

    const activityType = existingLead ? 'whatsapp_message' : 'whatsapp_lead';
    const activityDesc = existingLead
      ? `Mensaje de WhatsApp recibido: "${text.substring(0, 100)}"`
      : `Nuevo lead creado desde WhatsApp: ${contactName}`;
    run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, NOW())`,
      {
        id: uuidv4(), agency_id: agency.id, lead_id: leadId, type: activityType,
        description: activityDesc,
        metadata: JSON.stringify({ from: phoneNumber, message_id: message.id, type: msgType }),
      }
    );

    if (realtime) {
      realtime.broadcast('message', {
        conversation_id: existingConv.id,
        message: {
          id: messageId,
          role: 'lead',
          sender_type: 'lead',
          content: text,
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }
      });
      realtime.broadcastActivity({
        type: activityType,
        leadId,
        leadName: contactName,
        description: activityDesc,
        phone: phoneNumber,
        message: text,
      });
    }

    defaultQueue.add('process_message', {
      leadId,
      messageId: message.id,
      messageBody: text,
      messageType: msgType,
      mediaUrl,
      phoneNumber,
      conversationId: existingConv.id,
      agencyId: agency.id,
    });

    console.log(`[WHATSAPP] ${existingLead ? 'Message from' : 'New lead'} ${contactName} (${phoneNumber}): ${text.substring(0, 60)}`);
  } catch (error) {
    console.error('[WHATSAPP] Error processing message:', error.message);
  }
}

export default router;
export { WhatsAppClient, waClient, MESSAGE_TEMPLATES };
