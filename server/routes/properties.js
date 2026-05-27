import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { generatePropertyMatch } from '../services/claude.js';
import { propertySchema, validateBody } from '../middleware/validators.js';
import { askAI } from '../services/openrouter.js';

const router = Router();
router.use(auth);

function logActivity(agencyId, leadId, userId, type, description, metadata = null) {
  run(
    `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
     VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, @metadata, datetime('now'))`,
    {
      id: uuidv4(), agency_id: agencyId, lead_id: leadId, user_id: userId,
      type, description, metadata: metadata ? JSON.stringify(metadata) : null,
    }
  );
}

function parseImages(val) {
  if (!val) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
}

function parseFeatures(val) {
  if (!val) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
}

function toBool(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v ? 1 : 0;
}

// GET /api/properties — List with filters + metrics
router.get('/', (req, res) => {
  try {
    const { status, type, city, zone, min_price, max_price, bedrooms, bathrooms,
      office_id, search, source, operation_type, province, has_elevator, has_terrace,
      has_garage, assigned_to, incomplete, date_from, date_to, sort, order, metrics } = req.query;

    const agencyId = req.user.agency_id;

    // If metrics=true, return stats
    if (metrics === 'true') {
      const total = get('SELECT COUNT(*) as c FROM properties WHERE agency_id = @aid', { aid: agencyId }).c;
      const disponibles = get("SELECT COUNT(*) as c FROM properties WHERE agency_id = @aid AND status = 'disponible'", { aid: agencyId }).c;
      const reservadas = get("SELECT COUNT(*) as c FROM properties WHERE agency_id = @aid AND status = 'reservado'", { aid: agencyId }).c;
      const vendidas = get("SELECT COUNT(*) as c FROM properties WHERE agency_id = @aid AND status IN ('vendido','alquilado')", { aid: agencyId }).c;
      const avgPrice = get('SELECT AVG(price) as p FROM properties WHERE agency_id = @aid AND price > 0', { aid: agencyId }).p || 0;
      const sinFotos = get("SELECT COUNT(*) as c FROM properties WHERE agency_id = @aid AND (images IS NULL OR images = '[]' OR images = '')", { aid: agencyId }).c;
      const sinDesc = get("SELECT COUNT(*) as c FROM properties WHERE agency_id = @aid AND (description IS NULL OR description = '')", { aid: agencyId }).c;
      const importadas = get("SELECT COUNT(*) as c FROM properties WHERE agency_id = @aid AND source = 'idealista'", { aid: agencyId }).c;
      return res.json({ total, disponibles, reservadas, vendidas, avgPrice: Math.round(avgPrice), sinFotos, sinDesc, importadas });
    }

    let sql = `SELECT p.*, u.name as assigned_name
      FROM properties p LEFT JOIN users u ON u.id = p.assigned_to WHERE p.agency_id = @agency_id`;
    const params = { agency_id: agencyId };

    if (status) { sql += ' AND p.status = @status'; params.status = status; }
    if (type) { sql += ' AND p.type = @type'; params.type = type; }
    if (operation_type) { sql += ' AND p.operation_type = @operation_type'; params.operation_type = operation_type; }
    if (source) { sql += ' AND p.source = @source'; params.source = source; }
    if (city) { sql += ' AND p.city LIKE @city'; params.city = `%${city}%`; }
    if (zone) { sql += ' AND p.zone LIKE @zone'; params.zone = `%${zone}%`; }
    if (province) { sql += ' AND p.province LIKE @province'; params.province = `%${province}%`; }
    if (min_price) { sql += ' AND p.price >= @min_price'; params.min_price = Number(min_price); }
    if (max_price) { sql += ' AND p.price <= @max_price'; params.max_price = Number(max_price); }
    if (bedrooms) { sql += ' AND p.bedrooms >= @bedrooms'; params.bedrooms = Number(bedrooms); }
    if (bathrooms) { sql += ' AND p.bathrooms >= @bathrooms'; params.bathrooms = Number(bathrooms); }
    if (office_id) { sql += ' AND p.office_id = @office_id'; params.office_id = office_id; }
    if (has_elevator) { sql += ' AND p.has_elevator = 1'; }
    if (has_terrace) { sql += ' AND p.has_terrace = 1'; }
    if (has_garage) { sql += ' AND p.has_garage = 1'; }
    if (assigned_to) { sql += ' AND p.assigned_to = @assigned_to'; params.assigned_to = assigned_to; }
    if (date_from) { sql += ' AND p.created_at >= @date_from'; params.date_from = date_from; }
    if (date_to) { sql += ' AND p.created_at <= @date_to'; params.date_to = date_to; }
    if (incomplete === 'true') {
      sql += " AND ((p.images IS NULL OR p.images = '[]' OR p.images = '') OR (p.description IS NULL OR p.description = '') OR p.price = 0 OR p.surface IS NULL)";
    }
    if (search) {
      sql += ' AND (p.title LIKE @search OR p.description LIKE @search OR p.city LIKE @search OR p.zone LIKE @search OR p.address LIKE @search OR p.province LIKE @search)';
      params.search = `%${search}%`;
    }

    const sortField = sort || 'p.created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    const allowedSort = ['created_at', 'price', 'title', 'updated_at', 'imported_at', 'bedrooms', 'surface'];
    const sf = allowedSort.includes(sort) ? `p.${sort}` : 'p.created_at';
    sql += ` ORDER BY ${sf} ${sortOrder}`;

    const properties = all(sql, params);
    // Attach interested_count safely (table may not exist if migrations haven't run)
    try {
      const counts = all('SELECT property_id, COUNT(*) as cnt FROM property_interests GROUP BY property_id');
      const countMap = {};
      for (const row of counts) countMap[row.property_id] = row.cnt;
      for (const p of properties) p.interested_count = countMap[p.id] || 0;
    } catch {
      for (const p of properties) p.interested_count = 0;
    }
    res.json(properties);
  } catch (error) {
    console.error('Error listing properties:', error);
    res.status(500).json({ error: 'Error al obtener propiedades.' });
  }
});

// GET /api/properties/:id — Single property with full details
router.get('/:id', (req, res) => {
  try {
    const property = get(
      'SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: req.user.agency_id }
    );
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const activities = all(
      `SELECT * FROM activities WHERE agency_id = @agency_id AND (
        metadata LIKE @pid1 OR type LIKE 'property_%'
      ) ORDER BY created_at DESC LIMIT 20`,
      { agency_id: req.user.agency_id, pid1: `%"property_id":"${req.params.id}"%` }
    );

    const compatibleLeads = all(
      `SELECT l.*, m.score as match_score, m.reason as match_reason
       FROM leads l
       LEFT JOIN matchings m ON m.lead_id = l.id AND m.property_id = @pid
       WHERE l.agency_id = @agency_id AND l.status NOT IN ('cerrado')
       ORDER BY m.score DESC NULLS LAST
       LIMIT 10`,
      { pid: req.params.id, agency_id: req.user.agency_id }
    );

    const interests = all(
      `SELECT pi.*, l.name as lead_name, l.phone as lead_phone, l.email as lead_email,
              l.status as lead_status, l.ia_score as lead_score, l.source as lead_source,
              l.last_activity as lead_last_activity
       FROM property_interests pi
       JOIN leads l ON l.id = pi.lead_id
       WHERE pi.property_id = @pid AND pi.agency_id = @aid
       ORDER BY pi.created_at DESC`,
      { pid: req.params.id, aid: req.user.agency_id }
    );

    const daysPublished = Math.floor((Date.now() - new Date(property.created_at).getTime()) / 86400000);

    res.json({
      ...property,
      activities,
      compatible_leads: compatibleLeads,
      interests,
      interested_count: interests.length,
      compatible_count: compatibleLeads.length,
      days_published: daysPublished,
    });
  } catch (error) {
    console.error('Error getting property:', error);
    res.status(500).json({ error: 'Error al obtener propiedad.' });
  }
});

