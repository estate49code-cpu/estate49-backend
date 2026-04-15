const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

// GET user favorites with property details
router.get('/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('*, properties(*)')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add favorite
router.post('/', async (req, res) => {
  try {
    const { user_id, property_id } = req.body;
    if (!user_id || !property_id) return res.status(400).json({ error: 'user_id and property_id required' });

    const { data, error } = await supabase
      .from('favorites')
      .insert([{ user_id, property_id }])
      .select()
      .single();

    if (error && error.code === '23505') {
      return res.status(409).json({ error: 'Already in favorites' });
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE remove favorite
router.delete('/', async (req, res) => {
  try {
    const { user_id, property_id } = req.body;
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user_id)
      .eq('property_id', property_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;