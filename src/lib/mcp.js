import api from './api';

const mcpApi = {
  listServers() {
    return api.get('/mcp');
  },

  getAgentServers(agentType) {
    return api.get(`/mcp/agent/${agentType}`);
  },

  listResources(serverName) {
    return api.post(`/mcp/${serverName}/resources/list`);
  },

  readResource(serverName, uri) {
    return api.post(`/mcp/${serverName}/resources/read`, { uri });
  },

  listTools(serverName) {
    return api.post(`/mcp/${serverName}/tools/list`);
  },

  callTool(serverName, name, args = {}) {
    return api.post(`/mcp/${serverName}/tools/call`, { name, arguments: args });
  },
};

export default mcpApi;