// POST /api/properties — Create manual property
router.post('/', validateBody(propertySchema), (req, res) => {
  try {
    const {
      title, description, price, type, operation_type, city, zone, address,
      province, postal_code, bedrooms, bathrooms, surface, floor,
      has_elevator, has_terrace, has_garage, condition,
      features, images, public_url, status, office_id, assigned_to,
      source, external_source, external_id, external_url
    } = req.body;

    const id = uuidv4();
    run(
      `INSERT INTO properties (
        id, agency_id, office_id, title, description, price, type, operation_type,
        city, zone, address, province, postal_code, bedrooms, bathrooms, surface,
        floor, has_elevator, has_terrace, has_garage, condition,
        features, images, public_url, status, source, external_source,
        external_id, external_url, assigned_to, created_at
      ) VALUES (
        @id, @agency_id, @office_id, @title, @description, @price, @type, @operation_type,
        @city, @zone, @address, @province, @postal_code, @bedrooms, @bathrooms, @surface,
        @floor, @has_elevator, @has_terrace, @has_garage, @condition,
        @features, @images, @public_url, @status, @source, @external_source,
        @external_id, @external_url, @assigned_to, datetime('now')
      )`,
      {
        id, agency_id: req.user.agency_id, office_id: office_id || req.user.office_id,
        title, description, price, type, operation_type: operation_type || 'sale',
        city, zone, address, province, postal_code,
        bedrooms: bedrooms || 0, bathrooms: bathrooms || 0, surface,
        floor, has_elevator: toBool(has_elevator), has_terrace: toBool(has_terrace),
        has_garage: toBool(has_garage), condition,
        features: parseFeatures(features), images: parseImages(images),
        public_url: public_url || null, status: status || 'disponible',
        source: source || 'manual', external_source: external_source || null,
        external_id: external_id || null, external_url: external_url || null,
        assigned_to: assigned_to || null,
      }
    );

    const property = get('SELECT * FROM properties WHERE id = @id', { id });

    logActivity(
      req.user.agency_id, null, req.user.id, 'property_created',
      `Propiedad "${title}" creada manualmente. Precio: ${price}€. Tipo: ${type}. Ciudad: ${city}`,
      { property_id: id, source: 'manual', price, type, city }
    );

    res.status(201).json(property);
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Error al crear propiedad.' });
  }
});

// PATCH /api/properties/:id — Update property
router.patch('/:id', validateBody(propertySchema.partial()), (req, res) => {
  try {
    const existing = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const allowed = [
      'title', 'description', 'price', 'type', 'operation_type', 'city', 'zone',
      'address', 'province', 'postal_code', 'bedrooms', 'bathrooms', 'surface',
      'floor', 'has_elevator', 'has_terrace', 'has_garage', 'condition',
      'features', 'images', 'public_url', 'status', 'office_id',
      'assigned_to', 'quality_score',
    ];
    const updates = [];
    const params = { id: req.params.id };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === 'has_elevator' || field === 'has_terrace' || field === 'has_garage') {
          value = toBool(value);
        }
        if ((field === 'features' || field === 'images') && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        updates.push(`${field} = @${field}`);
        params[field] = value;
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });

    updates.push("updated_at = datetime('now')");
    run(`UPDATE properties SET ${updates.join(', ')} WHERE id = @id`, params);

    const property = get('SELECT * FROM properties WHERE id = @id', { id: req.params.id });

    logActivity(
      req.user.agency_id, null, req.user.id, 'property_updated',
      `Propiedad "${property.title}" actualizada.`,
      { property_id: req.params.id }
    );

    res.json(property);
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Error al actualizar propiedad.' });
  }
});

// DELETE /api/properties/:id — Delete property
router.delete('/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    run('DELETE FROM properties WHERE id = @id', { id: req.params.id });

    logActivity(
      req.user.agency_id, null, req.user.id, 'property_deleted',
      `Propiedad "${existing.title}" eliminada.`,
      { property_id: req.params.id, title: existing.title }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Error al eliminar propiedad.' });
  }
});

function detectPortal(url) {
  const u = url.toLowerCase();
  if (u.includes('idealista')) return 'idealista';
  if (u.includes('fotocasa')) return 'fotocasa';
  if (u.includes('habitaclia')) return 'habitaclia';
  if (u.includes('pisos.com')) return 'pisoscom';
  return null;
}

function parseUrlForProperty(url) {
  let title = 'Propiedad importada';
  let city = '';
  let zone = '';
  let price = 0;
  let propertyType = 'apartment';
  let operationType = 'sale';
  let description = '';
  let externalId = '';
  let portal = detectPortal(url) || 'manual';

  const urlObj = new URL(url);
  const pathMatch = urlObj.pathname.match(/\/(\d+)/);
  if (pathMatch) externalId = pathMatch[1];

  if (urlObj.hostname.includes('alquiler') || urlObj.pathname.includes('alquiler')) operationType = 'rent';
  else if (urlObj.hostname.includes('compra') || urlObj.pathname.includes('compra')) operationType = 'sale';
  else if (urlObj.pathname.includes('venta')) operationType = 'sale';

  const segments = urlObj.pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    const cityZone = segments[segments.length - 2] || '';
    if (cityZone) {
      const parts = cityZone.split('-');
      city = parts[0] || '';
      zone = parts.slice(1).join(' ') || null;
    }
    const typeMaps = {
      pisos: 'apartment', casas: 'house', locales: 'commercial', oficinas: 'office',
      terrenos: 'land', naves: 'warehouse', apartamentos: 'apartment', estudios: 'studio',
      chalets: 'house', duplex: 'duplex', aticos: 'penthouse',
    };
    const typeSegment = segments.find(s => typeMaps[s] || ['pisos','casas','locales','oficinas','terrenos','naves','apartamentos','estudios','chalets','duplex','aticos'].includes(s));
    if (typeSegment && typeMaps[typeSegment]) propertyType = typeMaps[typeSegment];
  }

  return { title, city, zone, price, propertyType, operationType, description, externalId, portal };
}

async function fetchPageData(url) {
  let title = '', price = 0, description = '', images = [];
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000),
    });
    if (response.ok) {
      const html = await response.text();
      const titleMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].substring(0, 200);
      const priceMatch = html.match(/(\d[\d.]*)\s*€/);
      if (priceMatch) price = parseInt(priceMatch[1].replace(/\./g, ''));
      const descMatch = html.match(/"description"\s*:\s*"([^"]+)"/);
      if (descMatch) description = descMatch[1].substring(0, 1000);
      // Extract images: og:image meta tag, then JSON-LD gallery
      const ogImg = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
      if (ogImg) images.push(ogImg[1]);
      const ldImg = html.match(/"image"\s*:\s*"([^"]+)"/);
      if (ldImg && !images.includes(ldImg[1])) images.push(ldImg[1]);
      const galleryMatch = html.match(/"images"\s*:\s*\[([^\]]+)\]/);
      if (galleryMatch) {
        const urls = galleryMatch[1].match(/"([^"]+)"/g);
        if (urls) urls.forEach(u => { const clean = u.replace(/"/g, ''); if (!images.includes(clean)) images.push(clean); });
      }
      images = images.slice(0, 10);
    }
  } catch {}
  return { title, price, description, images };
}

// POST /api/properties/import/url — Import single property from URL
router.post('/import/url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Se requiere una URL.' });

    const agencyId = req.user.agency_id;

    // Check for duplicate
    const existing = get('SELECT id FROM properties WHERE external_url = @url AND agency_id = @agency_id', { url, agency_id: agencyId });
    if (existing) {
      return res.status(200).json({ created: [], duplicates: [{ url, property_id: existing.id }], errors: [] });
    }

    let data;
    let portal = detectPortal(url);
    try {
      data = parseUrlForProperty(url);
    } catch (parseErr) {
      data = { title: 'Propiedad importada', city: '', zone: '', price: 0, propertyType: 'apartment', operationType: 'sale', description: '', externalId: '', portal };
    }

    // Try to fetch more data from the page (non-blocking)
    const pageData = await fetchPageData(url);
    if (pageData.title) data.title = pageData.title;
    if (pageData.price > 0) data.price = pageData.price;
    if (pageData.description) data.description = pageData.description;
    const images = parseImages(pageData.images);

    const id = uuidv4();
    const source = data.portal || null;
    run(
      `INSERT INTO properties (
        id, agency_id, office_id, title, description, price, type, operation_type,
        city, zone, source, external_source, external_id, external_url,
        images, status, imported_at, created_at, updated_at
      ) VALUES (
        @id, @agency_id, @office_id, @title, @description, @price, @type, @operation_type,
        @city, @zone, @source, @source, @external_id, @external_url,
        @images, 'disponible', datetime('now'), datetime('now'), datetime('now')
      )`,
      {
        id, agency_id: agencyId, office_id: req.user.office_id || null,
        title: data.title || 'Propiedad importada',
        description: data.description || null,
        price: data.price || 0,
        type: data.propertyType,
        operation_type: data.operationType,
        city: data.city || 'Sin especificar',
        zone: data.zone || null,
        source: source || 'imported_url',
        external_id: data.externalId || null,
        external_url: url,
        images,
      }
    );

    const property = get('SELECT * FROM properties WHERE id = @id', { id });
    console.log('[URL Import] Created:', { id: property?.id, title: property?.title });

    logActivity(
      agencyId, null, req.user.id, 'property_imported',
      `Propiedad "${data.title}" importada desde ${source || 'portal'}. Precio: ${data.price}€. URL: ${url}`,
      { property_id: id, source: source || 'imported_url', import_method: 'url', external_id: data.externalId, url }
    );

    res.status(201).json({ created: [property], duplicates: [], errors: [] });
  } catch (error) {
    console.error('Error importing from URL:', error);
    res.status(500).json({ error: 'Error al importar propiedad desde URL.' });
  }
});

