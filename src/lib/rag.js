import api from './api';

const ragApi = {
  searchSimilarProperties(leadId, limit = 5) {
    return api.post('/rag/search/properties', { lead_id: leadId, limit });
  },

  searchKnowledgeBase(query, agencyId, category) {
    return api.post('/rag/search/knowledge', { query, agency_id: agencyId, category });
  },

  searchConversations(message, agencyId, outcome) {
    return api.post('/rag/search/conversations', { message, agency_id: agencyId, outcome });
  },

  indexProperty(propertyId) {
    return api.post(`/rag/index/property/${propertyId}`);
  },

  indexConversation(leadId, outcome) {
    return api.post('/rag/index/conversation', { lead_id: leadId, outcome });
  },

  indexKnowledgeEntry(agencyId, title, content, category) {
    return api.post('/rag/index/knowledge', { agency_id: agencyId, title, content, category });
  },

  reindexAgency(agencyId) {
    return api.post('/rag/index/reindex-agency', { agency_id: agencyId });
  },

  seedKnowledgeBase(agencyId) {
    return api.post('/rag/seed-knowledge', { agency_id: agencyId });
  },

  getKnowledge(agencyId, category) {
    const params = category ? `?category=${category}` : '';
    return api.get(`/rag/knowledge/${agencyId}${params}`);
  },
};

export default ragApi;
