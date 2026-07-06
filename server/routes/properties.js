import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { generatePropertyMatch } from '../services/claude.js';

const router = Router();
router.use(auth);

const FIELD_MAP = {
  title: 'title',
  description: 'description',
  price: 'price',
  type: 'type',
  operation_type: 'operation_type',
  operation: 'operation_type',
  city: 'city',
  zone: 'zone',
  address: 'address',
  province: 'province',
  postal_code: 'postal_code',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  surface: 'surface',
  floor: 'floor',
  has_elevator: 'has_elevator',
  has_terrace: 'has_terrace',
  has_garage: 'has_garage',
  condition: 'condition',
  features: 'features',
  images: 'images',
  status: 'status',
  source: 'source',
  external_source: 'external_source',
  external_id: 'external_id',
  external_url: 'external_url',
  assigned_to: 'assigned_to',
  quality_score: 'quality_score',
};

async function normalizeStatus(status) {
  const map = {
    available: 'disponible',
    reserved: 'reservado',
    sold: 'vendido',
    rented: 'alquilado',
  };
  return map[status] || status || 'disponible';
}

async function normalizeOperation(operation) {
  const value = String(operation || 'sale').toLowerCase();
  if (['rent', 'rental', 'alquiler'].includes(value)) return 'rent';
  return 'sale';
}

async function normalizePortal(url) {
  const value = String(url || '').toLowerCase();
  if (value.includes('idealista')) return 'idealista';
  if (value.includes('fotocasa')) return 'fotocasa';
  if (value.includes('habitaclia')) return 'habitaclia';
  if (value.includes('pisos.com')) return 'pisos.com';
  return 'portal';
}

async function parseImages(images) {
  if (!images) return null;
  if (Array.isArray(images)) return JSON.stringify(images.filter(Boolean));
  if (typeof images === 'string') {
    const list = images.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    return JSON.stringify(list.length ? list : [images]);
  }
  return JSON.stringify(images);
}

async function parseFeatures(features) {
  if (!features) return null;
  if (Array.isArray(features)) return JSON.stringify(features.filter(Boolean));
  if (typeof features === 'string') {
    return JSON.stringify(features.split(',').map(s => s.trim()).filter(Boolean));
  }
  return JSON.stringify(features);
}

async function qualityScore(data) {
  const checks = [
    data.title,
    Number(data.price) > 0,
    data.description,
    data.city || data.zone || data.address,
    Number(data.surface) > 0,
    await parseImages(data.images),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

async function normalizeProperty(body, req, defaults = {}) {
  const data = { ...defaults };
  for (const [input, column] of Object.entries(FIELD_MAP)) {
    if (body[input] !== undefined) data[column] = body[input];
  }

  data.agency_id = req.user.agency_id;
  data.office_id = body.office_id || req.user.office_id || null;
  data.title = data.title || body.name || 'Propiedad importada';
  data.type = data.type || 'apartment';
  data.operation_type = await normalizeOperation(data.operation_type);
  data.price = Number(data.price || 0);
  data.city = data.city || 'Pendiente';
  data.status = await normalizeStatus(data.status);
  data.source = data.source || 'manual';
  data.external_source = data.external_source || data.source;
  data.images = await parseImages(data.images);
  data.features = await parseFeatures(data.features);
  data.bedrooms = Number(data.bedrooms || 0);
  data.bathrooms = Number(data.bathrooms || 0);
  data.surface = Number(data.surface || 0);
  data.has_elevator = data.has_elevator ? 1 : 0;
  data.has_terrace = data.has_terrace ? 1 : 0;
  data.has_garage = data.has_garage ? 1 : 0;
  data.quality_score = await qualityScore(data);
  return data;
}

async function insertProperty(data) {
  const id = uuidv4();
  await run(
    `INSERT INTO properties (
      id, agency_id, office_id, title, description, price, type, operation_type,
      city, zone, address, province, postal_code, bedrooms, bathrooms, surface,
      floor, has_elevator, has_terrace, has_garage, condition, features, images,
      status, source, external_source, external_id, external_url, imported_at,
      assigned_to, quality_score, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @office_id, @title, @description, @price, @type, @operation_type,
      @city, @zone, @address, @province, @postal_code, @bedrooms, @bathrooms, @surface,
      @floor, @has_elevator, @has_terrace, @has_garage, @condition, @features, @images,
      @status, @source, @external_source, @external_id, @external_url, @imported_at,
      @assigned_to, @quality_score, NOW(), NOW()
    )`,
    { id, ...data }
  );
  return await get('SELECT * FROM properties WHERE id = @id', { id });
}

async function updateProperty(id, agencyId, data) {
  const fields = Object.values(FIELD_MAP)
    .filter((field, index, arr) => arr.indexOf(field) === index)
    .filter(field => data[field] !== undefined);

  if (!fields.length) {
    return await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
  }

  const updates = fields.map(field => `${field} = @${field}`);
  updates.push("updated_at = NOW()");
  await run(
    `UPDATE properties SET ${updates.join(', ')} WHERE id = @id AND agency_id = @agency_id`,
    { ...data, id, agency_id: agencyId }
  );
  return await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
}

async function logActivity(req, property, type, description, metadata = {}) {
  await run(
    `INSERT INTO activities (id, agency_id, user_id, type, title, description, metadata, created_at)
     VALUES (@id, @agency_id, @user_id, @type, @title, @description, @metadata, NOW())`,
    {
      id: uuidv4(),
      agency_id: req.user.agency_id,
      user_id: req.user.id,
      type,
      title: property.title,
      description,
      metadata: JSON.stringify({ property_id: property.id, ...metadata }),
    }
  );
}

async function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  });
}