// POST /api/properties/import/idealista — Import from Idealista (API mode)
router.post('/import/idealista', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de URLs.' });
    }

    const agencyId = req.user.agency_id;
    const results = [];
    const errors = [];

    for (const url of urls) {
      try {
        // Check duplicate
        const dup = get('SELECT id FROM properties WHERE external_url = @url AND agency_id = @agency_id', { url, agency_id: agencyId });
        if (dup) {
          errors.push({ url, error: 'Ya importada', property_id: dup.id });
          continue;
        }

        let title = 'Propiedad desde Idealista';
        let city = '';
        let zone = '';
        let price = 0;
        let propertyType = 'apartment';
        let operationType = 'sale';
        let description = '';
        let externalId = '';

        try {
          const urlObj = new URL(url);
          const pathMatch = urlObj.pathname.match(/\/(\d+)/);
          if (pathMatch) externalId = pathMatch[1];
          if (urlObj.hostname.includes('alquiler') || urlObj.pathname.includes('alquiler')) operationType = 'rent';

          const segments = urlObj.pathname.split('/').filter(Boolean);
          if (segments.length > 0) {
            const cityZone = segments[segments.length - 2] || '';
            if (cityZone) {
              const parts = cityZone.split('-');
              city = parts[0] || '';
              zone = parts.slice(1).join(' ') || null;
            }
            const typeSegment = segments.find(s => ['pisos', 'casas', 'locales', 'oficinas', 'terrenos', 'naves'].includes(s));
            if (typeSegment) {
              const typeMap = { pisos: 'apartment', casas: 'house', locales: 'commercial', oficinas: 'office', terrenos: 'land', naves: 'warehouse' };
              propertyType = typeMap[typeSegment] || 'apartment';
            }
          }

          try {
            const response = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(8000),
            });
            if (response.ok) {
              const html = await response.text();
              const titleMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
              if (titleMatch) title = titleMatch[1].substring(0, 200);
              const priceMatch = html.match(/(\d[\d.]*)\s*€/);
              if (priceMatch) price = parseInt(priceMatch[1].replace(/\./g, ''));
              const descMatch = html.match(/"description"\s*:\s*"([^"]+)"/);
              if (descMatch) description = descMatch[1].substring(0, 1000);
            }
          } catch (fetchErr) { /* non-blocking */ }
        } catch (parseErr) { /* non-blocking */ }

        const id = uuidv4();
        run(
          `INSERT INTO properties (
            id, agency_id, title, description, price, type, operation_type,
            city, zone, source, external_source, external_id, external_url,
            status, imported_at, created_at
          ) VALUES (
            @id, @agency_id, @title, @description, @price, @type, @operation_type,
            @city, @zone, 'idealista', 'idealista', @external_id, @external_url,
            'disponible', datetime('now'), datetime('now')
          )`,
          {
            id, agency_id: agencyId,
            title: title || 'Propiedad desde Idealista',
            description: description || null,
            price: price || 0,
            type: propertyType,
            operation_type: operationType,
            city: city || 'Sin especificar',
            zone: zone || null,
            external_id: externalId || null,
            external_url: url,
          }
        );

        const property = get('SELECT * FROM properties WHERE id = @id', { id });
        results.push(property);

        logActivity(
          agencyId, null, req.user.id, 'property_imported',
          `Propiedad "${title}" importada desde Idealista.`,
          { property_id: id, source: 'idealista', import_method: 'api', external_id: externalId, url }
        );
      } catch (itemErr) {
        errors.push({ url, error: itemErr.message });
      }
    }

    res.status(201).json({ imported: results, errors, total: urls.length, success: results.length });
  } catch (error) {
    console.error('Error importing from Idealista:', error);
    res.status(500).json({ error: 'Error al importar propiedades desde Idealista.' });
  }
});

// POST /api/properties/import/csv — Import properties from CSV data
router.post('/import/csv', async (req, res) => {
  try {
    const { csv_data } = req.body;
    if (!csv_data) return res.status(400).json({ error: 'Se requieren datos CSV.' });

    const agencyId = req.user.agency_id;
    const lines = csv_data.split('\n').filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV debe tener cabecera y al menos una fila.' });

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const results = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

        const externalUrl = row.url || row.external_url || row.link || '';
        if (externalUrl) {
          const dup = get('SELECT id FROM properties WHERE external_url = @url AND agency_id = @agency_id', { url: externalUrl, agency_id: agencyId });
          if (dup) {
            errors.push({ row: i, error: 'URL duplicada', property_id: dup.id });
            continue;
          }
        }

        const externalId = row.external_id || row.id_idealista || row.id_externo || '';
        if (externalId && externalUrl) {
          const dup2 = get('SELECT id FROM properties WHERE external_id = @eid AND agency_id = @agency_id', { eid: externalId, agency_id: agencyId });
          if (dup2) {
            errors.push({ row: i, error: 'ID externo duplicado', property_id: dup2.id });
            continue;
          }
        }

        const typeMap = { piso: 'apartment', casa: 'house', ático: 'penthouse', estudio: 'studio', dúplex: 'duplex', adosado: 'townhouse', villa: 'villa', terreno: 'land', local: 'commercial', oficina: 'office', garaje: 'garage', nave: 'warehouse' };
        const rawType = (row.tipo || row.type || 'apartment').toLowerCase();
        const propertyType = typeMap[rawType] || rawType;

        const opMap = { venta: 'sale', alquiler: 'rent', compra: 'sale' };
        const rawOp = (row.operacion || row.operation || row.operation_type || 'sale').toLowerCase();
        const operationType = opMap[rawOp] || rawOp;

        const id = uuidv4();
        // Detect source: if CSV has a 'source' or 'portal' column, use it; otherwise 'csv'
        const csvSource = row.source || row.portal || 'csv';
        const boolVal = (v) => { if (v === undefined || v === null) return 0; if (typeof v === 'boolean') return v ? 1 : 0; const n = parseInt(v); return isNaN(n) ? (v ? 1 : 0) : n ? 1 : 0; };
        run(
          `INSERT INTO properties (
            id, agency_id, title, description, price, type, operation_type,
            city, zone, address, province, postal_code,
            bedrooms, bathrooms, surface, floor,
            has_elevator, has_terrace, has_garage, condition,
            features, images, public_url,
            source, external_source, external_id, external_url,
            status, imported_at, created_at
          ) VALUES (
            @id, @agency_id, @title, @description, @price, @type, @operation_type,
            @city, @zone, @address, @province, @postal_code,
            @bedrooms, @bathrooms, @surface, @floor,
            @has_elevator, @has_terrace, @has_garage, @condition,
            @features, @images, @public_url,
            @source, @source, @external_id, @external_url,
            'disponible', datetime('now'), datetime('now')
          )`,
          {
            id, agency_id: agencyId,
            title: row.titulo || row.title || 'Propiedad importada',
            description: row.descripcion || row.description || null,
            price: parseFloat(row.precio || row.price || 0),
            type: propertyType,
            operation_type: operationType,
            city: row.ciudad || row.city || 'Sin especificar',
            zone: row.zona || row.zone || null,
            address: row.direccion || row.address || null,
            province: row.provincia || row.province || null,
            postal_code: row.codigo_postal || row.postal_code || row.cp || null,
            bedrooms: parseInt(row.habitaciones || row.bedrooms || 0),
            bathrooms: parseInt(row.banos || row.bathrooms || row.baños || 0),
            surface: parseFloat(row.superficie || row.surface || row.metros || row.m2 || 0),
            floor: row.planta || row.floor || null,
            has_elevator: boolVal(row.ascensor || row.has_elevator || row.elevator),
            has_terrace: boolVal(row.terraza || row.has_terrace || row.terrace),
            has_garage: boolVal(row.garaje || row.has_garage || row.garage),
            condition: row.estado || row.condition || row.conservacion || null,
            features: row.caracteristicas || row.features || null,
            images: row.imagenes || row.images || row.fotos || null,
            public_url: row.url_publica || row.public_url || null,
            source: csvSource,
            external_id: externalId || null,
            external_url: externalUrl || null,
          }
        );

        const property = get('SELECT * FROM properties WHERE id = @id', { id });
        results.push(property);

        logActivity(
          agencyId, null, req.user.id, 'property_imported',
          `Propiedad "${property.title}" importada desde CSV (${csvSource}).`,
          { property_id: id, source: csvSource, import_method: 'csv' }
        );
      } catch (rowErr) {
        errors.push({ row: i, error: rowErr.message });
      }
    }

    res.status(201).json({ imported: results, errors, total: lines.length - 1, success: results.length });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Error al importar propiedades desde CSV.' });
  }
});

