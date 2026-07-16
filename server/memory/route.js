import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { getLeadMemory, memoryToContext } from './lead-memory.js';
import { buildConversationContext } from './conversation-memory.js';
import { updateLeadScore, appendInsight, regenerateSummary, updateLeadMemory } from './memory-updater.js';
import { buildAgentContext } from './context-builder.js';

const router = Router();
router.use(auth);

router.get('/lead/:leadId', async (req, res) => {
  try {
    const memory = await getLeadMemory(req.params.leadId);
    if (!memory) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json({ memory, context: memoryToContext(memory) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lead/:leadId/conversation', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const conversation = await buildConversationContext(req.params.leadId, limit);
    res.json({ messages: conversation, total: conversation.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/lead/:leadId/score', async (req, res) => {
  try {
    const { scoreChange, reason } = req.body;
    if (!scoreChange) return res.status(400).json({ error: 'scoreChange es requerido' });
    const result = await updateLeadScore(req.params.leadId, scoreChange, reason);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/lead/:leadId/insight', async (req, res) => {
  try {
    const { insight } = req.body;
    if (!insight) return res.status(400).json({ error: 'insight es requerido' });
    await appendInsight(req.params.leadId, insight);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/lead/:leadId/regenerate-summary', async (req, res) => {
  try {
    const summary = await regenerateSummary(req.params.leadId);
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/lead/:leadId/update', async (req, res) => {
  try {
    const { agentType, analysis } = req.body;
    if (!agentType || !analysis) return res.status(400).json({ error: 'agentType y analysis son requeridos' });
    const result = await updateLeadMemory(req.params.leadId, agentType, analysis);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lead/:leadId/context/:agentType', async (req, res) => {
  try {
    const ctx = await buildAgentContext(req.params.leadId, req.params.agentType);
    if (!ctx) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json({
      systemPrompt: ctx.systemPrompt,
      messages: ctx.messages,
      lead: ctx.lead,
      memory: ctx.memory,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
