import { all, get } from '../db/db.js';
import { generateEmbedding, searchSimilarEmbeddings, cosineSimilarity, buildPropertyEmbeddingContent, prepareTextForEmbedding } from '../services/rag.js';

export class PropIARagRetriever {

  async findSimilarProperties(lead, limit = 5) {
    const zones = lead.zone || '';
    const query = `Busco ${lead.property_interest || 'propiedad'} en ${zones} con presupuesto hasta ${lead.budget || 0}€`;
    const queryEmbedding = await generateEmbedding(query);

    const rows = await all(
      `SELECT pe.* FROM property_embeddings pe
       JOIN properties p ON p.id = pe.property_id
       WHERE pe.agency_id = @aid AND p.status = 'disponible'`,
      { aid: lead.agency_id }
    );

    if (!rows.length) return [];

    const parsed = rows.map(r => ({
      ...r,
      embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    }));

    const scored = parsed
      .map(row => {
        const similarity = cosineSimilarity(queryEmbedding, row.embedding);
        return { ...row, similarity };
      })
      .filter(r => r.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scored;
  }

  async findSimilarSuccessfulConversations(currentMessage, agencyId, outcome) {
    const embedding = await generateEmbedding(currentMessage.slice(0, 2000));

    let rows;
    if (outcome) {
      rows = await all(
        'SELECT * FROM successful_conversation_embeddings WHERE agency_id = @aid AND outcome = @outcome',
        { aid: agencyId, outcome }
      );
    } else {
      rows = await all(
        'SELECT * FROM successful_conversation_embeddings WHERE agency_id = @aid',
        { aid: agencyId }
      );
    }

    if (!rows.length) return [];

    const parsed = rows.map(r => ({
      ...r,
      embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding,
    }));

    const scored = parsed
      .map(row => {
        const similarity = cosineSimilarity(embedding, row.embedding);
        return { ...row, similarity };
      })
      .filter(r => r.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    return scored;
  }

  async searchKnowledgeBase(query, agencyId, category) {
    const embedding = await generateEmbedding(query.slice(0, 2000));

    let rows;
    if (category) {
      rows = await all(
        'SELECT * FROM knowledge_base_embeddings WHERE agency_id = @aid AND category = @cat',
        { aid: agencyId, cat: category }
      );
    } else {
      rows = await all(
        'SELECT * FROM knowledge_base_embeddings WHERE agency_id = @aid',
        { aid: agencyId }
      );
    }

    if (!rows.length) return [];

    const parsed = rows.map(r => ({
      ...r,
      embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding,
    }));

    const scored = parsed
      .map(row => {
        const similarity = cosineSimilarity(embedding, row.embedding);
        return { ...row, similarity };
      })
      .filter(r => r.similarity > 0.25)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    return scored;
  }
}

export function buildRagContext({ similarProps, successfulExamples, marketInfo }) {
  const propertiesSection = similarProps.length
    ? similarProps.map(p =>
        `${p.content.split('\n')[0]} (compatibilidad: ${Math.round(p.similarity * 100)}%)`
      ).join('\n')
    : 'No hay propiedades disponibles que coincidan exactamente con el perfil.';

  const examplesSection = successfulExamples.length
    ? `He encontrado ${successfulExamples.length} conversación(es) similar(es) que terminaron bien:\n` +
      successfulExamples.map(e =>
        `Situación "${e.context}" → resultado: ${e.outcome} (similitud: ${Math.round(e.similarity * 100)}%)`
      ).join('\n')
    : '';

  const marketSection = marketInfo.length
    ? marketInfo.map(m => m.content.slice(0, 300)).join('\n\n')
    : '';

  return { propertiesSection, examplesSection, marketSection };
}