// POST /api/properties/:id/match-leads — Find compatible leads for a property
router.post('/:id/match-leads', (req, res) => {
  try {
    const property = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    let sql = `SELECT l.* FROM leads l
               WHERE l.agency_id = @agency_id
               AND l.status NOT IN ('cerrado')`;
    const params = { agency_id: req.user.agency_id };

    if (property.city) {
      sql += ' AND (l.zone LIKE @zone OR l.property_type LIKE @type OR l.zones LIKE @zone)';
      params.zone = `%${property.city}%`;
      params.type = `%${property.type}%`;
    }
    if (property.price > 0) {
      sql += ' AND (l.budget IS NULL OR l.budget_max IS NULL OR (l.budget <= @max_price AND (l.budget_max IS NULL OR l.budget_max >= @min_price)))';
      params.max_price = property.price * 1.2;
      params.min_price = property.price * 0.8;
    }
    if (property.operation_type) {
      sql += ' AND (l.operation_type IS NULL OR l.operation_type = @op)';
      params.op = property.operation_type;
    }
    if (property.type) {
      sql += ' AND (l.property_type IS NULL OR l.property_type = @ptype)';
      params.ptype = property.type;
    }

    sql += ' ORDER BY l.ia_score DESC, l.created_at DESC LIMIT 20';
    const leads = all(sql, params);

    res.json({ property, leads, total: leads.length });
  } catch (error) {
    console.error('Error matching leads:', error);
    res.status(500).json({ error: 'Error al buscar leads compatibles.' });
  }
});

// Legacy match-lead endpoint (kept for backwards compatibility)
router.post('/match-lead', async (req, res) => {
  try {
    const { lead_id, filters } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'Se requiere lead_id.' });

    const agencyId = req.user.agency_id;
    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id',
      { id: lead_id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    let sql = "SELECT * FROM properties WHERE status = 'disponible'";
    const params = {};
    sql += ' AND agency_id = @agency_id'; params.agency_id = agencyId;
    if (lead.zone) { sql += ' AND (zone LIKE @zone OR city LIKE @zone)'; params.zone = `%${lead.zone}%`; }
    if (lead.budget) {
      sql += ' AND price <= @max_price';
      params.max_price = lead.budget * 1.2;
    }
    if (filters) {
      if (filters.min_price) { sql += ' AND price >= @min_price'; params.min_price = filters.min_price; }
      if (filters.max_price) { sql += ' AND price <= @max_price2'; params.max_price2 = filters.max_price; }
      if (filters.bedrooms) { sql += ' AND bedrooms >= @bedrooms'; params.bedrooms = filters.bedrooms; }
      if (filters.type) { sql += ' AND type = @type'; params.type = filters.type; }
      if (filters.city) { sql += ' AND city LIKE @city'; params.city = `%${filters.city}%`; }
    }

    const properties = all(sql, params);

    let matchResult = null;
    if (properties.length > 0) {
      try {
        matchResult = await generatePropertyMatch(lead, properties);
      } catch (e) {
        matchResult = 'No se pudo generar match automático.';
      }
    }

    res.json({ lead, properties, match: matchResult });
  } catch (error) {
    console.error('Error matching properties:', error);
    res.status(500).json({ error: 'Error al buscar propiedades compatibles.' });
  }
});

// POST /api/properties/:id/duplicate — Duplicate a property
router.post('/:id/duplicate', (req, res) => {
  try {
    const existing = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const newId = uuidv4();
    const newTitle = `${existing.title} (copia)`;
    run(
      `INSERT INTO properties (
        id, agency_id, office_id, title, description, price, type, operation_type,
        city, zone, address, province, postal_code, bedrooms, bathrooms, surface,
        floor, has_elevator, has_terrace, has_garage, condition,
        features, images, public_url, status, source, created_at
      ) VALUES (
        @id, @agency_id, @office_id, @title, @description, @price, @type, @operation_type,
        @city, @zone, @address, @province, @postal_code, @bedrooms, @bathrooms, @surface,
        @floor, @has_elevator, @has_terrace, @has_garage, @condition,
        @features, @images, @public_url, @status, @source, datetime('now')
      )`,
      {
        id: newId, agency_id: req.user.agency_id, office_id: existing.office_id,
        title: newTitle, description: existing.description, price: existing.price,
        type: existing.type, operation_type: existing.operation_type,
        city: existing.city, zone: existing.zone, address: existing.address,
        province: existing.province, postal_code: existing.postal_code,
        bedrooms: existing.bedrooms, bathrooms: existing.bathrooms, surface: existing.surface,
        floor: existing.floor,
        has_elevator: existing.has_elevator, has_terrace: existing.has_terrace, has_garage: existing.has_garage,
        condition: existing.condition, features: existing.features, images: existing.images,
        public_url: existing.public_url, status: 'disponible', source: existing.source,
      }
    );

    const property = get('SELECT * FROM properties WHERE id = @id', { id: newId });

    logActivity(
      req.user.agency_id, null, req.user.id, 'property_duplicated',
      `Propiedad "${existing.title}" duplicada como "${newTitle}".`,
      { property_id: newId, original_id: req.params.id }
    );

    res.status(201).json(property);
  } catch (error) {
    console.error('Error duplicating property:', error);
    res.status(500).json({ error: 'Error al duplicar propiedad.' });
  }
});

// PATCH /api/properties/:id/status — Quick status change
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['disponible', 'reservado', 'vendido', 'alquilado'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido.' });
    }

    const existing = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    run("UPDATE properties SET status = @status, updated_at = datetime('now') WHERE id = @id", {
      id: req.params.id, status,
    });

    logActivity(
      req.user.agency_id, null, req.user.id, 'property_status_changed',
      `Propiedad "${existing.title}" cambió de estado a "${status}".`,
      { property_id: req.params.id, old_status: existing.status, new_status: status }
    );

    const property = get('SELECT * FROM properties WHERE id = @id', { id: req.params.id });
    res.json(property);
  } catch (error) {
    console.error('Error changing property status:', error);
    res.status(500).json({ error: 'Error al cambiar estado.' });
  }
});

// POST /api/properties/:id/share — Generate share link
router.post('/:id/share', (req, res) => {
  try {
    const existing = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const shareToken = uuidv4().replace(/-/g, '').substring(0, 12);
    const publicUrl = `${req.protocol}://${req.get('host')}/share/${shareToken}`;

    run('UPDATE properties SET public_url = @url, updated_at = datetime(\'now\') WHERE id = @id', {
      id: req.params.id, url: publicUrl,
    });

    logActivity(
      req.user.agency_id, null, req.user.id, 'property_shared',
      `Enlace público generado para "${existing.title}".`,
      { property_id: req.params.id, public_url: publicUrl }
    );

    res.json({ public_url: publicUrl, share_token: shareToken });
  } catch (error) {
    console.error('Error sharing property:', error);
    res.status(500).json({ error: 'Error al generar enlace público.' });
  }
});

// POST /api/properties/:id/generate-description — AI description
router.post('/:id/generate-description', async (req, res) => {
  try {
    const existing = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const promptData = {
      type: existing.type,
      operation: existing.operation_type === 'sale' ? 'venta' : 'alquiler',
      city: existing.city,
      zone: existing.zone,
      bedrooms: existing.bedrooms,
      bathrooms: existing.bathrooms,
      surface: existing.surface,
      price: existing.price,
      features: existing.features ? JSON.parse(existing.features) : [],
      floor: existing.floor,
      has_elevator: existing.has_elevator,
      condition: existing.condition,
    };

    const prompt = `Genera una descripción comercial en español para un inmueble en ${promptData.city}${promptData.zone ? ', ' + promptData.zone : ''}. Tipo: ${promptData.type}. Operación: ${promptData.operation}. Habitaciones: ${promptData.bedrooms || 'N/A'}. Baños: ${promptData.bathrooms || 'N/A'}. Superficie: ${promptData.surface || 'N/A'} m². Precio: ${promptData.price}€. Características: ${promptData.features.join(', ') || 'N/A'}. Máximo 200 palabras, tono profesional y atractivo.`;

    // Use the Claude service if available, otherwise use a template
    let description;
    try {
      const { generatePropertyMatch } = await import('../services/claude.js');
      description = await generatePropertyMatch(prompt);
    } catch {
      description = `Precioso inmueble en ${promptData.city}${promptData.zone ? ', ' + promptData.zone : ''} de ${promptData.bedrooms || 'N/A'} habitaciones y ${promptData.bathrooms || 'N/A'} baños. Con una superficie de ${promptData.surface || 'N/A'} m², esta propiedad ofrece un espacio ideal para usted y su familia. Con un precio de ${promptData.price}€, no deje pasar esta oportunidad única.`;
    }

    logActivity(
      req.user.agency_id, null, req.user.id, 'description_generated',
      `Descripción generada con IA para "${existing.title}".`,
      { property_id: req.params.id }
    );

    res.json({ description });
  } catch (error) {
    console.error('Error generating description:', error);
    res.status(500).json({ error: 'Error al generar descripción.' });
  }
});

// POST /api/properties/csv-preview — Preview CSV data before import
router.post('/csv-preview', (req, res) => {
  try {
    const { csv_data } = req.body;
    if (!csv_data) return res.status(400).json({ error: 'Se requieren datos CSV.' });

    const lines = csv_data.split('\n').filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV debe tener cabecera y al menos una fila.' });

    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
    const rows = [];

    for (let i = 1; i < Math.min(lines.length, 11); i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      rows.push(row);
    }

    res.json({ headers, rows, total: lines.length - 1, preview_count: rows.length });
  } catch (error) {
    console.error('Error previewing CSV:', error);
    res.status(500).json({ error: 'Error al previsualizar CSV.' });
  }
});

