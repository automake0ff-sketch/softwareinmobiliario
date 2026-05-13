import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { runAgentWithTools } from '../tools/agent-runner.js';
import { allTools } from '../tools/definitions.js';

const router = Router();
router.use(auth);

router.post('/execute/:agentType', async (req, res) => {
  try {
    const { agentType } = req.params;
    const { systemPrompt, userMessage, context } = req.body;

    if (!allTools[agentType]) {
      return res.status(400).json({ error: `Tipo de agente inválido: ${agentType}. Válidos: ${Object.keys(allTools).join(', ')}` });
    }
    if (!systemPrompt || !userMessage) {
      return res.status(400).json({ error: 'systemPrompt y userMessage son requeridos' });
    }

    const mergedContext = {
      ...(context || {}),
      agencyId: context?.agencyId || req.headers['x-auth-agency'],
      userId: context?.userId || req.headers['x-auth-user'],
    };

    const response = await runAgentWithTools({
      systemPrompt,
      userMessage,
      agentType,
      context: mergedContext,
    });

    res.json({ success: true, agentType, response });
  } catch (error) {
    console.error(`[TOOLS] Error executing ${req.params.agentType}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/definitions/:agentType', (req, res) => {
  const { agentType } = req.params;
  const tools = allTools[agentType];
  if (!tools) {
    return res.status(404).json({ error: `No hay tools para ${agentType}` });
  }
  res.json({ agentType, tools });
});

router.get('/definitions', (req, res) => {
  res.json(allTools);
});

export default router;
