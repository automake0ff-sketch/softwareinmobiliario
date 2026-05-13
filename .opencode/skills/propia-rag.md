---
name: propia-rag
description: >
  Implementa RAG (Retrieval Augmented Generation) para PropIA. Usa esta skill SIEMPRE
  que necesites que los agentes IA busquen y usen información relevante de una base de
  conocimiento: propiedades similares, conversaciones exitosas pasadas, respuestas a
  objeciones que funcionaron, datos del mercado inmobiliario, documentos de la agencia,
  o cualquier información que no cabe en el contexto pero el agente necesita consultar.
  También actívala cuando el usuario mencione "búsqueda semántica", "embeddings", "RAG",
  "base de conocimiento", "que busque en X", "similar a esto", "casos de éxito",
  "respuestas que han funcionado", o cuando un agente necesite encontrar propiedades
  similares, recuperar conversaciones exitosas anteriores, o consultar el knowledge base
  de la agencia. Usa pgvector en Supabase para almacenar y consultar embeddings.
---

# PropIA — RAG (Retrieval Augmented Generation)

PropIA usa RAG para que los agentes encuentren información relevante en tiempo real: propiedades similares, conversaciones exitosas, respuestas a objeciones y datos de mercado. Todo indexado en Supabase pgvector.

## Arquitectura RAG

```
INDEXACIÓN:
Datos (propiedades, conversaciones, docs)
  → Generate embedding (Claude o text-embedding-3-small)
  → Almacenar en pgvector (Supabase)

RETRIEVAL:
Query del agente
  → Generate embedding de la query
  → Búsqueda por similaridad coseno en pgvector
  → Top-K resultados más relevantes

AUGMENTATION:
Resultados relevantes
  → Añadir al contexto del agente
  → Agente responde con información fundamentada
```

## Setup: pgvector en Supabase

```sql
-- Habilitar extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de embeddings de propiedades
CREATE TABLE property_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  content TEXT NOT NULL,           -- Texto que se embeddeó
  embedding vector(1536),          -- OpenAI text-embedding-3-small = 1536 dims
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de embeddings de conversaciones exitosas
CREATE TABLE successful_conversation_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  lead_id UUID REFERENCES leads(id),
  content TEXT NOT NULL,
  context TEXT,                    -- Qué situación era (objeción, cierre, etc.)
  outcome TEXT NOT NULL,           -- 'closed', 'visit_booked', 'reactivated'
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de knowledge base (manual/documentos)
CREATE TABLE knowledge_base_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,                   -- 'objeccion', 'mercado', 'legal', 'proceso'
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice HNSW para búsqueda aproximada rápida
CREATE INDEX ON property_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX ON successful_conversation_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Función de búsqueda de propiedades similares
CREATE OR REPLACE FUNCTION search_similar_properties(
  query_embedding vector(1536),
  agency_filter UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  property_id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE SQL STABLE AS $$
  SELECT
    pe.property_id,
    pe.content,
    1 - (pe.embedding <=> query_embedding) AS similarity,
    pe.metadata
  FROM property_embeddings pe
  JOIN properties p ON p.id = pe.property_id
  WHERE pe.agency_id = agency_filter
    AND p.status = 'disponible'
    AND 1 - (pe.embedding <=> query_embedding) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Función de búsqueda de conversaciones exitosas similares
CREATE OR REPLACE FUNCTION search_successful_conversations(
  query_embedding vector(1536),
  agency_filter UUID,
  outcome_filter TEXT DEFAULT NULL,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  lead_id UUID,
  content TEXT,
  context TEXT,
  outcome TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    sce.lead_id,
    sce.content,
    sce.context,
    sce.outcome,
    1 - (sce.embedding <=> query_embedding) AS similarity
  FROM successful_conversation_embeddings sce
  WHERE sce.agency_id = agency_filter
    AND (outcome_filter IS NULL OR sce.outcome = outcome_filter)
  ORDER BY sce.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

## Cliente RAG

```typescript
// lib/rag/rag-client.ts

import OpenAI from 'openai'
import { supabase } from '@/lib/supabase/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Generar embedding de un texto
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),  // Límite de tokens
    dimensions: 1536
  })
  return response.data[0].embedding
}

// O usar Claude con transformaciones propias si no se quiere OpenAI:
// Alternativa: voyage-02 de Voyage AI (mejor para RAG)
```

## Indexación de Propiedades

```typescript
// lib/rag/indexers/property-indexer.ts

