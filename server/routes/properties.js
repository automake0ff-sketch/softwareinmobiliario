import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { generatePropertyMatch } from '../services/claude.js';

const router = Router();
router.use(auth);

router.get('/', (req, res) => {
  try {
    const { status, type, city, zone, min_price, max_price, bedrooms, office_id, search } = req.query;
    let sql = 'SELECT * FROM properties WHERE agency_id = @agency_id';
    const params = { agency_id: req.user.agency_id };

    if (status) { sql += ' AND status = @status'; params.status = status; }
    if (type) { sql += ' AND type = @type'; params.type = type; }
    if (city) { sql += ' AND city LIKE @city'; params.city = `%${city}%`; }
    if (zone) { sql += ' AND zone LIKE @zone'; params.zone = `%${zone}%`; }
    if (min_price) { sql += ' AND price >= @min_price'; params.min_price = Number(min_price); }
    if (max_price) { sql += ' AND price <= @max_price'; params.max_price = Number(max_price); }
    if (bedrooms) { sql += ' AND bedrooms >= @bedrooms'; params.bedrooms = Number(bedrooms); }
    if (office_id) { sql += ' AND office_id = @office_id'; params.office_id = office_id; }
    if (search) {
      sql += ' AND (title LIKE @search OR description LIKE @search OR city LIKE @search OR zone LIKE @search)';
      params.search = `%${search}%`;
    }

    sql += ' ORDER BY created_at DESC';

    const properties = all(sql, params);
    res.json(properties);
  } catch (error) {
    console.error('Error listing properties:', error);
    res.status(500).json({ error: 'Error al obtener propiedades.' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const property = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!property) return res.status(404).json({ error: 'Propiedad no encontrada.' });
    res.json(property);
  } catch (error) {
    console.error('Error getting property:', error);
    res.status(500).json({ error: 'Error al obtener propiedad.' });
  }
});

router.post('/', (req, res) => {
  try {
    const { title, description, price, type, city, zone, bedrooms, bathrooms, surface, features, images, office_id } = req.body;
    if (!title || !price || !type || !city) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: title, price, type, city.' });
    }

    const id = uuidv4();
    run(
      `INSERT INTO properties (id, agency_id, office_id, title, description, price, type, city, zone, bedrooms, bathrooms, surface, features, images, created_at)
       VALUES (@id, @agency_id, @office_id, @title, @description, @price, @type, @city, @zone, @bedrooms, @bathrooms, @surface, @features, @images, datetime('now'))`,
      {
        id, agency_id: req.user.agency_id, office_id: office_id || req.user.office_id,
        title, description, price, type, city, zone, bedrooms: bedrooms || 0, bathrooms: bathrooms || 0,
        surface, features: features ? JSON.stringify(features) : null, images: images ? JSON.stringify(images) : null,
      }
    );

    const property = get('SELECT * FROM properties WHERE id = @id', { id });
    res.status(201).json(property);
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Error al crear propiedad.' });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    const allowed = ['title', 'description', 'price', 'type', 'city', 'zone', 'bedrooms', 'bathrooms', 'surface', 'features', 'images', 'status', 'office_id'];
    const updates = [];
    const params = { id: req.params.id };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if ((field === 'features' || field === 'images') && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        updates.push(`${field} = @${field}`);
        params[field] = value;
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });
    run(`UPDATE properties SET ${updates.join(', ')} WHERE id = @id`, params);

    const property = get('SELECT * FROM properties WHERE id = @id', { id: req.params.id });
    res.json(property);
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Error al actualizar propiedad.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM properties WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Propiedad no encontrada.' });

    run('DELETE FROM properties WHERE id = @id', { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Error al eliminar propiedad.' });
  }
});

router.post('/match-lead', async (req, res) => {
  try {
    const { lead_id, filters } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'Se requiere lead_id.' });

    const agencyId = req.user.agency_id;
    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id',
      { id: lead_id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    let sql = 'SELECT * FROM properties WHERE status = \'disponible\'';
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

export default router;
