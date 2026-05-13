import api from './api';

const toolsApi = {
  executeAgent(agentType, systemPrompt, userMessage, context = {}) {
    return api.post(`/tools/execute/${agentType}`, { systemPrompt, userMessage, context });
  },

  getToolDefinitions(agentType) {
    if (agentType) return api.get(`/tools/definitions/${agentType}`);
    return api.get('/tools/definitions');
  },
};

export default toolsApi;
