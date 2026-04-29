const express    = require('express');
const router     = express.Router();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const ADMINS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());

function isAdmin(req, res, next) {
  if (!ADMINS.includes(req.user?.email))
    return res.status(403).json({ error: 'Admin only' });
  next();
}

// POST /api/admin/alerts  → insert + push to all users
router.post('/admin/alerts', isAdmin, async (req, res) => {
  const { title, message, type = 'info' } = req.body;
  if (!title?.trim() || !message?.trim())
    return res.status(400).json({ error: 'Title and message required' });

  const { data: alert, error } = await sb
    .from('alerts').insert({ title, message, type }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Push notifications to all registered devices
  try {
    const { data: rows } = await sb.from('user_push_tokens').select('token');
    if (rows?.length) {
      const msgs = rows.map(({ token }) => ({
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
router.delete('/admin/alerts/:id', isAdmin, async (req, res) => {
  const { error } = await sb.from('alerts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;