async function decodeHtml(value = '') {
  return String(value)
    .replace(/\\u002F/gi, '/')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0026/g, '&')
    .replace(/\\u002f/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

async function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function absoluteUrl(src, baseUrl) {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}

async function numberFromText(value = '') {
  const match = String(value).replace(/\./g, '').match(/(\d[\d\s,]*)/);
  if (!match) return 0;
  return Number(match[1].replace(/[^\d]/g, '')) || 0;
}

async function extractMeta(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return '';
}

async function collectJsonLd(html) {
  const blocks = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]).trim());
      blocks.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {}
  }
  return blocks.flatMap((entry) => entry?.['@graph'] || entry).filter(Boolean);
}

async function findDeep(obj, keys, results = []) {
  if (!obj || typeof obj !== 'object') return results;
  for (const [key, value] of Object.entries(obj)) {
    if (keys.includes(key)) results.push(value);
    if (value && typeof value === 'object') findDeep(value, keys, results);
  }
  return results;
}

async function collectImages(html, url, jsonBlocks = []) {
  const images = [];
  const decodedHtml = decodeHtml(html);
  for (const key of ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    const image = extractMeta(html, key);
    if (image) images.push(absoluteUrl(image, url));
  }

  for (const value of findDeep(jsonBlocks, ['image', 'images', 'thumbnail', 'thumbnailUrl', 'contentUrl'])) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') images.push(absoluteUrl(item, url));
        else if (item?.url) images.push(absoluteUrl(item.url, url));
        else if (item?.contentUrl) images.push(absoluteUrl(item.contentUrl, url));
      }
    } else if (typeof value === 'string') {
      images.push(absoluteUrl(value, url));
    } else if (value?.url) {
      images.push(absoluteUrl(value.url, url));
    } else if (value?.contentUrl) {
      images.push(absoluteUrl(value.contentUrl, url));
    }
  }

  const imgRegex = /<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(decodedHtml))) {
    const src = match[1];
    if (isImageLike(src)) {
      images.push(absoluteUrl(src, url));
    }
  }

  const imageKeyRegex = /["'](?:url|src|href|image|imageUrl|thumbnail|thumbnailUrl|small|medium|large|mainPhoto)["']\s*:\s*["']([^"']+)["']/gi;
  while ((match = imageKeyRegex.exec(decodedHtml))) {
    if (isImageLike(match[1])) images.push(absoluteUrl(match[1], url));
  }

  const markdownImageRegex = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
  while ((match = markdownImageRegex.exec(decodedHtml))) {
    if (isImageLike(match[1])) images.push(absoluteUrl(match[1], url));
  }

  const urlRegex = /https?:\/\/[^"'\\\s<>)]+/gi;
  while ((match = urlRegex.exec(decodedHtml))) {
    if (!isImageLike(match[0])) continue;
    images.push(match[0].replace(/\\\//g, '/'));
  }

  return unique(images).slice(0, 12);
}

async function isImageLike(src = '') {
  const value = decodeHtml(src).toLowerCase();
  return /\.(jpg|jpeg|png|webp)([?#]|$)/i.test(value) ||
    /(foto|photo|image|img|multimedia|picture|idealista|fotocasa|habitaclia|pisos\.com)/i.test(value);
}

async function firstJsonValue(jsonBlocks, keys) {
  for (const value of findDeep(jsonBlocks, keys)) {
    if (Array.isArray(value)) continue;
    if (value && typeof value === 'object') {
      if (value.name) return decodeHtml(value.name);
      if (value.value) return decodeHtml(value.value);
      if (value.addressLocality) return decodeHtml(value.addressLocality);
      continue;
    }
    if (value !== undefined && value !== null && String(value).trim()) return decodeHtml(value);
  }
  return '';
}

async function inferOperation(text, url) {
  const value = `${text} ${url}`.toLowerCase();
  if (/(alquiler|rent|rental|\/alquiler-|\/alquiler\/)/.test(value)) return 'rent';
  return 'sale';
}

async function inferType(text) {
  const value = String(text || '').toLowerCase();
  if (/chalet|villa/.test(value)) return 'villa';
  if (/casa/.test(value)) return 'house';
  if (/atico|ático/.test(value)) return 'penthouse';
  if (/duplex|dúplex/.test(value)) return 'duplex';
  if (/local/.test(value)) return 'commercial';
  if (/oficina/.test(value)) return 'office';
  if (/terreno|solar/.test(value)) return 'land';
  return 'apartment';
}

async function extractByRegex(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1].replace(/[^\d]/g, '')) || 0;
  }
  return 0;
}

async function findTextLiteral(source, keys) {
  const decoded = decodeHtml(source);
  for (const key of keys) {
    const regex = new RegExp(`["']${key}["']\\s*:\\s*["']([^"']{3,650})["']`, 'i');
    const match = decoded.match(regex);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return '';
}

async function findNumberLiteral(source, keys) {
  const decoded = decodeHtml(source);
  for (const key of keys) {
    const regex = new RegExp(`["']${key}["']\\s*:\\s*["']?([\\d.,]{2,})["']?`, 'i');
    const match = decoded.match(regex);
    if (match?.[1]) return numberFromText(match[1]);
  }
  return 0;
}

async function isGenericPortalTitle(title = '') {
  const value = String(title).trim().toLowerCase();
  return !value || ['idealista', 'fotocasa', 'habitaclia', 'pisos.com'].includes(value) || /^ficha de /.test(value);
}

async function firstMeaningfulParagraph(source = '') {
  return stripTags(source)
    .split(/\n|\r|\. /)
    .map(line => line.trim())
    .find(line =>
      line.length > 80 &&
      !/^(title|url source|markdown content|images|precio|contactar|publicidad)\b/i.test(line)
    ) || '';
}

async function scrapeQuality(data = {}) {
  return [
    data.title && !isGenericPortalTitle(data.title),
    data.description,
    Number(data.price) > 0,
    data.city || data.address,
    Number(data.surface) > 0,
    data.images?.length,
  ].filter(Boolean).length;
}

async function mergeScraped(base = {}, fallback = {}) {
  return {
    ...base,
    title: !isGenericPortalTitle(base.title) ? base.title : fallback.title || base.title,
    description: base.description || fallback.description || '',
    price: Number(base.price) > 0 ? base.price : fallback.price || 0,
    type: base.type || fallback.type || 'apartment',
    operation_type: base.operation_type || fallback.operation_type || 'sale',
    city: base.city || fallback.city || '',
    address: base.address || fallback.address || '',
    bedrooms: Number(base.bedrooms) > 0 ? base.bedrooms : fallback.bedrooms || 0,
    bathrooms: Number(base.bathrooms) > 0 ? base.bathrooms : fallback.bathrooms || 0,
    surface: Number(base.surface) > 0 ? base.surface : fallback.surface || 0,
    images: base.images?.length ? base.images : fallback.images || [],
    scraped: Boolean(base.scraped || fallback.scraped),
    blocked: Boolean(base.blocked && !fallback.scraped),
    scrape_status: base.scrape_status || fallback.scrape_status || 0,
    scrape_source: scrapeQuality(base) >= scrapeQuality(fallback) ? base.scrape_source : fallback.scrape_source,
  };
}

async function extractPortalData(html, url, status = 0, scrapeSource = 'html') {
  const jsonBlocks = collectJsonLd(html);
  const cleanText = stripTags(html);
  const title = (
    extractMeta(html, 'og:title') ||
    extractMeta(html, 'twitter:title') ||
    firstJsonValue(jsonBlocks, ['name', 'headline']) ||
    findTextLiteral(html, ['title', 'adTitle', 'propertyTitle', 'name', 'headline']) ||
    html.match(/^Title:\s*(.+)$/im)?.[1] ||
    html.match(/^#\s+(.+)$/m)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
    ''
  ).replace(/\s*(idealista|fotocasa|habitaclia|pisos\.com).*$/i, '').trim();

  const description = (
    extractMeta(html, 'og:description') ||
    extractMeta(html, 'description') ||
    firstJsonValue(jsonBlocks, ['description']) ||
    findTextLiteral(html, ['description', 'rawDescription', 'comment', 'propertyDescription']) ||
    cleanText.match(/(?:Descripcion|Descripción)\s*:?\s*(.{40,700})/i)?.[1] ||
    firstMeaningfulParagraph(cleanText) ||
    ''
  );

  const priceFromJson = firstJsonValue(jsonBlocks, ['price', 'lowPrice', 'highPrice']);
  const price = numberFromText(priceFromJson) || findNumberLiteral(html, ['price', 'amount', 'priceAmount', 'transactionPrice']) || extractByRegex(cleanText, [
    /([\d.\s]+)\s*(?:€|EUR)/i,
    /precio[^0-9]{0,25}([\d.\s]+)/i,
  ]);

  const bedrooms = findNumberLiteral(html, ['bedrooms', 'rooms', 'numRooms', 'hab']) || extractByRegex(cleanText, [
    /(\d+)\s*(?:hab|habitaciones|dormitorios)/i,
  ]);
  const bathrooms = findNumberLiteral(html, ['bathrooms', 'bathNumber', 'numBathrooms']) || extractByRegex(cleanText, [
    /(\d+)\s*(?:ba(?:n|ñ)os?|bath|aseos)/i,
  ]);
  const surface = findNumberLiteral(html, ['surface', 'surfaceArea', 'constructedArea', 'area', 'm2']) || extractByRegex(cleanText, [
    /(\d+)\s*m(?:2|\u00b2)/i,
    /(\d+)\s*metros/i,
  ]);

  const address = firstJsonValue(jsonBlocks, ['streetAddress', 'address']) || findTextLiteral(html, ['address', 'streetAddress', 'location']);
  const city = firstJsonValue(jsonBlocks, ['addressLocality']) ||
    findTextLiteral(html, ['addressLocality', 'city', 'municipality', 'town']) ||
    cleanText.match(/(?:en|de)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s-]{2,30})(?:,|\s|$)/)?.[1] ||
    '';

  return {
    title: title || '',
    description: description || '',
    price,
    type: inferType(`${title} ${description} ${cleanText.slice(0, 1000)}`),
    operation_type: inferOperation(`${title} ${description}`, url),
    city,
    address: typeof address === 'string' ? address : '',
    bedrooms,
    bathrooms,
    surface,
    images: collectImages(html, url, jsonBlocks),
    scraped: true,
    blocked: false,
    scrape_status: status,
    scrape_source: scrapeSource,
  };
}

async function fetchReaderText(url) {
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        accept: 'text/plain, text/markdown, */*',
        'x-return-format': 'markdown',
      },
    });
    if (!response.ok) return '';
    const text = await response.text();
    return text && text.length > 100 ? text : '';
  } catch {
    return '';
  }
}

