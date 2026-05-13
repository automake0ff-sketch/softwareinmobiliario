import api from './api';

const memoryApi = {
  getLeadMemory(leadId) {
    return api.get(`/memory/lead/${leadId}`);
  },

  getConversation(leadId, limit = 20) {
    return api.get(`/memory/lead/${leadId}/conversation`, { limit });
  },

  updateScore(leadId, scoreChange, reason) {
    return api.post(`/memory/lead/${leadId}/score`, { scoreChange, reason });
  },

  addInsight(leadId, insight) {
    return api.post(`/memory/lead/${leadId}/insight`, { insight });
  },

  regenerateSummary(leadId) {
    return api.post(`/memory/lead/${leadId}/regenerate-summary`);
  },

  updateMemory(leadId, agentType, analysis) {
    return api.post(`/memory/lead/${leadId}/update`, { agentType, analysis });
  },

  getAgentContext(leadId, agentType) {
    return api.get(`/memory/lead/${leadId}/context/${agentType}`);
  },
};

export default memoryApi;
