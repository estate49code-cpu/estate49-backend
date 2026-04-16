const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

async function getUserId(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : (user?.id || null);
}

// GET /api/favorites — all favorites for logged-in user
router.get('/', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data, error } = await supabase
      .from('favorites')
      .select('*, properties(*)')
      .eq('userid', userId)
      .order('createdat', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('GET /api/favorites:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/favorites/:userId — by userId (profile page)
router.get('/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('*, properties(*)')
      .eq('userid', req.params.userId)
      .order('createdat', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

// POST /api/favorites — add favorite
router.post('/', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // frontend sends 'propertyid' (no underscore) — accept both just in case
    const propertyid = req.body.propertyid || req.body.property_id;
    if (!propertyid) return res.status(400).json({ error: 'propertyid required' });

    // avoid duplicates
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('userid', userId)
      .eq('propertyid', propertyid)
      .maybeSingle();
    if (existing) return res.json(existing);

    const { data, error } = await supabase
      .from('favorites')
      .insert([{ userid: userId, propertyid }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/favorites:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/favorites/:propertyId — remove favorite
router.delete('/:propertyId', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('userid', userId)
      .eq('propertyid', req.params.propertyId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/favorites:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;