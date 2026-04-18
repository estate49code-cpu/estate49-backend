const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./auth-middleware');

// GET all conversations for current user
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { data, error } = await db.from('conversations')
      .select('*, properties(id,title,photos,price,type,city,locality)')
      .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) throw error;

    const enriched = await Promise.all((data || []).map(async conv => {
      const otherId = conv.participant_1 === uid ? conv.participant_2 : conv.participant_1;
      const { data: profile } = await db.from('profiles')
        .select('id,fullname,avatar_url').eq('id', otherId).single();
      const { count } = await db.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('read', false)
        .neq('sender_id', uid);
      return { ...conv, other_profile: profile || { id: otherId, fullname: 'User' }, unread_count: count || 0 };
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST get or create conversation
router.post('/conversation', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { to, property_id } = req.body;
    if (!to) return res.status(400).json({ error: 'to (user id) required' });
    if (uid === to) return res.status(400).json({ error: 'Cannot message yourself' });

    // Find existing
    const { data: existing } = await db.from('conversations').select('*')
      .or(`and(participant_1.eq.${uid},participant_2.eq.${to}),and(participant_1.eq.${to},participant_2.eq.${uid})`)
      .eq('property_id', property_id || null)
      .maybeSingle();
    if (existing) return res.json(existing);

    const { data, error } = await db.from('conversations')
      .insert({ participant_1: uid, participant_2: to, property_id: property_id || null })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET messages in conversation
router.get('/:conv_id', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { data: conv } = await db.from('conversations')
      .select('*').eq('id', req.params.conv_id).single();
    if (!conv) return res.status(404).json({ error: 'Not found' });
    if (conv.participant_1 !== uid && conv.participant_2 !== uid)
      return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await db.from('messages')
      .select('*').eq('conversation_id', req.params.conv_id).order('created_at');
    if (error) throw error;

    // Mark as read
    await db.from('messages').update({ read: true })
      .eq('conversation_id', req.params.conv_id)
      .neq('sender_id', uid).eq('read', false);

    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST send message
router.post('/:conv_id/send', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });

    const { data: conv } = await db.from('conversations')
      .select('*').eq('id', req.params.conv_id).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.participant_1 !== uid && conv.participant_2 !== uid)
      return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await db.from('messages')
      .insert({
        conversation_id: Number(req.params.conv_id),
        sender_id: uid,
        content: content.trim()
      }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;