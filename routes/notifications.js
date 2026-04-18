const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./auth-middleware');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await db.from('notifications')
      .select('*').eq('user_id', req.user.id)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const { count, error } = await db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id).eq('read', false);
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    await db.from('notifications').update({ read: true }).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    await db.from('notifications').update({ read: true })
      .eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;