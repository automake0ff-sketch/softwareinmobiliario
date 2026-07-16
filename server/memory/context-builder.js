import { get } from '../db/db.js';
import { getLeadMemory, memoryToContext } from './lead-memory.js';
import { buildConversationContext, toClaudeMessages } from './conversation-memory.js';
import { getAgentSystemPrompt } from '../agents/index.js';

export async function buildAgentContext(leadId, agentType) {
  const lead = await get('SELECT * FROM leads WHERE id = @id', { id: leadId });
  if (!lead) return null;

  const agency = await get('SELECT * FROM agencies WHERE id = @id', { id: lead.agency_id });

  const memory = await getLeadMemory(leadId);
  const conversation = await buildConversationContext(leadId);

  const basePrompt = await getAgentSystemPrompt(agentType);
  const memorySection = memoryToContext(memory);

  const systemPrompt = `
${basePrompt}

---
${memorySection}

---
## INFORMACIÓN DEL SISTEMA
- Agencia: ${agency?.name || 'No especificada'}
- Fecha actual: ${new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Hora: ${new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' })}
`.trim();

  const messages = conversation.length > 0
    ? toClaudeMessages(conversation)
    : [{ role: 'user', content: `Iniciando conversación con ${memory?.name || 'lead'}.` }];

  return { systemPrompt, messages, lead, memory };
}
