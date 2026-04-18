const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./auth-middleware');

// GET my favorites
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await db.from('favorites')
      .select('id, property_id, created_at, properties(*)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST add favorite
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { property_id } = req.body;
    if (!property_id) return res.status(400).json({ error: 'property_id required' });
    const { data, error } = await db.from('favorites')
      .upsert(
        { user_id: req.user.id, property_id: Number(property_id) },
        { onConflict: 'user_id,property_id' }
      ).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE remove favorite
router.delete('/:property_id', authMiddleware, async (req, res) => {
  try {
    const { error } = await db.from('favorites')
      .delete()
      .eq('user_id', req.user.id)
      .eq('property_id', Number(req.params.property_id));
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;