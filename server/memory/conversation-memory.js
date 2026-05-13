import { all, get } from '../db/db.js';

export function buildConversationContext(leadId, maxMessages = 20) {
  const conversation = get('SELECT * FROM conversations WHERE lead_id = @lid ORDER BY created_at DESC LIMIT 1', { lid: leadId });
  if (!conversation) return [];

  let messages = [];
  try { messages = JSON.parse(conversation.messages || '[]'); } catch { messages = []; }

  const recent = messages.slice(-maxMessages).map((msg, i) => ({
    role: msg.role === 'lead' ? 'user' : 'assistant',
    content: typeof msg.content === 'string' ? msg.content : '',
    timestamp: msg.timestamp || msg.created_at || new Date().toISOString(),
    sender_type: msg.role === 'lead' ? 'lead' : msg.role === 'agent' ? 'ia' : 'user',
  }));

  return recent;
}

export function toClaudeMessages(conversationMessages) {
  const consolidated = [];

  for (const msg of conversationMessages) {
    const last = consolidated[consolidated.length - 1];
    if (last && last.role === msg.role) {
      last.content += '\n' + msg.content;
    } else {
      consolidated.push({ role: msg.role, content: msg.content });
    }
  }

  if (consolidated.length > 0 && consolidated[0].role === 'assistant') {
    consolidated.unshift({ role: 'user', content: '[Inicio de conversación]' });
  }

  return consolidated;
}
