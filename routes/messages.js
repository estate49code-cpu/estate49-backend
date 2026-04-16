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

// ⚠️ IMPORTANT: named routes MUST come before /:param routes

// GET /api/messages/inbox/:userId — grouped conversations list
router.get('/inbox/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*, properties(id, title, city, locality, photos)')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) return res.json([]);

    // Group into unique conversation threads
    const map = new Map();
    (data || []).forEach(msg => {
      const otherId     = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      const propertyId  = msg.property_id || 'general';
      const key         = `${propertyId}_${otherId}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          property_id:    msg.property_id,
          property:       msg.properties,
          other_user_id:  otherId,
          last_message:   msg.message || msg.content || '',
          last_message_at: msg.created_at,
          unread_count:   0
        });
      }
      // Count unread (messages sent to this user, not yet read)
      if (!msg.is_read && msg.receiver_id === userId) {
        map.get(key).unread_count++;
      }
    });

    res.json(Array.from(map.values()));
  } catch (err) {
    console.error('GET /api/messages/inbox error:', err.message);
    res.json([]);
  }
});

// GET /api/messages — thread between two users for a property
// Query: ?property_id=X&user1=A&user2=B
router.get('/', async (req, res) => {
  try {
    const { property_id, user1, user2 } = req.query;
    if (!user1 || !user2) return res.json([]);

    let query = supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user1},receiver_id.eq.${user2}),` +
        `and(sender_id.eq.${user2},receiver_id.eq.${user1})`
      )
      .order('created_at', { ascending: true });

    if (property_id) query = query.eq('property_id', property_id);

    const { data, error } = await query;
    if (error) return res.json([]);
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

// POST /api/messages — send a message
router.post('/', async (req, res) => {
  try {
    const { property_id, sender_id, receiver_id, sender_name, message } = req.body;
    if (!sender_id || !receiver_id || !message) {
      return res.status(400).json({ error: 'sender_id, receiver_id, and message are required' });
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        property_id:  property_id || null,
        sender_id,
        receiver_id,
        sender_name:  sender_name || 'User',
        message:      message.trim(),
        is_read:      false,
        created_at:   new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/messages/read — mark messages as read
router.patch('/read', async (req, res) => {
  try {
    const { property_id, sender_id, receiver_id } = req.body;
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', receiver_id)
      .eq('sender_id', sender_id)
      .eq('property_id', property_id)
      .eq('is_read', false);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// GET /api/messages/:propertyId — all messages for a property listing
router.get('/:propertyId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('property_id', req.params.propertyId)
      .order('created_at', { ascending: true });
    if (error) return res.json([]);
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

module.exports = router;