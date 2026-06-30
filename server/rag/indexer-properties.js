import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { generateEmbedding, buildPropertyEmbeddingContent, prepareTextForEmbedding } from '../services/rag.js';

export async function indexProperty(propertyId) {
  const property = get('SELECT * FROM properties WHERE id = @id', { id: propertyId });
  if (!property) return;

  const content = prepareTextForEmbedding(buildPropertyEmbeddingContent(property));
  const embedding = await generateEmbedding(content);

  const existing = get('SELECT id FROM property_embeddings WHERE property_id = @pid', { pid: propertyId });
  if (existing) {
    run(
      `UPDATE property_embeddings SET content = @content, embedding = @embedding, metadata = @metadata, created_at = NOW() WHERE property_id = @pid`,
      {
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
        pid: propertyId,
      }
    );
  } else {
    run(
      `INSERT INTO property_embeddings (id, property_id, agency_id, content, embedding, metadata, created_at) VALUES (@id, @pid, @aid, @content, @embedding, @metadata, NOW())`,
      {
        id: uuidv4(),
        pid: propertyId,
        aid: property.agency_id,
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
      }
    );
  }

  return { propertyId, indexed: true };
}

export async function reindexAgencyProperties(agencyId) {
  const properties = all(
    "SELECT id FROM properties WHERE agency_id = @aid AND status = 'disponible'",
    { aid: agencyId }
  );

  const results = [];
  for (const { id } of properties || []) {
    const result = await indexProperty(id);
    results.push(result);
    await sleep(50);
  }
  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