async function scrapePortal(url) {
  let html = '';
  let status = 0;
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });
    status = response.status;
    html = await response.text();
  } catch {}

  if (!html || html.length < 500) {
    const readerText = await fetchReaderText(url);
    if (readerText) {
      return extractPortalData(readerText, url, status, 'reader');
    }
    return { scraped: false, blocked: true, scrape_status: status };
  }

  try {
    const direct = extractPortalData(html, url, status, 'html');
    if (scrapeQuality(direct) >= 5) return direct;

    const readerText = await fetchReaderText(url);
    if (!readerText) return direct;

    const reader = extractPortalData(readerText, url, status, 'reader');
    return mergeScraped(direct, reader);
  } catch (error) {
    return { scraped: false, blocked: false, scrape_status: status, scrape_error: error.message };
  }
}

async function marketingCopy(property, type = 'general') {
  const title = property.title || 'Propiedad destacada';
  const zone = [property.zone, property.city].filter(Boolean).join(', ');
  const price = property.price ? `${Number(property.price).toLocaleString('es-ES')} EUR` : 'precio a consultar';
  const basics = `${property.bedrooms || 0} hab., ${property.bathrooms || 0} banos, ${property.surface || 0} m2`;
  const base = `${title} en ${zone || 'ubicacion destacada'} por ${price}. ${basics}.`;
  const outputs = {
    idealista: `${base} Una vivienda pensada para compradores que buscan ubicacion, comodidad y una operacion clara. Contacta para recibir mas informacion o agendar una visita.`,
    whatsapp: `Hola, te paso una propiedad que puede encajar contigo: ${base} Si quieres, te envio mas detalles o agendamos una visita.`,
    email: `Te compartimos esta propiedad que puede encajar con tu busqueda.\n\n${base}\n\nPodemos enviarte mas informacion, resolver dudas o agendar una visita.`,
    redes: `${title}\n${zone}\n${price}\n${basics}\n\nUna oportunidad para quienes buscan una propiedad completa y bien ubicada.`,
    general: `${base} Descripcion lista para publicar: vivienda luminosa, bien distribuida y con puntos fuertes para captar demanda cualificada.`,
  };
  return outputs[type] || outputs.general;
}

