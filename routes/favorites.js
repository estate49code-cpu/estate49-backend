const express = require('express');
const router  = express.Router();
const supabase = require('../db');

async function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

// GET /api/favorites  — all favorites for logged-in user (used by browse.html)
router.get('/', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
      .from('favorites')
      .select('*, properties(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('GET /api/favorites error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/favorites/:userId  — favorites by userId (used by nav.js & property.html)
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('favorites')
      .select('*, properties(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('GET /api/favorites/:userId error:', err.message);
    res.json([]);
  }
});

// POST /api/favorites  — add favorite
router.post('/', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { property_id } = req.body;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });

    // Upsert to avoid duplicates
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('property_id', property_id)
      .maybeSingle();

    if (existing) return res.json(existing);

    const { data, error } = await supabase
      .from('favorites')
      .insert([{ user_id: user.id, property_id }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/favorites error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/favorites/:propertyId  — remove favorite
router.delete('/:propertyId', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { propertyId } = req.params;

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('property_id', propertyId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/favorites/:propertyId error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;