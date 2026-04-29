const express = require('express');
const router  = express.Router();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// POST /api/admin/alerts
router.post('/alerts', async (req, res) => {
  const { title, message, type = 'info' } = req.body;
  if (!title?.trim() || !message?.trim())
    return res.status(400).json({ error: 'Title and message required' });

  const { data: alert, error } = await sb
    .from('alerts')
    .insert({ title, message, type })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // ✅ Read from profiles table — matches where pushNotifications.js saves tokens
  try {
    const { data: profiles } = await sb
      .from('profiles')
      .select('push_token')
      .not('push_token', 'is', null);

    if (profiles?.length) {
      const msgs = profiles.map(({ push_token }) => ({
        to:    push_token,
        sound: 'default',
        title,
        body:  message,
        data:  { type: 'alert', alertId: alert.id },
      }));

      // Expo allows max 100 per batch
      for (let i = 0; i < msgs.length; i += 100) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(msgs.slice(i, i + 100)),
        });
      }
      console.log(`[Alerts] Push sent to ${profiles.length} devices`);
    }
  } catch (e) {
    console.error('[Alerts] Push error:', e.message);
  }

  res.json(alert);
});

// DELETE /api/admin/alerts/:id
router.delete('/alerts/:id', async (req, res) => {
  const { error } = await sb.from('alerts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;