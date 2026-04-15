const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

async function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

// GET /api/notifications/:userId  — fetch notifications for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 30;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      // Table might not exist yet — return empty silently
      return res.json([]);
    }

    res.json(data || []);
  } catch (err) {
    console.error('GET /api/notifications/:userId error:', err.message);
    res.json([]);
  }
});

// GET /api/notifications/:userId/unread  — unread count
router.get('/:userId/unread', async (req, res) => {
  try {
    const { userId } = req.params;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) return res.json({ count: 0 });
    res.json({ count: count || 0 });
  } catch (err) {
    res.json({ count: 0 });
  }
});

// PATCH /api/notifications/:userId/read-all  — mark all read
router.patch('/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH read-all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read  — mark one read
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PATCH /:id/read error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications  — create a notification
router.post('/', async (req, res) => {
  try {
    const { user_id, title, message, type, link } = req.body;
    if (!user_id || !message) {
      return res.status(400).json({ error: 'user_id and message are required' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert([{ user_id, title, message, type: type || 'info', link: link || null, read: false }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/notifications error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;