router.get('/', async (req, res) => {
  try {
    const { status, type, city, zone, min_price, max_price, bedrooms, office_id, search, source, operation_type } = req.query;
    let sql = 'SELECT * FROM properties WHERE agency_id = @agency_id';
    const params = { agency_id: req.user.agency_id };

    if (status) { sql += ' AND status = @status'; params.status = await normalizeStatus(status); }
    if (type) { sql += ' AND type = @type'; params.type = type; }
    if (source) { sql += ' AND source = @source'; params.source = source; }
    if (operation_type) { sql += ' AND operation_type = @operation_type'; params.operation_type = await normalizeOperation(operation_type); }
    if (city) { sql += ' AND city LIKE @city'; params.city = `%${city}%`; }
    if (zone) { sql += ' AND zone LIKE @zone'; params.zone = `%${zone}%`; }
    if (min_price) { sql += ' AND price >= @min_price'; params.min_price = Number(min_price); }
    if (max_price) { sql += ' AND price <= @max_price'; params.max_price = Number(max_price); }
    if (bedrooms) { sql += ' AND bedrooms >= @bedrooms'; params.bedrooms = Number(bedrooms); }
    if (office_id) { sql += ' AND office_id = @office_id'; params.office_id = office_id; }
    if (search) {
      sql += ' AND (title LIKE @search OR description LIKE @search OR city LIKE @search OR zone LIKE @search OR external_url LIKE @search)';
      params.search = `%${search}%`;
    }

    sql += ' ORDER BY updated_at DESC, created_at DESC';
    res.json(await all(sql, params));
  } catch (error) {
    console.error('Error listing properties:', error);
    res.status(500).json({ error: 'Error al obtener propiedades.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = await normalizeProperty(req.body, req, { source: 'manual', external_source: 'manual' });
    if (!data.title || !data.type || !data.city) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: title, type, city.' });
    }
    const property = await insertProperty(data);
    await logActivity(req, property, 'property_created', `Propiedad creada manualmente: ${property.title}`);
    res.status(201).json(property);
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Error al crear propiedad.' });
  }
});

router.post('/scrape-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Incluye una URL.' });
  const portal = await normalizePortal(url);
  const scraped = await scrapePortal(url);
  res.json({ portal, url, ...scraped });
});

