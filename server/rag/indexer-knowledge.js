import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { generateEmbedding, prepareTextForEmbedding } from '../services/rag.js';

export async function indexKnowledgeEntry({ agencyId, title, content, category }) {
  const embeddingContent = prepareTextForEmbedding(`${title}\n${content}`);
  const embedding = await generateEmbedding(embeddingContent);

  const existing = await get('SELECT id FROM knowledge_base_embeddings WHERE agency_id = @aid AND title = @title', { aid: agencyId, title });
  if (existing) {
    run(
      `UPDATE knowledge_base_embeddings SET content = @content, category = @category, embedding = @embedding, created_at = NOW() WHERE id = @id`,
      { content, category, embedding: JSON.stringify(embedding), id: existing.id }
    );
  } else {
    run(
      `INSERT INTO knowledge_base_embeddings (id, agency_id, title, content, category, embedding, created_at)
       VALUES (@id, @aid, @title, @content, @category, @embedding, NOW())`,
      {
        id: uuidv4(),
        aid: agencyId,
        title,
        content,
        category,
        embedding: JSON.stringify(embedding),
      }
    );
  }

  return { title, indexed: true };
}

export async function seedDefaultKnowledgeBase(agencyId) {
  const entries = [
    {
      title: 'Respuesta a objeción: el precio es muy caro para la zona',
      content: 'Entiendo que el precio puede parecer elevado, pero esta propiedad tiene características únicas que la diferencian: mejores acabados, orientación óptima, y una revalorización constante en la zona. Además, el precio por metro cuadrado está en línea con el mercado actual. Podemos ver opciones similares si lo prefieres.',
      category: 'objecion',
    },
    {
      title: 'Respuesta a objeción: primero tengo que vender mi piso',
      content: 'Es completamente comprensible. Trabajamos con muchas familias en tu misma situación. Podemos coordinar la venta de tu piso actual mientras gestionamos la compra de tu nueva casa. Te ofrecemos un servicio de venta coordinada: tasamos tu piso sin compromiso y buscamos comprador mientras tanto.',
      category: 'objecion',
    },
    {
      title: 'Respuesta a objeción: quiero esperar a que bajen los precios',
      content: 'Históricamente, el mercado inmobiliario en España tiende a revalorizarse a largo plazo. En los últimos 12 meses, los precios han subido un 5-8% en zonas prime. Esperar podría significar pagar más en el futuro. Además, los tipos de interés actuales son favorables para hipotecas. Comprar ahora es asegurar el precio de hoy.',
      category: 'objecion',
    },
    {
      title: 'Respuesta a objeción: no sé si esta zona es buena inversión',
      content: 'La zona ha experimentado una revalorización significativa en los últimos años. Cuenta con excelentes conexiones de transporte, nuevos servicios y una demanda creciente. Los datos de mercado muestran una rentabilidad media del 5-7% en alquiler. Es una opción sólida tanto para vivir como para invertir.',
      category: 'objecion',
    },
    {
      title: 'Precio medio por metro cuadrado en Madrid 2026',
      content: 'Madrid centro: 5.500-7.000 €/m². Salamanca: 6.000-8.000 €/m². Chamberí: 4.500-6.000 €/m². Chamartín: 4.000-5.500 €/m². Retiro: 5.000-6.500 €/m². La demanda sigue superando a la oferta en zonas prime.',
      category: 'mercado',
    },
    {
      title: 'Precio medio por metro cuadrado en Barcelona 2026',
      content: 'Barcelona centro: 5.000-7.000 €/m². Eixample: 4.500-6.500 €/m². Gràcia: 4.000-5.500 €/m². Sarrià-Sant Gervasi: 5.000-7.000 €/m². Ciutat Vella: 4.000-6.000 €/m². El mercado se mantiene estable con ligera tendencia al alza.',
      category: 'mercado',
    },
    {
      title: 'Tiempo medio de venta por zona',
      content: 'Zonas prime (Salamanca, Chamberí, Eixample): 30-60 días. Zonas medias: 60-120 días. Zonas periféricas: 90-180 días. El tiempo de venta se ha reducido un 15% respecto al año anterior en zonas bien comunicadas.',
      category: 'mercado',
    },
    {
      title: 'Pasos para comprar una vivienda en España',
      content: '1. Búsqueda y selección de propiedad. 2. Firma de contrato de arras (reserva con 10% del precio). 3. Solicitud de hipoteca (30-45 días). 4. Firma de arras penitenciales o confirmatorias. 5. Firma de escritura pública ante notario. 6. Liquidación de impuestos (ITP o IVA). 7. Inscripción en el Registro de la Propiedad. Plazo total estimado: 2-4 meses.',
      category: 'proceso',
    },
    {
      title: 'Gastos de compraventa por CCAA',
      content: 'ITP: 6-10% según CCAA (vivienda usada). IVA: 10% (vivienda nueva). Actos Jurídicos Documentados: 0.5-1.5%. Notaría: 300-800€. Registro: 200-500€. Gestoría: 200-400€. Tasación: 300-600€. Gastos totales: 10-13% del precio de compra.',
      category: 'legal',
    },
    {
      title: 'Proceso de solicitud de hipoteca',
      content: 'Documentación necesaria: DNI/NIE, últimas 3 nóminas, declaración de la renta (2 años), contrato laboral, ahorros (extractos bancarios 6 meses), contrato de arras, nota simple del registro. El banco aprueba en 7-15 días. Recomendamos comparar al menos 3 entidades.',
      category: 'proceso',
    },
    {
      title: 'Qué es un contrato de arras',
      content: 'El contrato de arras es un acuerdo privado entre comprador y vendedor que formaliza la reserva de una vivienda. El comprador entrega una cantidad (generalmente 10% del precio) a cuenta. Existen tres tipos: arras confirmatorias (cantidad a cuenta del precio), arras penitenciales (permite desistir perdiendo la cantidad entregada), y arras penales (indemnización por incumplimiento).',
      category: 'legal',
    },
  ];

  const results = [];
  for (const entry of entries) {
    const result = await indexKnowledgeEntry({ agencyId, ...entry });
    results.push(result);
  }
  return results;
}

export function getKnowledgeByCategory(agencyId, category) {
  if (category) {
    return all(
      'SELECT title, content, category FROM knowledge_base_embeddings WHERE agency_id = @aid AND category = @cat ORDER BY created_at DESC',
      { aid: agencyId, cat: category }
    );
  }
  return all(
    'SELECT title, content, category FROM knowledge_base_embeddings WHERE agency_id = @aid ORDER BY created_at DESC',
    { aid: agencyId }
  );
}
