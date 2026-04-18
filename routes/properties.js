const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./auth-middleware');

// GET all — public
router.get('/', async (req, res) => {
  try {
    let q = db.from('properties').select('*').order('posted_at', { ascending: false });
    if (req.query.type)   q = q.eq('type', req.query.type);
    if (req.query.city)   q = q.ilike('city', `%${req.query.city}%`);
    if (req.query.bhk)    q = q.eq('bhk', parseInt(req.query.bhk));
    if (req.query.search) q = q.or(
      `title.ilike.%${req.query.search}%,locality.ilike.%${req.query.search}%,city.ilike.%${req.query.search}%`
    );
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET my listings — auth
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await db.from('properties')
      .select('*')
      .eq('listed_by', req.user.id)
      .order('posted_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET single — public
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await db.from('properties')
      .select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Property not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create — auth
router.post('/', authMiddleware, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      listed_by: req.user.id,
      posted_at: new Date().toISOString()
    };
    const { data, error } = await db.from('properties').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH update — auth + owner only
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { data: ex } = await db.from('properties')
      .select('listed_by').eq('id', req.params.id).single();
    if (!ex) return res.status(404).json({ error: 'Not found' });
    if (ex.listed_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const { data, error } = await db.from('properties')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE — auth + owner only
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { data: ex } = await db.from('properties')
      .select('listed_by').eq('id', req.params.id).single();
    if (!ex) return res.status(404).json({ error: 'Not found' });
    if (ex.listed_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const { error } = await db.from('properties').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;