router.post('/import/url', async (req, res) => {
  try {
    const urls = Array.isArray(req.body.urls)
      ? req.body.urls
      : String(req.body.urls || req.body.url || '').split(/\n|,/).map(u => u.trim()).filter(Boolean);

    if (!urls.length) return res.status(400).json({ error: 'Incluye al menos una URL.' });

    const created = [];
    const updated = [];
    const skipped = [];
    for (const url of urls) {
      const externalSource = await normalizePortal(url);
      const duplicate = await get(
        'SELECT * FROM properties WHERE agency_id = @agency_id AND external_url = @external_url',
        { agency_id: req.user.agency_id, external_url: url }
      );
      const scraped = await scrapePortal(url);

      const importedFields = {
        title: req.body.title || scraped.title || `Propiedad importada desde ${externalSource}`,
        description: req.body.description || scraped.description || 'Ficha preliminar importada por URL. Revisa y completa los datos.',
        price: req.body.price || scraped.price || 0,
        type: req.body.type || scraped.type || 'apartment',
        operation_type: req.body.operation_type || scraped.operation_type || 'sale',
        city: req.body.city || scraped.city || 'Pendiente',
        address: req.body.address || scraped.address || '',
        bedrooms: req.body.bedrooms ?? scraped.bedrooms ?? 0,
        bathrooms: req.body.bathrooms ?? scraped.bathrooms ?? 0,
        surface: req.body.surface ?? scraped.surface ?? 0,
        images: req.body.images || scraped.images || [],
        features: req.body.features || [
          scraped.bedrooms ? `${scraped.bedrooms} habitaciones` : '',
          scraped.bathrooms ? `${scraped.bathrooms} banos` : '',
          scraped.surface ? `${scraped.surface} m2` : '',
        ].filter(Boolean),
        source: externalSource,
        external_source: externalSource,
        external_url: url,
        imported_at: new Date().toISOString(),
      };

      if (duplicate) {
        const property = await updateProperty(
          duplicate.id,
          req.user.agency_id,
          await normalizeProperty(importedFields, req, duplicate)
        );
        await logActivity(req, property, 'property_imported', `Propiedad actualizada desde ${externalSource}`, { url, refreshed: true });
        updated.push(property);
        continue;
      }

      const property = await insertProperty(await normalizeProperty(importedFields, req));
      await logActivity(req, property, 'property_imported', `Propiedad importada desde ${externalSource}`, { url });
      created.push(property);
    }
    res.status(201).json({ created, updated, skipped });
  } catch (error) {
    console.error('Error importing properties by URL:', error);
    res.status(500).json({ error: 'Error al importar propiedades por URL.' });
  }
});

