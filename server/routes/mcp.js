import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { mcpServers, getAgentMCPServers } from '../mcp/index.js';

const router = Router();
router.use(auth);

router.post('/:serverName/resources/list', async (req, res) => {
  try {
    const server = mcpServers[req.params.serverName];
    if (!server) return res.status(404).json({ error: `Servidor MCP no encontrado: ${req.params.serverName}. Disponibles: ${Object.keys(mcpServers).join(', ')}` });
    const result = await server.listResources();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:serverName/resources/read', async (req, res) => {
  try {
    const server = mcpServers[req.params.serverName];
    if (!server) return res.status(404).json({ error: 'Servidor MCP no encontrado' });

    const { uri } = req.body;
    if (!uri) return res.status(400).json({ error: 'uri es requerido' });

    const agencyId = req.headers['x-auth-agency'];
    const result = await server.readResource(uri, agencyId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:serverName/tools/list', async (req, res) => {
  try {
    const server = mcpServers[req.params.serverName];
    if (!server) return res.status(404).json({ error: 'Servidor MCP no encontrado' });
    const result = await server.listTools();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:serverName/tools/call', async (req, res) => {
  try {
    const server = mcpServers[req.params.serverName];
    if (!server) return res.status(404).json({ error: 'Servidor MCP no encontrado' });

    const { name, arguments: args } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const agencyId = req.headers['x-auth-agency'];
    const userId = req.headers['x-auth-user'];
    const result = await server.callTool(name, args || {}, { agencyId, userId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/agent/:agentType', (req, res) => {
  const servers = getAgentMCPServers(req.params.agentType);
  res.json({
    agentType: req.params.agentType,
    servers: servers.map(s => ({ name: s.name, version: s.version })),
  });
});

router.get('/', (req, res) => {
  res.json({
    servers: Object.entries(mcpServers).map(([name, s]) => ({
      name,
      version: s.version,
      resources: s._resources.length,
      tools: s._tools.length,
    })),
  });
});

export default router;
