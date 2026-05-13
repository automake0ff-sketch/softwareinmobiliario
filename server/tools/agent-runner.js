import { askClaude } from '../services/claude.js';
import { executeTool } from './executor.js';
import { allTools } from './definitions.js';

export async function runAgentWithTools(params) {
  const {
    systemPrompt,
    userMessage,
    agentType,
    context = {},
    maxIterations = 10,
  } = params;

  const tools = allTools[agentType];
  if (!tools || !tools.length) {
    return askClaude(systemPrompt, userMessage);
  }

  const messages = [
    { role: 'user', content: userMessage },
  ];

  for (let i = 0; i < maxIterations; i++) {
    const response = await claudeMessageWithTools(systemPrompt, messages, tools);

    const stopReason = response.stop_reason;
    const contentBlocks = response.content;

    const textBlock = contentBlocks.find(b => b.type === 'text');
    const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');

    if (stopReason === 'end_turn' || (!toolUseBlocks.length && textBlock)) {
      return textBlock?.text || '';
    }

    if (toolUseBlocks.length) {
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const toolResult = await executeTool(toolUse.name, toolUse.input, context);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(toolResult),
          is_error: !toolResult.success,
        });

        console.log(`[TOOL] ${agentType} ejecutó ${toolUse.name}: ${toolResult.success ? 'OK' : 'ERROR'}`);
      }

      messages.push({ role: 'assistant', content: contentBlocks });
      messages.push({ role: 'user', content: toolResults });
    }
  }

  throw new Error(`Agente ${agentType} excedió el máximo de ${maxIterations} iteraciones`);
}

async function claudeMessageWithTools(systemPrompt, messages, tools) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurada');
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 2000,
    system: systemPrompt,
    tools: tools,
    messages: messages,
  });

  return response;
}
