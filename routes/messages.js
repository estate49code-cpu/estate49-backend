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
      return {
        ...conv,
        other_profile: profile || { id: otherId, fullname: 'User' },
        unread_count: count || 0
      };
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET unread message count (for nav badge)
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    // Get all conversations this user is in
    const { data: convs } = await db.from('conversations')
      .select('id')
      .or(`participant_1.eq.${uid},participant_2.eq.${uid}`);
    if (!convs || !convs.length) return res.json({ count: 0 });

    const convIds = convs.map(c => c.id);
    const { count, error } = await db.from('messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .eq('read', false)
      .neq('sender_id', uid);
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST get or create conversation
router.post('/conversation', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { to, property_id } = req.body;
    if (!to) return res.status(400).json({ error: 'to (user id) required' });
    if (uid === to) return res.status(400).json({ error: 'Cannot message yourself' });

    // Find existing conversation
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

    // Mark received messages as read
    await db.from('messages').update({ read: true })
      .eq('conversation_id', req.params.conv_id)
      .neq('sender_id', uid)
      .eq('read', false);

    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST send message  ← MAIN FIX: now updates conversation + creates notification
router.post('/:conv_id/send', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });

    // Verify conversation exists and user is a participant
    const { data: conv } = await db.from('conversations')
      .select('*, properties(id,title)')
      .eq('id', req.params.conv_id).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.participant_1 !== uid && conv.participant_2 !== uid)
      return res.status(403).json({ error: 'Forbidden' });

    // Insert the message
    const { data: msg, error: msgErr } = await db.from('messages')
      .insert({
        conversation_id: Number(req.params.conv_id),
        sender_id: uid,
        content: content.trim(),
        read: false
      }).select().single();
    if (msgErr) throw msgErr;

    // ✅ FIX 1: Update conversation's last_message and last_message_at
    await db.from('conversations').update({
      last_message: content.trim().slice(0, 120),
      last_message_at: new Date().toISOString()
    }).eq('id', req.params.conv_id);

    // ✅ FIX 2: Get sender's name for the notification
    const { data: senderProfile } = await db.from('profiles')
      .select('fullname').eq('id', uid).single();
    const senderName = senderProfile?.fullname || 'Someone';

    // ✅ FIX 3: Determine recipient (the other participant)
    const recipientId = conv.participant_1 === uid ? conv.participant_2 : conv.participant_1;

    // ✅ FIX 4: Create notification for the recipient
    const propTitle = conv.properties?.title ? ` about "${conv.properties.title}"` : '';
    const preview = content.trim().length > 60
      ? content.trim().slice(0, 60) + '…'
      : content.trim();

    await db.from('notifications').insert({
      user_id: recipientId,
      type: 'new_message',
      icon: '💬',
      message: `${senderName} sent you a message${propTitle}: "${preview}"`,
      read: false,
      metadata: {
        conversation_id: Number(req.params.conv_id),
        sender_id: uid,
        property_id: conv.property_id || null
      }
    });

    res.status(201).json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;