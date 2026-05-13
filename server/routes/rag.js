import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { generateEmbedding, cosineSimilarity } from '../services/rag.js';
import { PropIARagRetriever, buildRagContext } from '../rag/retriever.js';
import { indexProperty, reindexAgencyProperties } from '../rag/indexer-properties.js';
import { indexSuccessfulConversation } from '../rag/indexer-conversations.js';
import { indexKnowledgeEntry, seedDefaultKnowledgeBase, getKnowledgeByCategory } from '../rag/indexer-knowledge.js';

const router = Router();
router.use(auth);

router.post('/search/properties', async (req, res) => {
  try {
    const { lead_id, limit } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'lead_id es requerido' });

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: lead_id });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const retriever = new PropIARagRetriever();
    const results = await retriever.findSimilarProperties(lead, limit || 5);
    res.json({ results });
  } catch (error) {
    console.error('[RAG] Error searching properties:', error.message);
    res.status(500).json({ error: 'Error al buscar propiedades similares.' });
  }
});

router.post('/search/knowledge', async (req, res) => {
  try {
    const { query, agency_id, category } = req.body;
    if (!query || !agency_id) return res.status(400).json({ error: 'query y agency_id son requeridos' });

    const retriever = new PropIARagRetriever();
    const results = await retriever.searchKnowledgeBase(query, agency_id, category);
    res.json({ results });
  } catch (error) {
    console.error('[RAG] Error searching knowledge base:', error.message);
    res.status(500).json({ error: 'Error al buscar en knowledge base.' });
  }
});

router.post('/search/conversations', async (req, res) => {
  try {
    const { message, agency_id, outcome } = req.body;
    if (!message || !agency_id) return res.status(400).json({ error: 'message y agency_id son requeridos' });

    const retriever = new PropIARagRetriever();
    const results = await retriever.findSimilarSuccessfulConversations(message, agency_id, outcome);
    res.json({ results });
  } catch (error) {
    console.error('[RAG] Error searching conversations:', error.message);
    res.status(500).json({ error: 'Error al buscar conversaciones exitosas.' });
  }
});

router.post('/index/property/:id', async (req, res) => {
  try {
    const result = await indexProperty(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('[RAG] Error indexing property:', error.message);
    res.status(500).json({ error: 'Error al indexar propiedad.' });
  }
});

router.post('/index/reindex-agency', async (req, res) => {
  try {
    const { agency_id } = req.body;
    if (!agency_id) return res.status(400).json({ error: 'agency_id es requerido' });

    const results = await reindexAgencyProperties(agency_id);
    res.json({ indexed: results.length, results });
  } catch (error) {
    console.error('[RAG] Error reindexing agency:', error.message);
    res.status(500).json({ error: 'Error al reindexar agencia.' });
  }
});

router.post('/index/conversation', async (req, res) => {
  try {
    const { lead_id, outcome } = req.body;
    if (!lead_id || !outcome) return res.status(400).json({ error: 'lead_id y outcome son requeridos' });
    if (!['closed', 'visit_booked', 'reactivated'].includes(outcome)) {
      return res.status(400).json({ error: 'outcome debe ser: closed, visit_booked, o reactivated' });
    }

    const result = await indexSuccessfulConversation(lead_id, outcome);
    if (!result) return res.status(404).json({ error: 'No se encontró conversación para este lead.' });
    res.json(result);
  } catch (error) {
    console.error('[RAG] Error indexing conversation:', error.message);
    res.status(500).json({ error: 'Error al indexar conversación.' });
  }
});

router.post('/index/knowledge', async (req, res) => {
  try {
    const { agency_id, title, content, category } = req.body;
    if (!agency_id || !title || !content) {
      return res.status(400).json({ error: 'agency_id, title y content son requeridos' });
    }

    const result = await indexKnowledgeEntry({ agencyId: agency_id, title, content, category });
    res.json(result);
  } catch (error) {
    console.error('[RAG] Error indexing knowledge entry:', error.message);
    res.status(500).json({ error: 'Error al indexar entrada de conocimiento.' });
  }
});

router.post('/seed-knowledge', async (req, res) => {
  try {
    const { agency_id } = req.body;
    if (!agency_id) return res.status(400).json({ error: 'agency_id es requerido' });

    const results = await seedDefaultKnowledgeBase(agency_id);
    res.json({ seeded: results.length, results });
  } catch (error) {
    console.error('[RAG] Error seeding knowledge base:', error.message);
    res.status(500).json({ error: 'Error al sembrar knowledge base.' });
  }
});

router.get('/knowledge/:agencyId', (req, res) => {
  try {
    const { category } = req.query;
    const entries = getKnowledgeByCategory(req.params.agencyId, category);
    res.json(entries);
  } catch (error) {
    console.error('[RAG] Error getting knowledge:', error.message);
    res.status(500).json({ error: 'Error al obtener knowledge base.' });
  }
});

export default router;
