const express = require('express');
const router  = express.Router();
const supabase = require('../db');

// ── GET all properties (with optional filters) ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, city, bhk, min_price, max_price, furnished, q } = req.query;

    let query = supabase
      .from('properties')
      .select('*')
      .order('posted_at', { ascending: false });

    if (type)      query = query.eq('type', type);
    if (city)      query = query.ilike('city', city);
    if (bhk)       query = query.eq('bhk', parseInt(bhk));
    if (furnished) query = query.ilike('furnished', `%${furnished}%`);
    if (min_price) query = query.gte('price', parseFloat(min_price));
    if (max_price) query = query.lte('price', parseFloat(max_price));
    if (q)         query = query.or(`title.ilike.%${q}%,locality.ilike.%${q}%,city.ilike.%${q}%,description.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);

  } catch (err) {
    console.error('GET /api/properties error:', err.message);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// ── GET single property by ID ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json(data);

  } catch (err) {
    console.error('GET /api/properties/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

// ── POST create new property ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Required field check
    if (!body.title || !body.type || !body.price) {
      return res.status(400).json({ error: 'title, type and price are required' });
    }

    const payload = {
      // Core
      type:             body.type,
      property_type:    body.property_type     || null,
      title:            body.title.trim(),
      description:      body.description       || null,

      // Location
      city:             body.city              || null,
      locality:         body.locality          || null,
      address:          body.address           || null,

      // Config
      bhk:              body.bhk               || null,
      bathrooms:        body.bathrooms         || null,
      floor:            body.floor             || null,
      area:             body.area              || null,
      carpet_area:      body.carpet_area       || null,
      furnished:        body.furnished         || null,
      available_from:   body.available_from    || null,

      // Pricing
      price:            parseFloat(body.price) || 0,
      deposit:          body.deposit           || null,
      maintenance:      body.maintenance       || null,
      no_brokerage:     body.no_brokerage      || false,

      // Building amenities
      lift:             body.lift              || false,
      parking:          body.parking           || false,
      security:         body.security          || false,
      cctv:             body.cctv              || false,
      gym:              body.gym               || false,
      pool:             body.pool              || false,
      clubhouse:        body.clubhouse         || false,
      garden:           body.garden            || false,
      powerbackup:      body.powerbackup       || false,
      intercom:         body.intercom          || false,

      // Flat features
      ac:               body.ac               || false,
      balcony:          body.balcony          || false,
      modular_kitchen:  body.modular_kitchen  || false,
      washing_machine:  body.washing_machine  || false,
      fridge:           body.fridge           || false,
      wifi:             body.wifi             || false,
      pet_friendly:     body.pet_friendly     || false,
      gated:            body.gated            || false,
      vastu:            body.vastu            || false,
      water_24:         body.water_24         || false,

      // Media
      photos:           Array.isArray(body.photos) ? body.photos : [],

      // Contact
      contact_name:     body.contact_name     || null,
      contact_role:     body.contact_role     || null,
      contact_phone:    body.contact_phone    || null,
      contact_email:    body.contact_email    || null,
      contact_time:     body.contact_time     || null,

      // Meta
      listed_by:        body.listed_by        || null,
      posted_at:        body.posted_at        || new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('properties')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);

  } catch (err) {
    console.error('POST /api/properties error:', err.message);
    res.status(500).json({ error: 'Failed to create property' });
  }
});

// ── PUT update property ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('properties')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);

  } catch (err) {
    console.error('PUT /api/properties/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// ── DELETE property ───────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });

  } catch (err) {
    console.error('DELETE /api/properties/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

module.exports = router;