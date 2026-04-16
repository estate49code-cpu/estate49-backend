const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

// GET /api/notifications/:userId
router.get('/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) return res.json([]);   // table may not exist yet — silent
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

// PATCH /api/notifications/:userId/read-all
router.patch('/:userId/read-all', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.params.userId)
      .eq('is_read', false);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read — mark one read
router.patch('/:id/read', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications — create a notification
router.post('/', async (req, res) => {
  try {
    const { user_id, title, body, type, link } = req.body;
    if (!user_id || !body) return res.status(400).json({ error: 'user_id and body required' });
    const { data, error } = await supabase
      .from('notifications')
      .insert([{ user_id, title: title || '', body, type: type || 'info', link: link || null, is_read: false }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;