export async function indexProperty(propertyId: string) {
  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single()

  if (!property) return

  // Construir texto rico para embedding
  const content = buildPropertyEmbeddingContent(property)
  const embedding = await generateEmbedding(content)

  // Guardar en pgvector
  await supabase.from('property_embeddings').upsert({
    property_id: propertyId,
    agency_id: property.agency_id,
    content,
    embedding: JSON.stringify(embedding),
    metadata: {
      price: property.price,
      zone: property.zone,
      bedrooms: property.bedrooms,
      m2: property.m2_built,
      type: property.property_type
    }
  })
}

function buildPropertyEmbeddingContent(p: Property): string {
  return `
Propiedad: ${p.property_type} en ${p.zone}, ${p.city}
Precio: ${p.price?.toLocaleString('es-ES')}€ (${p.price_type})
Características: ${p.bedrooms} habitaciones, ${p.bathrooms} baños, ${p.m2_built}m²
${p.has_parking ? 'Con parking.' : ''} ${p.has_terrace ? 'Con terraza.' : ''} ${p.has_elevator ? 'Con ascensor.' : ''}
Descripción: ${p.description || ''}
Tags: ${p.ai_tags?.join(', ') || ''}
`.trim()
}

// Indexar todas las propiedades de una agencia (batch)
export async function reindexAgencyProperties(agencyId: string) {
  const { data: properties } = await supabase
    .from('properties')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('status', 'disponible')

  for (const { id } of properties || []) {
    await indexProperty(id)
    await sleep(100)  // Rate limiting de la API de embeddings
  }
}
```

## Indexación de Conversaciones Exitosas

```typescript
// lib/rag/indexers/conversation-indexer.ts

// Se ejecuta cuando un lead cierra o agenda visita exitosamente
export async function indexSuccessfulConversation(
  leadId: string,
  outcome: 'closed' | 'visit_booked' | 'reactivated'
) {
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', leadId)
    .order('created_at')
    .limit(30)

  if (!messages?.length) return

  // Extraer el exchange más relevante (últimos mensajes antes del éxito)
  const relevantMessages = messages.slice(-10)
  const content = relevantMessages
    .map(m => `${m.sender_type === 'lead' ? 'Lead' : 'IA'}: ${m.content}`)
    .join('\n')

  // Identificar el contexto (qué tipo de situación era)
  const context = await identifyConversationContext(content)

  const embedding = await generateEmbedding(`${context}\n${content}`)

  await supabase.from('successful_conversation_embeddings').insert({
    agency_id: messages[0].agency_id,
    lead_id: leadId,
    content,
    context,
    outcome,
    embedding: JSON.stringify(embedding)
  })
}

async function identifyConversationContext(conversation: string): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `En 1 frase, ¿qué situación describe esta conversación? (objeción de precio, duda de zona, indecisión, reactivación, primera toma de contacto, etc.)\n\n${conversation.slice(0, 500)}`
    }]
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}
```

## Retrieval — Búsqueda en tiempo real

```typescript
// lib/rag/retriever.ts

export class PropIARagRetriever {

  // Buscar propiedades similares al perfil de un lead
  async findSimilarProperties(lead: Lead, limit: number = 5) {
    const query = `
      Busco ${lead.property_type || 'propiedad'} para ${lead.operation_type}
      en ${lead.zones?.join(' o ')}
      presupuesto hasta ${lead.budget_max}€
      ${lead.bedrooms_min ? `mínimo ${lead.bedrooms_min} habitaciones` : ''}
    `.trim()

    const queryEmbedding = await generateEmbedding(query)

    const { data } = await supabase.rpc('search_similar_properties', {
      query_embedding: queryEmbedding,
      agency_filter: lead.agency_id,
      match_threshold: 0.65,
      match_count: limit
    })

    return data || []
  }

  // Buscar conversaciones exitosas similares (para aprender qué funciona)
  async findSimilarSuccessfulConversations(
    currentMessage: string,
    agencyId: string,
    outcome?: string
  ) {
    const embedding = await generateEmbedding(currentMessage)

    const { data } = await supabase.rpc('search_successful_conversations', {
      query_embedding: embedding,
      agency_filter: agencyId,
      outcome_filter: outcome || null,
      match_count: 3
    })

    return data || []
  }

