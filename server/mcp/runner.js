import { callClaude } from '../services/claude.js';
import { getAgentMCPServers } from './index.js';

export async function runAgentWithMCP(params) {
  const {
    systemPrompt,
    userMessage,
    agentType,
    context = {},
    maxIterations = 10,
  } = params;

  const servers = getAgentMCPServers(agentType);
  const { agencyId, userId } = context;

  if (!servers.length) {
    return callClaude(systemPrompt, userMessage);
  }

  const mcpContext = await gatherResources(servers, agencyId);
  const enhancedPrompt = buildEnhancedPrompt(systemPrompt, mcpContext, agentType);

  const messages = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < maxIterations; i++) {
    const response = await claudeMessageWithMCP(enhancedPrompt, messages, servers);

    const textBlock = response.content.find(b => b.type === 'text');
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    if (response.stop_reason === 'end_turn' || !toolUseBlocks.length) {
      return textBlock?.text || '';
    }

    if (toolUseBlocks.length) {
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const server = findServerForTool(servers, toolUse.name);
        if (server) {
          try {
            const result = await server.callTool(toolUse.name, toolUse.input, { agencyId, userId });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result.content[0]?.text || JSON.stringify(result),
              is_error: false,
            });
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content: `Error: ${err.message}`,
            });
          }
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            is_error: true,
            content: `Tool desconocida: ${toolUse.name}`,
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }
  }

  throw new Error(`Agente ${agentType} excedió el máximo de ${maxIterations} iteraciones`);
}

async function gatherResources(servers, agencyId) {
  const context = {};

  for (const server of servers) {
    try {
      const { resources } = await server.listResources();
      for (const resource of resources) {
        try {
          const result = await server.readResource(resource.uri, agencyId);
          context[resource.name] = result.contents[0]?.text || '';
        } catch (err) {
          context[resource.name] = `(no disponible: ${err.message})`;
        }
      }
    } catch (err) {
      console.warn(`[MCP] Error gathering resources from ${server.name}: ${err.message}`);
    }
  }

  return context;
}

function buildEnhancedPrompt(basePrompt, mcpContext, agentType) {
  const sections = [];

  if (mcpContext['Leads calientes']) {
    sections.push(`## Leads calientes sin asignar\n${mcpContext['Leads calientes']}`);
  }
  if (mcpContext['Vista del pipeline']) {
    sections.push(`## Pipeline actual\n${mcpContext['Vista del pipeline']}`);
  }
  if (mcpContext['Propiedades disponibles']) {
    sections.push(`## Propiedades disponibles\n${mcpContext['Propiedades disponibles']}`);
  }
  if (mcpContext['Agenda del día']) {
    sections.push(`## Agenda de hoy\n${mcpContext['Agenda del día']}`);
  }
  if (mcpContext['Disponibilidad de comerciales']) {
    sections.push(`## Disponibilidad de comerciales\n${mcpContext['Disponibilidad de comerciales']}`);
  }
  if (mcpContext['Conversaciones activas']) {
    sections.push(`## Conversaciones activas\n${mcpContext['Conversaciones activas']}`);
  }
  if (mcpContext['Precios de referencia por zona']) {
    sections.push(`## Precios de mercado por zona\n${mcpContext['Precios de referencia por zona']}`);
  }

  const contextBlock = sections.length
    ? `\n\n---\n## DATOS DEL SISTEMA (MCP - recuperados automáticamente)\n${sections.join('\n\n')}\n---`
    : '';

  return basePrompt + contextBlock;
}

function findServerForTool(servers, toolName) {
  for (const server of servers) {
    if (server._toolHandlers[toolName]) return server;
  }
  return null;
}

async function claudeMessageWithMCP(systemPrompt, messages, servers) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurada');
  }

  const tools = [];
  for (const server of servers) {
    try {
      const { tools: serverTools } = await server.listTools();
      tools.push(...serverTools);
    } catch (err) {
      console.warn(`[MCP] Error listing tools from ${server.name}: ${err.message}`);
    }
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 2000,
    system: systemPrompt,
    tools: tools.length > 0 ? tools : undefined,
    messages: messages,
  });

  return response;
}
