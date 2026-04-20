// routes/support.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service role key — bypasses RLS
);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());

// ── MIDDLEWARE: get user from JWT ──────────────────────────
async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}
function isAdmin(user) {
  return user && ADMIN_EMAILS.includes(user.email);
}

// ── CLIENT: GET /api/support — my tickets ─────────────────
router.get('/', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── CLIENT: POST /api/support — raise ticket ──────────────
router.post('/', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { subject, category, message, priority } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message required' });
  const { data, error } = await supabase
    .from('support_tickets')
    .insert([{
      user_id: user.id,
      subject: subject.trim(),
      category: category || 'general',
      message: message.trim(),
      priority: priority || 'normal',
      status: 'open'
    }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ── CLIENT: GET /api/support/:id — ticket detail ──────────
router.get('/:id', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', user.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// ── ADMIN: GET /api/support/admin/all — all tickets ───────
router.get('/admin/all', async (req, res) => {
  const user = await getUser(req);
  console.log('Admin check — user email:', user?.email, '| ADMIN_EMAILS:', process.env.ADMIN_EMAILS);
  if (!isAdmin(user)) return res.status(403).json({ error: 'Forbidden' });
  // ... rest of route
  const { status, priority, category } = req.query;
  let q = supabase
    .from('support_tickets')
    .select(`*, profiles:user_id(fullname, phone)`)
    .order('created_at', { ascending: false });
  if (status)   q = q.eq('status', status);
  if (priority) q = q.eq('priority', priority);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── ADMIN: PATCH /api/support/admin/:id — reply + status ──
router.patch('/admin/:id', async (req, res) => {
  const user = await getUser(req);
  if (!isAdmin(user)) return res.status(403).json({ error: 'Forbidden' });
  const { admin_reply, status, priority } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (admin_reply !== undefined) { updates.admin_reply = admin_reply; updates.admin_replied_at = new Date().toISOString(); }
  if (status)   updates.status = status;
  if (priority) updates.priority = priority;
  const { data, error } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
 
module.exports = router;