// ────────── INTERESTS (property-lead relationships) ──────────

// GET /api/properties/:id/interests — Leads interested in this property
router.get('/:id/interests', (req, res) => {
  try {
    const property = get('SELECT id FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const interests = all(
      `SELECT pi.*, l.name as lead_name, l.phone as lead_phone, l.email as lead_email,
              l.status as lead_status, l.ia_score as lead_score, l.source as lead_source,
              l.last_activity as lead_last_activity, l.assigned_to as lead_assigned
       FROM property_interests pi
       JOIN leads l ON l.id = pi.lead_id
       WHERE pi.property_id = @pid AND pi.agency_id = @aid
       ORDER BY pi.created_at DESC`,
      { pid: req.params.id, aid: req.user.agency_id }
    );

    res.json(interests);
  } catch (error) {
    console.error('Error listing interests:', error);
    res.status(500).json({ error: 'Error al obtener interesados.' });
  }
});

// POST /api/properties/:id/interests — Mark a lead as interested
router.post('/:id/interests', (req, res) => {
  try {
    const { lead_id, channel, notes } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'Se requiere lead_id.' });

    const property = get('SELECT id, title FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const lead = get('SELECT id FROM leads WHERE id = @id AND agency_id = @agency_id', {
      id: lead_id, agency_id: req.user.agency_id,
    });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const existing = get('SELECT id FROM property_interests WHERE property_id = @pid AND lead_id = @lid', {
      pid: req.params.id, lid: lead_id,
    });
    if (existing) return res.status(409).json({ error: 'El lead ya está registrado como interesado.', id: existing.id });

    const id = uuidv4();
    run(
      `INSERT INTO property_interests (id, property_id, lead_id, agency_id, status, channel, notes, created_at)
       VALUES (@id, @pid, @lid, @aid, 'interested', @channel, @notes, datetime('now'))`,
      { id, pid: req.params.id, lid: lead_id, aid: req.user.agency_id, channel: channel || null, notes: notes || null }
    );

    logActivity(
      req.user.agency_id, lead_id, req.user.id, 'property_interest',
      `Lead interesado en propiedad "${property.title}".`,
      { property_id: req.params.id, lead_id }
    );

    const interest = get('SELECT * FROM property_interests WHERE id = @id', { id });
    res.status(201).json(interest);
  } catch (error) {
    console.error('Error creating interest:', error);
    res.status(500).json({ error: 'Error al registrar interés.' });
  }
});

// DELETE /api/properties/:id/interests/:interestId — Remove interest
router.delete('/:id/interests/:interestId', (req, res) => {
  try {
    const interest = get('SELECT * FROM property_interests WHERE id = @id AND property_id = @pid AND agency_id = @aid', {
      id: req.params.interestId, pid: req.params.id, aid: req.user.agency_id,
    });
    if (!interest) return res.status(404).json({ error: 'Interés no encontrado.' });

    run('DELETE FROM property_interests WHERE id = @id', { id: req.params.interestId });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting interest:', error);
    res.status(500).json({ error: 'Error al eliminar interés.' });
  }
});

