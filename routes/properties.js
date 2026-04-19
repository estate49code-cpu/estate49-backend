const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('./auth-middleware');

// Admin check helper
async function isAdmin(userId) {
  const { data } = await db.from('admin_users').select('id').eq('id', userId).single();
  return !!data;
}

// ─── ADMIN ROUTES (must be before /:id) ─────────────────────────────

// GET all properties — admin only
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    if (!await isAdmin(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    const status = req.query.status;
    let q = db.from('properties').select('*').order('posted_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET admin stats
router.get('/admin/stats', authMiddleware, async (req, res) => {
  try {
    if (!await isAdmin(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    const [all, pending, approved, rejected, usersRes] = await Promise.all([
      db.from('properties').select('id', { count: 'exact', head: true }),
      db.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      db.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
      db.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    res.json({
      total: all.count || 0,
      pending: pending.count || 0,
      approved: approved.count || 0,
      rejected: rejected.count || 0,
      users: usersRes.count || 0
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH admin approve/reject
router.patch('/admin/:id', authMiddleware, async (req, res) => {
  try {
    if (!await isAdmin(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    const { status, admin_note } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });
    const { data, error } = await db.from('properties')
      .update({ status, admin_note: admin_note || null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE admin — delete any property
router.delete('/admin/:id', authMiddleware, async (req, res) => {
  try {
    if (!await isAdmin(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    const { error } = await db.from('properties').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PUBLIC & USER ROUTES ────────────────────────────────────────────

// GET all — public (only approved)
router.get('/', async (req, res) => {
  try {
    let q = db.from('properties').select('*').eq('status', 'approved').order('posted_at', { ascending: false });
    if (req.query.type)   q = q.eq('type', req.query.type);
    if (req.query.city)   q = q.ilike('city', `%${req.query.city}%`);
    if (req.query.bhk)    q = q.eq('bhk', parseInt(req.query.bhk));
    if (req.query.search) q = q.or(
      `title.ilike.%${req.query.search}%,locality.ilike.%${req.query.search}%,city.ilike.%${req.query.search}%`
    );
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET my listings — auth (all statuses)
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await db.from('properties')
      .select('*')
      .eq('listed_by', req.user.id)
      .order('posted_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET single — public
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await db.from('properties')
      .select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Property not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create — auth (starts as pending)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      listed_by: req.user.id,
      status: 'pending',
      posted_at: new Date().toISOString()
    };
    const { data, error } = await db.from('properties').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH update — owner only (resets to pending for re-review)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { data: ex } = await db.from('properties')
      .select('listed_by').eq('id', req.params.id).single();
    if (!ex) return res.status(404).json({ error: 'Not found' });
    if (ex.listed_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const { data, error } = await db.from('properties')
      .update({ ...req.body, status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE — owner only
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { data: ex } = await db.from('properties')
      .select('listed_by').eq('id', req.params.id).single();
    if (!ex) return res.status(404).json({ error: 'Not found' });
    if (ex.listed_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const { error } = await db.from('properties').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;