router.post('/:id/marketing', async (req, res) => {
  try {
    const property = await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });
    const type = req.body.type || 'general';
    const content = marketingCopy(property, type);
    await logActivity(req, property, 'property_marketing_generated', `Marketing generado para ${property.title}`, { type });
    res.json({ type, title: property.title, content });
  } catch (error) {
    res.status(500).json({ error: 'Error al generar marketing.' });
  }
});

router.post('/:id/improve-ai', async (req, res) => {
  try {
    const property = await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });
    const improved = {
      title: property.title?.startsWith('Propiedad importada') ? `Vivienda destacada en ${property.city || property.zone || 'zona demandada'}` : property.title,
      description: marketingCopy(property, 'idealista'),
      strengths: [
        property.price ? 'Precio definido para filtrar demanda real' : 'Anadir precio para aumentar conversion',
        property.images ? 'Cuenta con imagenes para mejorar el anuncio' : 'Anadir imagenes reales de la propiedad',
        property.surface ? 'Superficie informada' : 'Completar superficie para mejorar busquedas',
      ],
      next_actions: ['Completar imagen principal', 'Enviar a leads compatibles', 'Publicar copy optimizado en portal'],
    };
    await logActivity(req, property, 'property_ai_improved', `Mejora IA generada para ${property.title}`);
    res.json({ property_id: property.id, improved });
  } catch (error) {
    res.status(500).json({ error: 'Error al generar mejora IA.' });
  }
});

