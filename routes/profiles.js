const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

// GET profile
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPSERT profile
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (!body.id) return res.status(400).json({ error: 'User id required' });

    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id:             body.id,
        full_name:      body.full_name      || null,
        phone:          body.phone          || null,
        avatar_url:     body.avatar_url     || null,
        role:           body.role           || 'client',
        rera_number:    body.rera_number    || null,
        agency_name:    body.agency_name    || null,
        license_expiry: body.license_expiry || null,
        updated_at:     new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;