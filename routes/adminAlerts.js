const express = require('express');
const router  = express.Router();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service key — can bypass RLS
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

  // Push notifications to all users
  try {
    const { data: tokens } = await sb.from('user_push_tokens').select('token');
    if (tokens?.length) {
      const msgs = tokens.map(({ token }) => ({
        to: token, sound: 'default', title, body: message,
        data: { type: 'alert', alertId: alert.id },
      }));
      for (let i = 0; i < msgs.length; i += 100) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgs.slice(i, i + 100)),
        });
      }
    }
  } catch (e) { console.error('Push error:', e.message); }

  res.json(alert);
});

// DELETE /api/admin/alerts/:id
router.delete('/alerts/:id', async (req, res) => {
  const { error } = await sb.from('alerts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;