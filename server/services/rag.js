const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_API_URL = 'https://openrouter.ai/api/v1/embeddings';

export async function generateEmbedding(text) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch(EMBEDDING_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text.slice(0, 8000),
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });
      if (!response.ok) throw new Error(`Embedding API error: ${response.status}`);
      const data = await response.json();
      return data.data[0].embedding;
    } catch (err) {
      console.warn('[RAG] OpenRouter embedding failed, using fallback:', err.message);
    }
  }

  const embedding = generateFallbackEmbedding(text);
  return embedding;
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

export function generateFallbackEmbedding(text) {
  const FALLBACK_DIMS = 384;
  const normalized = text.toLowerCase().replace(/[^a-záéíóúüñ0-9\s]/g, '').trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return new Array(FALLBACK_DIMS).fill(0);

  const embedding = new Array(FALLBACK_DIMS).fill(0);
  const ngramSize = Math.min(3, words.length);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordHash = Math.abs(hashCode(word));
    const posWeight = 1 / (1 + Math.log(i + 1));
    const idx1 = wordHash % FALLBACK_DIMS;
    embedding[idx1] += posWeight;

    for (let n = 2; n <= ngramSize && i + n <= words.length; n++) {
      const ngram = words.slice(i, i + n).join(' ');
      const ngramHash = Math.abs(hashCode(ngram));
      const idxN = ngramHash % FALLBACK_DIMS;
      embedding[idxN] += posWeight * 0.5;
    }
  }

  const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < FALLBACK_DIMS; i++) {
      embedding[i] /= magnitude;
    }
  }
  return embedding;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

export function prepareTextForEmbedding(content) {
  return content.replace(/\s+/g, ' ').trim();
}

export function searchSimilarEmbeddings(queryEmbedding, rows, threshold = 0.3, limit = 5) {
  const scored = rows
    .map(row => {
      const storedEmbedding = typeof row.embedding === 'string'
        ? JSON.parse(row.embedding)
        : row.embedding;
      const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);
      return { ...row, similarity };
    })
    .filter(r => r.similarity > threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return scored;
}

export function buildPropertyEmbeddingContent(property) {
  return `
Propiedad: ${property.type} en ${property.zone || property.city}, ${property.city}
Precio: ${(property.price || 0).toLocaleString('es-ES')}€
Características: ${property.bedrooms || 0} habitaciones, ${property.bathrooms || 0} baños, ${property.surface || 0}m²
Descripción: ${property.description || ''}
Título: ${property.title || ''}
`.trim();
}

export async function embedProperty(property) {
  const content = buildPropertyEmbeddingContent(property);
  const embedding = await generateEmbedding(content);
  return {
    property_id: property.id,
    agency_id: property.agency_id,
    content,
    embedding: JSON.stringify(embedding),
    metadata: JSON.stringify({
      price: property.price,
      zone: property.zone,
      city: property.city,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      surface: property.surface,
      type: property.type,
      title: property.title,
    }),
  };
}

export async function embedLeadSearchQuery(lead) {
  const zones = lead.zone || '';
  const query = `Busco ${lead.property_interest || 'propiedad'} en ${zones} con presupuesto hasta ${lead.budget || 0}€ ${lead.bedrooms_min ? `mínimo ${lead.bedrooms_min} habitaciones` : ''}`;
  return generateEmbedding(query);
}
