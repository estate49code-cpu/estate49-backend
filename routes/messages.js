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

// ⚠️ IMPORTANT: /conversations and /inbox/:userId MUST come before /:propertyId

// GET /api/messages/conversations  — all conversations for auth user
router.get('/conversations', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
      .from('messages')
      .select('*, properties(id, title, city, locality, photos)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) return res.json([]);

    // Group into unique conversations
    const map = new Map();
    (data || []).forEach(msg => {
      const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      const key = `${msg.property_id || 'general'}_${otherId}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          property_id: msg.property_id,
          property: msg.properties,
          other_user_id: otherId,
          last_message: msg.content,
          last_message_at: msg.created_at,
          unread_count: 0
        });
      }
      if (!msg.read && msg.receiver_id === user.id) {
        map.get(key).unread_count++;
      }
    });

    res.json(Array.from(map.values()));
  } catch (err) {
    console.error('GET /api/messages/conversations error:', err.message);
    res.json([]);
  }
});

// GET /api/messages/inbox/:userId  — inbox messages for a userId (used by nav.js)
router.get('/inbox/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.json([]);
    res.json(data || []);
  } catch (err) {
    console.error('GET /api/messages/inbox/:userId error:', err.message);
    res.json([]);
  }
});

// GET /api/messages?property_id=X&with=userId  — messages in a conversation
router.get('/', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { property_id, with: withUserId } = req.query;

    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (property_id) query = query.eq('property_id', property_id);
    if (withUserId) {
      query = query.or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${withUserId}),and(sender_id.eq.${withUserId},receiver_id.eq.${user.id})`
      );
    } else {
      query = query.or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
    }

    const { data, error } = await query;
    if (error) return res.json([]);
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

// POST /api/messages  — send a message
router.post('/', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { receiver_id, property_id, content } = req.body;
    if (!receiver_id || !content) {
      return res.status(400).json({ error: 'receiver_id and content are required' });
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        sender_id:   user.id,
        receiver_id,
        property_id: property_id || null,
        content:     content.trim(),
        read:        false,
        created_at:  new Date().toISOString()
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

// GET /api/messages/:propertyId  — messages for a property listing
router.get('/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true });

    if (error) return res.json([]);
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

module.exports = router;