const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

// GET conversation for a property between two users
router.get('/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { user1, user2 } = req.query;

    let query = supabase
      .from('messages')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true });

    if (user1 && user2) {
      query = query.or(
        `and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all conversations for a user
router.get('/inbox/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*, properties(id, title, photos, city, locality)')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by property + other user → latest message per thread
    const threads = {};
    (data || []).forEach(m => {
      const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id;
      const key = `${m.property_id}_${otherId}`;
      if (!threads[key]) threads[key] = { ...m, otherId, unread: 0 };
      if (!m.is_read && m.receiver_id === userId) threads[key].unread++;
    });

    res.json(Object.values(threads));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send message
router.post('/', async (req, res) => {
  try {
    const { property_id, sender_id, receiver_id, sender_name, message } = req.body;
    if (!property_id || !sender_id || !receiver_id || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{ property_id, sender_id, receiver_id, sender_name, message }])
      .select()
      .single();

    if (error) throw error;

    // Create notification for receiver
    await supabase.from('notifications').insert([{
      user_id: receiver_id,
      type:    'message',
      title:   `New message from ${sender_name || 'someone'}`,
      body:    message.slice(0, 80),
      link:    `/messages.html?property=${property_id}&with=${sender_id}`
    }]);

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH mark messages as read
router.patch('/read', async (req, res) => {
  try {
    const { property_id, receiver_id, sender_id } = req.body;
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('property_id', property_id)
      .eq('receiver_id', receiver_id)
      .eq('sender_id', sender_id)
      .eq('is_read', false);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;