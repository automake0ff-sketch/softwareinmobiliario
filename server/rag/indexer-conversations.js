import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { generateEmbedding, prepareTextForEmbedding } from '../services/rag.js';

export async function indexSuccessfulConversation(leadId, outcome) {
  const conversation = get('SELECT * FROM conversations WHERE lead_id = @lid ORDER BY created_at DESC LIMIT 1', { lid: leadId });
  if (!conversation) return null;

  let messages = [];
  try {
    messages = JSON.parse(conversation.messages || '[]');
  } catch {
    messages = [];
  }

  if (!messages.length) return null;

  const relevantMessages = messages.slice(-10);
  const content = relevantMessages
    .map(m => `${m.role === 'lead' ? 'Lead' : 'IA'}: ${m.content}`)
    .join('\n');

  const context = await identifyConversationContext(content);
  const embeddingContent = prepareTextForEmbedding(`${context}\n${content}`);
  const embedding = await generateEmbedding(embeddingContent);

  const lead = get('SELECT agency_id FROM leads WHERE id = @lid', { lid: leadId });
  if (!lead) return null;

  run(
    `INSERT INTO successful_conversation_embeddings (id, agency_id, lead_id, content, context, outcome, embedding, metadata, created_at)
     VALUES (@id, @aid, @lid, @content, @context, @outcome, @embedding, @metadata, datetime('now'))`,
    {
      id: uuidv4(),
      aid: lead.agency_id,
      lid: leadId,
      content,
      context,
      outcome,
      embedding: JSON.stringify(embedding),
      metadata: JSON.stringify({ outcome, indexedAt: new Date().toISOString() }),
    }
  );

  return { leadId, indexed: true, context, outcome };
}

async function identifyConversationContext(conversation) {
  if (conversation.toLowerCase().includes('precio') || conversation.toLowerCase().includes('caro') || conversation.toLowerCase().includes('barato')) {
    return 'objeción de precio';
  }
  if (conversation.toLowerCase().includes('zona') || conversation.toLowerCase().includes('barrio')) {
    return 'duda de zona';
  }
  if (conversation.toLowerCase().includes('pensar') || conversation.toLowerCase().includes('decidir') || conversation.toLowerCase().includes('duda')) {
    return 'indecisión';
  }
  if (conversation.toLowerCase().includes('olvid') || conversation.toLowerCase().includes('perdí') || conversation.toLowerCase().includes('recuerdas')) {
    return 'reactivación';
  }
  if (conversation.toLowerCase().includes('primera') || conversation.toLowerCase().includes('hola') || conversation.toLowerCase().includes('busco')) {
    return 'primera toma de contacto';
  }
  if (conversation.toLowerCase().includes('visit') || conversation.toLowerCase().includes('ver') || conversation.toLowerCase().includes('cita')) {
    return 'agendar visita';
  }
  if (conversation.toLowerCase().includes('gracias') || conversation.toLowerCase().includes('compro') || conversation.toLowerCase().includes('reserv')) {
    return 'cierre positivo';
  }
  return 'consulta general';
}