// ────────── PROPERTY STATS ──────────
// GET /api/properties/:id/stats — Property-specific metrics
router.get('/:id/stats', (req, res) => {
  try {
    const property = get('SELECT id, title, created_at, status FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const interestedCount = get('SELECT COUNT(*) as c FROM property_interests WHERE property_id = @pid AND agency_id = @aid', {
      pid: req.params.id, aid: req.user.agency_id,
    }).c;

    const compatibleCount = get(
      `SELECT COUNT(*) as c FROM leads l
       WHERE l.agency_id = @aid AND l.status NOT IN ('cerrado','perdido')
       AND (l.zone LIKE @zone OR l.budget >= @min_price OR l.operation_type = @op OR l.property_type = @ptype)`,
      {
        aid: req.user.agency_id, zone: `%${property.city || ''}%`,
        min_price: 0, op: '', ptype: '',
      }
    ).c;

    const daysPublished = Math.floor((Date.now() - new Date(property.created_at).getTime()) / 86400000);

    res.json({
      interested_count: interestedCount,
      compatible_count: compatibleCount,
      days_published: daysPublished,
      status: property.status,
    });
  } catch (error) {
    console.error('Error getting property stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

// ────────── MARKETING / AI ENDPOINTS ──────────

// POST /api/properties/:id/generate-whatsapp — Generate WhatsApp message
router.post('/:id/generate-whatsapp', (req, res) => {
  try {
    const property = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const msg = `¡Hola! Te escribo desde *${req.user.name || 'nuestra agencia'}* para mostrarte una propiedad que creo que te puede interesar:%0A%0A*${property.title}*%0A📍 ${property.city}${property.zone ? ', ' + property.zone : ''}%0A💰 ${property.price}€${property.operation_type === 'rent' ? '/mes' : ''}%0A🛏️ ${property.bedrooms || 'N/A'} hab | 🛁 ${property.bathrooms || 'N/A'} baños | 📐 ${property.surface || 'N/A'} m²%0A%0A¿Te gustaría recibir más información o agendar una visita?`;
    const phone = req.body.phone || '';
    const waUrl = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${msg}` : null;

    res.json({ message: decodeURIComponent(msg), whatsapp_url: waUrl });
  } catch (error) {
    console.error('Error generating WhatsApp:', error);
    res.status(500).json({ error: 'Error al generar mensaje.' });
  }
});

// POST /api/properties/:id/generate-email — Generate email content
router.post('/:id/generate-email', (req, res) => {
  try {
    const property = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const features = property.features ? (() => { try { return JSON.parse(property.features).join(', ') } catch { return property.features } })() : '';
    const subject = `${property.operation_type === 'sale' ? 'Venta' : 'Alquiler'}: ${property.title} - ${property.price}€`;
    const body = `Hola,\n\nMe pongo en contacto con usted porque tenemos una propiedad que se ajusta a lo que busca:\n\n${property.title}\nPrecio: ${property.price}€ ${property.operation_type === 'rent' ? '/mes' : ''}\nUbicación: ${property.city}${property.zone ? ', ' + property.zone : ''}\nTipo: ${property.type}\nHabitaciones: ${property.bedrooms || 'N/A'} | Baños: ${property.bathrooms || 'N/A'}\nSuperficie: ${property.surface || 'N/A'} m²\n${features ? 'Características: ' + features : ''}\n${property.description ? '\n' + property.description : ''}\n\nQuedo a su disposición para cualquier consulta o para concertar una visita.\n\nSaludos,\n${req.user.name || 'Equipo comercial'}\n${req.user.email || ''}`;

    res.json({ subject, body, to: req.body.email || '' });
  } catch (error) {
    console.error('Error generating email:', error);
    res.status(500).json({ error: 'Error al generar email.' });
  }
});

// POST /api/properties/:id/generate-post — Generate social media post
router.post('/:id/generate-post', (req, res) => {
  try {
    const property = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const features = property.features ? (() => { try { return JSON.parse(property.features) } catch { return [] } })() : [];
    const hashtags = ['#inmobiliaria', '#propiedades', property.city ? '#' + property.city.replace(/\s/g, '') : '', property.type ? '#' + property.type : '', property.operation_type === 'sale' ? '#venta' : '#alquiler'].filter(Boolean).join(' ');

    const post = `🏠 *${property.title}*\n\n${property.description ? property.description.substring(0, 150) + '...' : ''}\n\n📍 ${property.city}${property.zone ? ', ' + property.zone : ''}\n💰 ${property.price}€ ${property.operation_type === 'rent' ? '/mes' : ''}\n🛏️ ${property.bedrooms || 'N/A'} dormitorios | 🛁 ${property.bathrooms || 'N/A'} baños\n📐 ${property.surface || 'N/A'} m²\n${features.length > 0 ? '✨ ' + features.slice(0, 4).join(' | ') : ''}\n\n📞 Contáctanos para más información o visita!\n\n${hashtags}`;

    res.json({ post });
  } catch (error) {
    console.error('Error generating post:', error);
    res.status(500).json({ error: 'Error al generar post.' });
  }
});

// ── AI AND MARKETING HELPER METHODS ──

function computeQualityScore(p) {
  let s = 0;
  const pImages = p.images ? (typeof p.images === 'string' ? p.images : JSON.stringify(p.images)) : '';
  if (pImages && pImages !== '[]' && pImages !== '') s += 20;
  if (p.description && p.description !== '') s += 20;
  if (p.price && p.price > 0) s += 20;
  if (p.city && p.city !== '') s += 15;
  if (p.surface && p.surface > 0) s += 10;
  if (p.bedrooms > 0) s += 5;
  if (p.bathrooms > 0) s += 5;
  if (p.has_elevator || p.has_terrace || p.has_garage) s += 5;
  return s;
}

async function callAIWithFallback({ systemPrompt, userMessage, json = false, mockGenerator }) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey && apiKey !== 'REEMPLAZA_CON_TU_OPENROUTER_KEY') {
      const response = await askAI({
        system: systemPrompt,
        userMessage,
        model: 'smart',
        json,
      });
      if (json) {
        try {
          return JSON.parse(response);
        } catch (e) {
          console.warn('[AI JSON Parse Error] falling back to mock:', e);
        }
      } else {
        return response;
      }
    }
  } catch (err) {
    console.error('[AI API Error] falling back to mock:', err.message);
  }
  return mockGenerator();
}

function generateMockPropertyFromDescription(desc) {
  const lowercase = desc.toLowerCase();
  
  let price = 120000;
  const priceMatches = lowercase.match(/(\d+[\d.,]*)\s*(?:euros|€|eur)/) || lowercase.match(/(?:precio|valor|cuesta)\s*(?:de\s*)?(\d+[\d.,]*)/);
  if (priceMatches) {
    const val = parseFloat(priceMatches[1].replace(/\./g, '').replace(/,/g, '.'));
    if (!isNaN(val)) price = val;
  } else {
    const genericMatches = lowercase.match(/\b\d{5,7}\b/);
    if (genericMatches) price = parseFloat(genericMatches[0]);
  }

  let bedrooms = 2;
  const bedMatches = lowercase.match(/(\d+)\s*(?:hab|dorm|habit|cuarto)/);
  if (bedMatches) bedrooms = parseInt(bedMatches[1]);

  let bathrooms = 1;
  const bathMatches = lowercase.match(/(\d+)\s*(?:bañ|aseo|toilet)/);
  if (bathMatches) bathrooms = parseInt(bathMatches[1]);

  let surface = 80;
  const surfMatches = lowercase.match(/(\d+)\s*(?:m2|m²|metro|mt)/);
  if (surfMatches) surface = parseInt(surfMatches[1]);

  let city = 'Madrid';
  const cities = ['madrid', 'barcelona', 'valencia', 'sevilla', 'zaragoza', 'málaga', 'murcia', 'palma', 'bilbao', 'alicante', 'granada', 'córdoba'];
  for (const c of cities) {
    if (lowercase.includes(c)) {
      city = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  let zone = 'Centro';
  if (lowercase.includes('centro')) zone = 'Centro';
  else if (lowercase.includes('salamanca')) zone = 'Barrio de Salamanca';
  else if (lowercase.includes('chamberi') || lowercase.includes('chamberí')) zone = 'Chamberí';
  else if (lowercase.includes('eixample')) zone = 'L\'Eixample';
  else if (lowercase.includes('gracia') || lowercase.includes('gràcia')) zone = 'Gràcia';
  else if (lowercase.includes('norte')) zone = 'Zona Norte';

  let type = 'apartment';
  const types = [
    { keywords: ['piso', 'departamento', 'apartamento'], val: 'apartment' },
    { keywords: ['casa', 'chalet', 'villa', 'adosado'], val: 'house' },
    { keywords: ['ático', 'atico'], val: 'penthouse' },
    { keywords: ['estudio', 'loft'], val: 'studio' },
    { keywords: ['dúplex', 'duplex'], val: 'duplex' },
    { keywords: ['local', 'comercio', 'tienda'], val: 'commercial' },
    { keywords: ['oficina', 'despacho'], val: 'office' },
    { keywords: ['terreno', 'solar', 'parcela'], val: 'land' },
  ];
  for (const t of types) {
    if (t.keywords.some(k => lowercase.includes(k))) {
      type = t.val;
      break;
    }
  }

  let operationType = 'sale';
  if (lowercase.includes('alquiler') || lowercase.includes('alquila') || lowercase.includes('rent')) {
    operationType = 'rent';
    if (price === 120000) price = 1200;
  }

  const typeLabels = { apartment: 'piso', house: 'chalet', penthouse: 'ático', studio: 'estudio', duplex: 'dúplex', commercial: 'local comercial', office: 'oficina', land: 'terreno' };
  const label = typeLabels[type] || 'piso';
  const opLabel = operationType === 'sale' ? 'en venta' : 'en alquiler';

  const title = `Espectacular ${label} ${opLabel} en ${city} (${zone})`;
  const description = `Te presentamos esta increíble oportunidad de adquirir un ${label} en una de las mejores zonas de ${city}.\n\nConsta de ${bedrooms} amplias habitaciones y ${bathrooms} baños completos, cocina totalmente amueblada y un salón-comedor muy luminoso. Con una superficie total de ${surface} m², la vivienda destaca por su excelente luminosidad natural durante todo el día.\n\nUbicado en una zona residencial tranquila con todos los servicios a mano: colegios, supermercados, zonas verdes y una inmejorable conexión con el transporte público. ¡No dejes pasar esta oportunidad y ven a visitarlo sin compromiso!`;

  const has_terrace = lowercase.includes('terraza') || lowercase.includes('balcón') || lowercase.includes('balcon') ? 1 : 0;
  const has_elevator = lowercase.includes('ascensor') || lowercase.includes('elevador') ? 1 : 0;
  const has_garage = lowercase.includes('garaje') || lowercase.includes('parking') || lowercase.includes('cochera') ? 1 : 0;

  const features = ['Calefacción', 'Luminoso'];
  if (has_terrace) features.push('Terraza');
  if (has_elevator) features.push('Ascensor');
  if (has_garage) features.push('Garaje');
  if (lowercase.includes('aire')) features.push('Aire acondicionado');
  if (lowercase.includes('piscina')) features.push('Piscina');
  if (lowercase.includes('armarios')) features.push('Armarios empotrados');

  const marketing = {
    whatsapp: `🏠 *NUEVA PROPIEDAD DISPONIBLE* 🏠\n\n*${title}*\n📍 Ubicación: ${city}, ${zone}\n💰 Precio: ${price.toLocaleString('es-ES')}€\n🛏️ ${bedrooms} Hab | 🛁 ${bathrooms} Baños | 📐 ${surface} m²\n\n¡Un inmueble espectacular listo para entrar a vivir! ¿Te gustaría recibir más información o programar una visita hoy mismo? Escríbeme y te comento todos los detalles.`,
    email_subject: `Oportunidad única en ${city}: ${title}`,
    email_body: `Estimado cliente,\n\nQueremos presentarte en primicia un inmueble que acaba de entrar en nuestra cartera y que creemos que encaja perfectamente con lo que buscas:\n\n*${title}*\n\nSe trata de un inmueble de tipo ${label} con ${bedrooms} dormitorios, ${bathrooms} baños y una superficie de ${surface} m² construidos, situado en una ubicación privilegiada en ${city} (${zone}).\n\nCuenta con acabados de primera calidad, excelente iluminación y extras muy valorados como ${features.join(', ')}.\n\nSi deseas concertar una visita o recibir la ficha completa con fotos detalladas, responde directamente a este correo o llámanos lo antes posible.\n\nAtentamente,\nEl Equipo de Captación`,
    social_post: `🔥 ¡Acaba de entrar al mercado! 🔥\n\nNo te pierdas esta joya de ${label} en ${city} (${zone}). \n\n✨ Características destacadas:\n✅ ${bedrooms} habitaciones y ${bathrooms} baños\n✅ ${surface} m² perfectamente aprovechados\n✅ Detalles de confort: ${features.join(', ')}\n💰 Precio irresistible: ${price.toLocaleString('es-ES')}€\n\n¡Ideal para crear el hogar de tus sueños o para una inversión de alta rentabilidad!\n\nEnvíanos un mensaje privado 📩 o haz clic en el enlace de nuestra biografía para ver más fotos.\n\n#inmobiliaria #realestate #casa #oportunidad #${city.toLowerCase()}`,
    google_ads: `¿Buscas ${label} en ${city}? - ${bedrooms} Hab, ${surface}m² por ${price.toLocaleString('es-ES')}€. Visítalo ya.`,
    title_alternative: `${label} exterior reformado con encanto en ${city} ${zone}`,
    summary: `Hermoso ${label} en ${city} con ${bedrooms} habitaciones, ${bathrooms} baños y ${surface} m² construidos.`,
    seo_meta: `Compra o alquila este increíble ${label} de ${surface}m² en ${city} (${zone}). ${bedrooms} habitaciones, cocina amueblada y excelente ubicación. ¡Infórmate sin compromiso!`,
    puntos_fuertes: ['Ubicación privilegiada con acceso a servicios', 'Distribución excelente sin pasillos perdidos', 'Excelente luminosidad natural en todas las estancias', 'Listo para entrar a vivir sin reformas'],
    sugerencias: ['Pintar estancias en tonos neutros para maximizar la luz', 'Añadir elementos de Home Staging para la sesión de fotos', 'Destacar la cercanía a transporte público en los anuncios'],
    publico_objetivo: 'Ideal para familias jóvenes o profesionales que buscan vivir cerca del centro de la ciudad con todas las comodidades.',
  };

  return {
    fields: {
      title,
      description,
      price,
      type,
      operation_type: operationType,
      city,
      zone,
      bedrooms,
      bathrooms,
      surface,
      has_elevator,
      has_terrace,
      has_garage,
      condition: 'buen_estado',
      features,
    },
    marketing,
  };
}

function generateMockImprovement(property) {
  const currentTitle = property.title || 'Propiedad sin título';
  const currentDesc = property.description || 'Sin descripción';
  const currentPrice = property.price || 0;
  
  const score = computeQualityScore(property);
  const checklist = [
    { item: 'Añadir imágenes de alta definición', completed: (property.images && property.images !== '[]' && property.images !== '') ? 1 : 0 },
    { item: 'Redactar una descripción comercial atractiva', completed: (property.description && property.description.length > 50) ? 1 : 0 },
    { item: 'Fijar un precio de mercado realista', completed: property.price > 0 ? 1 : 0 },
    { item: 'Detallar la superficie del inmueble', completed: property.surface > 0 ? 1 : 0 },
    { item: 'Completar la ubicación exacta del inmueble', completed: property.city ? 1 : 0 },
    { item: 'Listar habitaciones, baños y extras', completed: (property.bedrooms > 0 && property.bathrooms > 0) ? 1 : 0 },
  ];

  const before = {
    title: currentTitle,
    description: currentDesc,
    price: currentPrice,
    features: property.features ? (typeof property.features === 'string' ? JSON.parse(property.features) : property.features) : [],
  };

  const improvedTitle = currentTitle.includes('mejorado') || currentTitle.includes('espectacular') 
    ? currentTitle 
    : `Espectacular ${currentTitle} totalmente exterior y muy luminoso`;

  const improvedDesc = currentDesc.length > 20
    ? `✨ DESTACADO INMUEBLE EXCLUSIVO ✨\n\n${currentDesc}\n\nEste inmueble destaca por su excelente ubicación y distribución idónea, perfecto para disfrutar de la máxima comodidad diaria. Las estancias son exteriores y disponen de acabados de primera calidad, asegurando un ambiente cálido y confortable.`
    : `Te presentamos una magnífica oportunidad en una zona inmejorable. Un inmueble ideal tanto para primera residencia como para inversión de alta rentabilidad. Dispone de estancias muy luminosas, ventilación excelente y distribución sin metros perdidos. Zona excelentemente comunicada con todo tipo de comercios y transportes.`;

  const suggestedPrice = currentPrice > 0 ? currentPrice : 150000;
  
  const after = {
    title: improvedTitle,
    description: improvedDesc,
    price: suggestedPrice,
    features: [...before.features, 'Excelente distribución', 'Ubicación Premium', 'Vistas despejadas'].slice(0, 7),
  };

  return {
    scoreBefore: score,
    scoreAfter: Math.min(score + 25, 100),
    checklist,
    before,
    after,
    target_client: 'Familias jóvenes y profesionales de mediana edad que valoran la luz natural, la conectividad urbana y zonas comunitarias.',
    leads_compatible_count: 5,
    improvements_suggested: [
      'Actualizar el título comercial para que sea más evocador y destaque su luminosidad.',
      'Ampliar la descripción comercial para evocar emociones, describiendo el estilo de vida de la zona.',
      'Realizar una sesión fotográfica profesional o home staging virtual en las estancias oscuras.',
      'Destacar la facilidad de aparcamiento y cercanía a estaciones principales en la primera línea.',
    ]
  };
}

// ── ENDPOINTS AI & MARKETING ──

// POST /api/properties/create-ai — Structured AI Listing from short snippet
router.post('/create-ai', async (req, res) => {
  try {
    const { description: snippet } = req.body;
    if (!snippet) return res.status(400).json({ error: 'Se requiere una descripción o snippet.' });

    const systemPrompt = `Eres un asistente de IA experto en redacción de anuncios inmobiliarios premium. Analiza el fragmento de texto proveído por el usuario y genera un anuncio inmobiliario perfectamente estructurado. Debes devolver la información en formato JSON puro con los campos: "fields" (contiene "title", "description", "price", "type", "operation_type", "city", "zone", "bedrooms", "bathrooms", "surface", "has_elevator", "has_terrace", "has_garage", "features" [array]) y "marketing" (contiene "whatsapp", "email_subject", "email_body", "social_post", "google_ads", "title_alternative", "summary", "seo_meta", "puntos_fuertes" [array], "sugerencias" [array], "publico_objetivo"). Responde en español.`;

    const result = await callAIWithFallback({
      systemPrompt,
      userMessage: snippet,
      json: true,
      mockGenerator: () => generateMockPropertyFromDescription(snippet),
    });

    res.json(result);
  } catch (error) {
    console.error('Error in create-ai endpoint:', error);
    res.status(500).json({ error: 'Error al generar anuncio con IA.' });
  }
});

// POST /api/properties/:id/improve-ai — Suggest Improvements and compare Antes/Después
router.post('/:id/improve-ai', async (req, res) => {
  try {
    const property = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const systemPrompt = `Eres un consultor inmobiliario experto. Analiza los datos del inmueble proveído en formato JSON y devuelve sugerencias de mejora comercial, detecta campos incompletos, redacta un mejor título y una mejor descripción y estima un cliente ideal. Debes devolver la respuesta en formato JSON con los campos: "scoreBefore", "scoreAfter", "checklist" (array de objetos {item: string, completed: 0|1}), "before" ({title, description, price}), "after" ({title, description, price, features}), "target_client", "leads_compatible_count" (número), "improvements_suggested" (array de strings). Responde en español.`;

    const result = await callAIWithFallback({
      systemPrompt,
      userMessage: JSON.stringify(property),
      json: true,
      mockGenerator: () => generateMockImprovement(property),
    });

    res.json(result);
  } catch (error) {
    console.error('Error in improve-ai endpoint:', error);
    res.status(500).json({ error: 'Error al optimizar propiedad con IA.' });
  }
});

// POST /api/properties/:id/marketing — Generate individual marketing assets
router.post('/:id/marketing', async (req, res) => {
  try {
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'Se requiere una acción o tipo de asset.' });

    const property = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const propData = {
      title: property.title,
      description: property.description || '',
      price: property.price,
      operation: property.operation_type === 'sale' ? 'Venta' : 'Alquiler',
      type: property.type,
      city: property.city,
      zone: property.zone || '',
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      surface: property.surface,
      features: property.features ? (typeof property.features === 'string' ? JSON.parse(property.features) : property.features) : [],
    };

    const actionPrompts = {
      idealista_desc: `Redacta una descripción altamente comercial e impactante ideal para publicar en el portal Idealista para la propiedad: ${JSON.stringify(propData)}. Debe ser atractiva, estructurada con viñetas y un llamado a la acción.`,
      fotocasa_desc: `Redacta una descripción ideal para el portal Fotocasa destacando la calidez del hogar y la calidad de vida de la zona: ${JSON.stringify(propData)}.`,
      whatsapp: `Crea un mensaje publicitario y amigable de WhatsApp listo para compartir con clientes potenciales: ${JSON.stringify(propData)}. Usa emojis y saltos de línea.`,
      email: `Escribe un correo de ventas formal y persuasivo ofreciendo esta propiedad a un comprador compatible: ${JSON.stringify(propData)}. Incluye línea de asunto y cuerpo estructurado.`,
      instagram: `Escribe una publicación corta e inspiradora para Instagram con hashtags relevantes: ${JSON.stringify(propData)}.`,
      facebook: `Escribe un post detallado para un grupo de Facebook inmobiliario: ${JSON.stringify(propData)}.`,
      google_ads: `Crea títulos y descripciones cortas optimizadas para una campaña de Google Ads: ${JSON.stringify(propData)}.`,
      title_alternative: `Genera 5 títulos alternativos ultra atractivos y comerciales para portales inmobiliarios: ${JSON.stringify(propData)}.`,
      summary_short: `Genera una ficha resumen corta (menos de 60 palabras): ${JSON.stringify(propData)}.`,
      pdf_sheet: `Genera un texto elegante estructurado en secciones (Introducción, Ficha Técnica, Ubicación, Puntos Destacados) ideal para imprimir en un folleto o dossier de venta PDF: ${JSON.stringify(propData)}.`,
      analyze_quality: `Analiza detalladamente la calidad del anuncio y devuelve un reporte y puntuación del 1 al 100 indicando qué mejorar: ${JSON.stringify(propData)}.`,
      suggest_improvements: `Enumera un checklist de mejoras urgentes de Home Staging y comercialización para vender o alquilar más rápido: ${JSON.stringify(propData)}.`,
      target_buyer: `Analiza los datos y describe detalladamente el tipo de cliente / comprador ideal y la estrategia para captarlo: ${JSON.stringify(propData)}.`,
      campaign_ideas: `Genera 3 ideas de campañas publicitarias creativas online y offline para promocionar este inmueble: ${JSON.stringify(propData)}.`,
      whatsapp_share: `Escribe un texto de WhatsApp corto y directo ideal para que los leads lo compartan con sus parejas o familiares: ${JSON.stringify(propData)}.`,
      email_compatibles: `Escribe un email dirigido específicamente a leads compatibles en la base de datos que ya buscan algo similar en la misma zona: ${JSON.stringify(propData)}.`,
    };

    const promptText = actionPrompts[action] || `Genera material de marketing de tipo ${action} para la propiedad: ${JSON.stringify(propData)}`;

    const textResult = await callAIWithFallback({
      systemPrompt: 'Eres un especialista en marketing inmobiliario experto en escribir copias persuasivas de alta conversión. Responde únicamente con el texto generado, bien estructurado y en español.',
      userMessage: promptText,
      json: false,
      mockGenerator: () => {
        const mockProps = generateMockPropertyFromDescription(`${property.title} en ${property.city} ${property.zone}`);
        const assets = mockProps.marketing;
        if (action === 'idealista_desc') return `🏠 ¡VIVIENDA EXCLUSIVA EN ${propData.city.toUpperCase()}!\n\nSe vende espectacular ${propData.type} exterior de ${propData.surface}m². Ubicado en una de las mejores zonas, destaca por su increíble luz natural.\n\n✨ DETALLES CLAVE:\n• ${propData.bedrooms} dormitorios confortables\n• ${propData.bathrooms} cuartos de baño completos\n• Salón-comedor muy espacioso\n• Cocina amueblada y equipada\n• Extras incluidos: ${propData.features.join(', ') || 'luminosidad y calefacción'}\n\nUbicación privilegiada cerca de colegios, parques y transporte público. Ideal para familias o inversores que busquen valor seguro.\n\n📞 Contáctanos ahora y agenda tu visita sin compromiso. ¡Te enamorará!`;
        if (action === 'whatsapp') return assets.whatsapp;
        if (action === 'email') return `Asunto: ${assets.email_subject}\n\n${assets.email_body}`;
        if (action === 'instagram' || action === 'facebook') return assets.social_post;
        if (action === 'google_ads') return assets.google_ads;
        if (action === 'title_alternative') return `1. ${assets.title_alternative}\n2. Magnífico ${propData.type} exterior en ${propData.city}\n3. Oportunidad única: ${propData.type} de ${propData.surface}m² en zona premium`;
        if (action === 'summary_short') return assets.summary;
        if (action === 'seo_meta') return assets.seo_meta;
        if (action === 'analyze_quality') return `Calidad actual: ${computeQualityScore(property)}/100\n\nPuntos fuertes:\n- Datos de precio y dormitorios ingresados.\n- Ubicación en ${propData.city} detallada.\n\nÁreas de mejora:\n- Se recomienda ampliar la descripción a más de 150 palabras.\n- Asegúrate de incluir al menos 5 fotos reales en alta definición para ganar visibilidad en portales.`;
        if (action === 'suggest_improvements') return `Checklist de Mejoras Recomendadas:\n1. Home Staging: Pinta de blanco o beige las estancias oscuras.\n2. Iluminación: Abre persianas y coloca bombillas de luz cálida.\n3. Despersonalización: Quita retratos y decora con plantas.\n4. Fotografía profesional: Realiza fotos con gran angular en un día soleado.`;
        if (action === 'pdf_sheet') return `==========================================\nFICHA TÉCNICA Y DOSSIER COMERCIAL\n==========================================\n\n📌 INMUEBLE: ${propData.title}\n📍 UBICACIÓN: ${propData.city}, ${propData.zone}\n💰 PRECIO: ${propData.price.toLocaleString('es-ES')}€\n\nDESCRIPCIÓN GENERAL:\n${propData.description || 'Precioso inmueble con excelente distribución residencial y estancias confortables.'}\n\nFICHA TÉCNICA:\n- Tipo: ${propData.type}\n- Superficie: ${propData.surface} m²\n- Dormitorios: ${propData.bedrooms}\n- Baños: ${propData.bathrooms}\n- Extras: ${propData.features.join(', ') || 'Calefacción, Luminoso'}\n\nPara más información, contacte con nuestra oficina.`;
        return `Asset de marketing generado para ${action}:\n\nExcelente inmueble ${propData.operation.toLowerCase()} de tipo ${propData.type} ubicado en ${propData.city} (${propData.zone}). Cuenta con un precio de ${propData.price.toLocaleString()}€, ${propData.bedrooms} habitaciones y ${propData.bathrooms} baños. ¡Una oportunidad excelente en el mercado inmobiliario actual!`;
      },
    });

    // Save asset to property_marketing_assets table
    const assetId = uuidv4();
    run(
      `INSERT INTO property_marketing_assets (id, agency_id, property_id, type, title, content, channel, created_by_ai, created_at)
       VALUES (@id, @aid, @pid, @type, @title, @content, @channel, 1, datetime('now'))`,
      {
        id: assetId,
        aid: req.user.agency_id,
        pid: req.params.id,
        type: action,
        title: `Marketing ${action.replace('_', ' ')}`,
        content: textResult,
        channel: action.includes('whatsapp') ? 'whatsapp' : action.includes('email') ? 'email' : action.includes('desc') ? 'portal' : 'social',
      }
    );

    logActivity(
      req.user.agency_id, null, req.user.id, 'property_marketing_generated',
      `Herramienta de marketing "${action}" ejecutada para la propiedad "${property.title}".`,
      { property_id: req.params.id, action, asset_id: assetId }
    );

    res.json({ success: true, action, content: textResult, asset_id: assetId });
  } catch (error) {
    console.error('Error in marketing asset generation:', error);
    res.status(500).json({ error: 'Error al generar material de marketing.' });
  }
});

// GET /api/properties/:id/interested-leads — List interested leads for the property
router.get('/:id/interested-leads', (req, res) => {
  try {
    const property = get('SELECT id FROM properties WHERE id = @id AND agency_id = @agency_id', {
      id: req.params.id, agency_id: req.user.agency_id,
    });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const interests = all(
      `SELECT pi.*, l.name as lead_name, l.phone as lead_phone, l.email as lead_email,
              l.status as lead_status, l.ia_score as lead_score, l.source as lead_source,
              l.last_activity as lead_last_activity, l.assigned_to as lead_assigned
       FROM property_interests pi
       JOIN leads l ON l.id = pi.lead_id
       WHERE pi.property_id = @pid AND pi.agency_id = @aid
       ORDER BY pi.created_at DESC`,
      { pid: req.params.id, aid: req.user.agency_id }
    );

    res.json(interests);
  } catch (error) {
    console.error('Error listing interested leads:', error);
    res.status(500).json({ error: 'Error al obtener interesados.' });
  }
});

// GET /api/properties/:id/activity — History logs of the property
router.get('/:id/activity', (req, res) => {
  try {
    const activities = all(
      `SELECT a.*, u.name as user_name FROM activities a 
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.agency_id = @agency_id AND (
         a.metadata LIKE @pid1 OR a.description LIKE @pid2 OR a.type LIKE 'property_%'
       ) ORDER BY a.created_at DESC LIMIT 50`,
      { agency_id: req.user.agency_id, pid1: `%"property_id":"${req.params.id}"%`, pid2: `%${req.params.id}%` }
    );
    res.json(activities);
  } catch (error) {
    console.error('Error listing property activity:', error);
    res.status(500).json({ error: 'Error al obtener historial de actividad.' });
  }
});

// POST /api/properties/scrape-url — Extract property details from URL
router.post('/scrape-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Se requiere una URL.' });

    let portal = detectPortal(url) || 'manual';
    let externalId = '';
    try {
      const urlObj = new URL(url);
      const pathMatch = urlObj.pathname.match(/\/(\d+)/);
      if (pathMatch) externalId = pathMatch[1];
    } catch {}

    let scrapedData = {
      title: '',
      price: 0,
      description: '',
      images: [],
      city: '',
      zone: '',
      address: '',
      bedrooms: 0,
      bathrooms: 0,
      surface: 0,
      features: [],
      portal,
      external_id: externalId,
      url,
      blocked: false,
    };

    try {
      const pageData = await fetchPageData(url);
      if (pageData.title) scrapedData.title = pageData.title;
      if (pageData.price > 0) scrapedData.price = pageData.price;
      if (pageData.description) scrapedData.description = pageData.description;
      if (pageData.images && pageData.images.length > 0) scrapedData.images = pageData.images;

      try {
        const urlObj = new URL(url);
        const segments = urlObj.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          const cityZone = segments[segments.length - 2] || '';
          if (cityZone && cityZone.includes('-')) {
            const parts = cityZone.split('-');
            scrapedData.city = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            scrapedData.zone = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          }
        }
      } catch {}

      if (!scrapedData.title) {
        scrapedData.blocked = true;
        scrapedData.title = `Ficha de ${portal.charAt(0).toUpperCase() + portal.slice(1)}`;
      }
    } catch (e) {
      scrapedData.blocked = true;
      scrapedData.title = `Ficha preliminar (${portal.toUpperCase()})`;
    }

    res.json(scrapedData);
  } catch (error) {
    console.error('Error in scrape-url:', error);
    res.status(500).json({ error: 'Error al procesar el raspado de URL.' });
  }
});

export default router;