  // Buscar en knowledge base (respuestas a objeciones, info de mercado)
  async searchKnowledgeBase(query: string, agencyId: string, category?: string) {
    const embedding = await generateEmbedding(query)

    let dbQuery = supabase
      .from('knowledge_base_embeddings')
      .select('title, content, category')
      .eq('agency_id', agencyId)
      .order(`embedding <=> '${JSON.stringify(embedding)}'`)
      .limit(3)

    if (category) {
      dbQuery = dbQuery.eq('category', category)
    }

    const { data } = await dbQuery
    return data || []
  }
}
```

## Uso del RAG en los Agentes

```typescript
// Ejemplo: Vendedor IA usando RAG
export async function runVendedorWithRAG(leadId: string, incomingMessage: string) {
  const retriever = new PropIARagRetriever()
  const lead = await getLead(leadId)

  // 1. Buscar propiedades similares al perfil
  const similarProps = await retriever.findSimilarProperties(lead)

  // 2. Si parece una objeción, buscar respuestas exitosas similares
  const isObjection = detectObjection(incomingMessage)
  const successfulExamples = isObjection
    ? await retriever.findSimilarSuccessfulConversations(incomingMessage, lead.agency_id)
    : []

  // 3. Buscar en knowledge base si hay info de mercado relevante
  const marketInfo = await retriever.searchKnowledgeBase(
    `mercado inmobiliario ${lead.zones?.[0]}`,
    lead.agency_id,
    'mercado'
  )

  // 4. Construir contexto RAG para el agente
  const ragContext = buildRagContext({ similarProps, successfulExamples, marketInfo })

  // 5. Añadir al system prompt del agente
  const systemPrompt = `
${VENDEDOR_SYSTEM_PROMPT}

---
## PROPIEDADES RELEVANTES PARA ESTE LEAD (recuperadas automáticamente)
${ragContext.propertiesSection}

## EJEMPLOS DE CONVERSACIONES SIMILARES QUE FUNCIONARON
${ragContext.examplesSection}

## DATOS DE MERCADO RELEVANTES
${ragContext.marketSection}
`

  return runAgentWithTools({ systemPrompt, ... })
}

function buildRagContext(data: RagData): RagContext {
  const propertiesSection = data.similarProps.length
    ? data.similarProps.map(p =>
        `- ${p.content.split('\n')[0]} (compatibilidad: ${Math.round(p.similarity * 100)}%)`
      ).join('\n')
    : 'No hay propiedades disponibles que coincidan exactamente.'

  const examplesSection = data.successfulExamples.length
    ? `He encontrado ${data.successfulExamples.length} conversación(es) similar(es) que terminaron bien:\n` +
      data.successfulExamples.map(e => `Situación "${e.context}" → resultado: ${e.outcome}`).join('\n')
    : ''

  const marketSection = data.marketInfo
    .map(m => m.content.slice(0, 200))
    .join('\n\n')

  return { propertiesSection, examplesSection, marketSection }
}
```

## Pipeline de Indexación Automática

```typescript
// Triggers automáticos de indexación:

// 1. Nueva propiedad creada → indexar inmediatamente
supabase.channel('new_properties')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'properties' },
    payload => indexProperty(payload.new.id)
  ).subscribe()

// 2. Propiedad actualizada → re-indexar
supabase.channel('updated_properties')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'properties' },
    payload => indexProperty(payload.new.id)
  ).subscribe()

// 3. Lead cerrado o visita completada → indexar conversación
// Se activa desde el worker de automatizaciones cuando stage = 'cerrado' o 'visita_completada'
```

## Knowledge Base — Contenido a indexar manualmente

Categorías recomendadas para el knowledge base de la agencia:

**Objeciones** (category: 'objecion'):
- "El precio es muy caro para la zona"
- "Primero tengo que vender mi piso"
- "Quiero esperar a que bajen los precios"
- "No sé si Sevilla es buena inversión ahora"

**Mercado** (category: 'mercado'):
- Precio medio €/m² por barrio (actualizar mensualmente)
- Tiempo medio de venta por zona
- Comparativas con ciudades similares

**Proceso** (category: 'proceso'):
- Pasos para comprar una vivienda en España
- Gastos de compraventa por CCAA
- Proceso de solicitud de hipoteca
- Plazos habituales de una operación

**Legal** (category: 'legal'):
- Qué es un contrato de arras
- Diferencias entre arras confirmatorias y penitenciales
- IBI, plusvalía municipal: quién paga qué
