const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('./auth-middleware');

// GET my profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await db.from('profiles')
      .select('*').eq('id', req.user.id).single();
    if (error) return res.status(404).json({ error: 'Profile not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET any profile (public - limited fields)
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await db.from('profiles')
      .select('id,fullname,role,agency_name,rera_number,avatar_url,phone_verified')
      .eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH update my profile
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const allowed = [
      'fullname','phone','bio','role',
      'agency_name','rera_number','avatar_url','phone_verified'
    ];
    const update = { id: req.user.id, updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const { data, error } = await db.from('profiles')
      .upsert(update, { onConflict: 'id' }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;