router.post('/import/csv', async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : parseCsv(req.body.csv);
    if (!rows.length) return res.status(400).json({ error: 'CSV vacio o invalido.' });

    const created = [];
    const skipped = [];
    for (const row of rows) {
      const url = row.external_url || row.url || '';
      if (url) {
        const duplicate = await get(
          'SELECT id, title FROM properties WHERE agency_id = @agency_id AND external_url = @external_url',
          { agency_id: req.user.agency_id, external_url: url }
        );
        if (duplicate) {
          skipped.push({ url, reason: 'duplicate', property: duplicate });
          continue;
        }
      }
      const source = row.source || await normalizePortal(url) || 'csv';
      const property = await insertProperty(await normalizeProperty(
        {
          ...row,
          source,
          external_source: source,
          external_url: url,
          imported_at: new Date().toISOString(),
        },
        req
      ));
      await logActivity(req, property, 'property_imported', `Propiedad importada desde CSV`, { url });
      created.push(property);
    }
    res.status(201).json({ created, skipped });
  } catch (error) {
    console.error('Error importing properties by CSV:', error);
    res.status(500).json({ error: 'Error al importar propiedades por CSV.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const property = await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });
    res.json(property);
  } catch (error) {
    console.error('Error getting property:', error);
    res.status(500).json({ error: 'Error al obtener propiedad.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const data = await normalizeProperty(req.body, req, existing);
    const updates = Object.values(FIELD_MAP)
      .filter((field, index, arr) => arr.indexOf(field) === index)
      .filter(field => data[field] !== undefined)
      .map(field => `${field} = @${field}`);

    updates.push("updated_at = NOW()");
    await run(`UPDATE properties SET ${updates.join(', ')} WHERE id = @id AND agency_id = @agency_id`, { ...data, id: req.params.id, agency_id: req.user.agency_id });
    const property = await get('SELECT * FROM properties WHERE id = @id', { id: req.params.id });
    await logActivity(req, property, 'property_updated', `Propiedad actualizada: ${property.title}`);
    res.json(property);
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Error al actualizar propiedad.' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const status = await normalizeStatus(req.body.status);
    const existing = await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });
    await run("UPDATE properties SET status = @status, updated_at = NOW() WHERE id = @id", { id: req.params.id, status });
    const property = await get('SELECT * FROM properties WHERE id = @id', { id: req.params.id });
    await logActivity(req, property, 'property_status_changed', `Estado cambiado a ${status}`);
    res.json(property);
  } catch (error) {
    console.error('Error updating property status:', error);
    res.status(500).json({ error: 'Error al cambiar estado.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });
    await run('DELETE FROM properties WHERE id = @id', { id: req.params.id });
    await logActivity(req, existing, 'property_deleted', `Propiedad eliminada: ${existing.title}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Error al eliminar propiedad.' });
  }
});

router.post('/:id/match-leads', async (req, res) => {
  try {
    const property = await get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const rawLeadsMatch = await all(
      `SELECT * FROM leads
       WHERE agency_id = @agency_id
       AND status NOT IN ('cerrado', 'reserva')
       ORDER BY updated_at DESC LIMIT 20`,
      { agency_id: req.user.agency_id }
    );
    const leads = rawLeadsMatch.map(lead => {
      let score = 20;
      const reasons = [];
      if (lead.zone && `${property.zone || ''} ${property.city || ''}`.toLowerCase().includes(lead.zone.toLowerCase())) {
        score += 25; reasons.push('zona');
      }
      if (lead.budget && property.price && Number(property.price) <= Number(lead.budget) * 1.15) {
        score += 25; reasons.push('presupuesto');
      }
      if (lead.property_interest && property.type && lead.property_interest.toLowerCase().includes(property.type.toLowerCase())) {
        score += 15; reasons.push('tipo');
      }
      if ((lead.ia_score || 0) > 70) {
        score += 15; reasons.push('lead caliente');
      }
      return { ...lead, match_score: Math.min(score, 100), match_reasons: reasons };
    }).sort((a, b) => b.match_score - a.match_score);

    res.json({ property, leads });
  } catch (error) {
    console.error('Error matching property leads:', error);
    res.status(500).json({ error: 'Error al buscar leads compatibles.' });
  }
});

router.post('/match-lead', async (req, res) => {
  try {
    const { lead_id, filters } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'Se requiere lead_id.' });
    const agencyId = req.user.agency_id;
    const lead = await get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: lead_id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    let sql = "SELECT * FROM properties WHERE status = 'disponible' AND agency_id = @agency_id";
    const params = { agency_id: agencyId };
    if (lead.zone) { sql += ' AND (zone LIKE @zone OR city LIKE @zone)'; params.zone = `%${lead.zone}%`; }
    if (lead.budget) { sql += ' AND price <= @max_price'; params.max_price = lead.budget * 1.2; }
    if (filters?.type) { sql += ' AND type = @type'; params.type = filters.type; }

    const properties = all(sql, params);
    let matchResult = null;
    if (properties.length > 0) {
      try { matchResult = await generatePropertyMatch(lead, properties); }
      catch { matchResult = 'No se pudo generar match automatico.'; }
    }
    res.json({ lead, properties, match: matchResult });
  } catch (error) {
    console.error('Error matching properties:', error);
    res.status(500).json({ error: 'Error al buscar propiedades compatibles.' });
  }
});

export default router;
