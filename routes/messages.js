const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

// IMPORTANT: /inbox/:userId MUST be defined before /:propertyId

// GET /api/messages/inbox/:userId — grouped conversation list for sidebar
router.get('/inbox/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*, properties(id, title, city, locality, photos)')
      .or(`senderid.eq.${userId},receiverid.eq.${userId}`)
      .order('createdat', { ascending: false });

    if (error) return res.json([]);

    const map = new Map();
    (data || []).forEach(msg => {
      const otherId    = msg.senderid === userId ? msg.receiverid : msg.senderid;
      const propId     = msg.propertyid || 'general';
      const key        = `${propId}_${otherId}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          property_id:     msg.propertyid,
          property:        msg.properties,
          other_user_id:   otherId,
          last_message:    msg.message || '',
          last_message_at: msg.createdat,
          unread_count:    0
        });
      }
      if (!msg.isread && msg.receiverid === userId) {
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
// Query params: ?user1=UUID&user2=UUID&property_id=X
router.get('/', async (req, res) => {
  try {
    const { property_id, user1, user2 } = req.query;
    if (!user1 || !user2) return res.json([]);

    let query = supabase
      .from('messages')
      .select('*')
      .or(
        `and(senderid.eq.${user1},receiverid.eq.${user2}),` +
        `and(senderid.eq.${user2},receiverid.eq.${user1})`
      )
      .order('createdat', { ascending: true });

    if (property_id) query = query.eq('propertyid', property_id);

    const { data, error } = await query;
    if (error) return res.json([]);

    // Normalize DB column names → frontend-friendly names
    const normalized = (data || []).map(m => ({
      ...m,
      sender_id:   m.senderid,
      receiver_id: m.receiverid,
      property_id: m.propertyid,
      sender_name: m.sendername,
      is_read:     m.isread,
      created_at:  m.createdat
    }));
    res.json(normalized);
  } catch (err) {
    res.json([]);
  }
});

// POST /api/messages — send a message
router.post('/', async (req, res) => {
  try {
    // Accept both snake_case (messages.html) and camelCase (legacy)
    const propertyid  = req.body.propertyid  || req.body.property_id  || null;
    const senderid    = req.body.senderid    || req.body.sender_id;
    const receiverid  = req.body.receiverid  || req.body.receiver_id;
    const sendername  = req.body.sendername  || req.body.sender_name  || 'User';
    const { message } = req.body;

    if (!senderid || !receiverid || !message) {
      return res.status(400).json({ error: 'senderid, receiverid, and message are required' });
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        propertyid,
        senderid,
        receiverid,
        sendername,
        message:   message.trim(),
        isread:    false,
        createdat: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Fire notification for receiver (non-blocking)
    supabase.from('notifications').insert([{
      userid:    receiverid,
      type:      'message',
      title:     `New message from ${sendername}`,
      body:      message.slice(0, 80),
      isread:    false,
      createdat: new Date().toISOString()
    }]).then(() => {}).catch(() => {});

    res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/messages/read — mark messages as read
router.patch('/read', async (req, res) => {
  try {
    const propertyid = req.body.property_id || req.body.propertyid;
    const senderid   = req.body.sender_id   || req.body.senderid;
    const receiverid = req.body.receiver_id || req.body.receiverid;

    const { error } = await supabase
      .from('messages')
      .update({ isread: true })
      .eq('receiverid', receiverid)
      .eq('senderid',   senderid)
      .eq('propertyid', propertyid)
      .eq('isread', false);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// GET /api/messages/:propertyId — all messages for a property (legacy)
router.get('/:propertyId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('propertyid', req.params.propertyId)
      .order('createdat', { ascending: true });
    if (error) return res.json([]);
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

module.exports = router;