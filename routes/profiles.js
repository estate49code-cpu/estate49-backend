const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('./auth-middleware');

// ── Supabase admin client (service role — bypasses RLS) ──────────────────────
const { createClient } = require('@supabase/supabase-js');
const dbAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Admin check middleware ────────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const { data: profile } = await dbAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();
    const isAdmin =
      profile?.is_admin === true ||
      req.user.user_metadata?.is_admin === true ||
      req.user.app_metadata?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden — admin only' });
    next();
  } catch (e) {
    res.status(403).json({ error: 'Admin check failed' });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC — GET /api/profiles/:id
// ═════════════════════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  // Guard: don't let /:id swallow /me or /admin routes
  if (req.params.id === 'me' || req.params.id === 'admin') return next();
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id,fullname,role,agency_name,rera_number,avatar_url,phone_verified,rera_verified,bio')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTH — GET /api/profiles/me
// ═════════════════════════════════════════════════════════════════════════════
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await dbAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    // Auto-create profile row if missing
    if (error?.code === 'PGRST116' || !data) {
      const { data: created, error: ce } = await dbAdmin
        .from('profiles')
        .insert({
          id:         req.user.id,
          email:      req.user.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (ce) throw ce;
      return res.json(created);
    }
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTH — PATCH /api/profiles/me
// Users can update their own profile — sensitive fields are stripped
// ═════════════════════════════════════════════════════════════════════════════
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    // Strip fields only admin can set
    const {
      rera_verified, phone_verified, is_admin,
      email_verified, id, created_at,
      ...safe
    } = req.body;

    const update = {
      id:         req.user.id,
      ...safe,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await dbAdmin
      .from('profiles')
      .upsert(update, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — GET /api/profiles/admin/all
// Returns all user profiles for admin panel
// ═════════════════════════════════════════════════════════════════════════════
router.get('/admin/all', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await dbAdmin
      .from('profiles')
      .select(`
        id,
        email,
        fullname,
        phone,
        role,
        bio,
        avatar_url,
        agency_name,
        rera_number,
        rera_verified,
        phone_verified,
        email_verified,
        is_admin,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — PATCH /api/profiles/admin/:id
// Admin can update any user — approve phone_verified, rera_verified, etc.
// ═════════════════════════════════════════════════════════════════════════════
router.patch('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Strip immutable fields
    const { id: _id, created_at, ...updates } = req.body;

    const { data, error } = await dbAdmin
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — GET /api/profiles/admin/stats
// Combined stats: listings + users + verification counts
// ═════════════════════════════════════════════════════════════════════════════
router.get('/admin/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [profilesRes, propertiesRes] = await Promise.all([
      dbAdmin.from('profiles').select('id, phone_verified, rera_number, rera_verified'),
      dbAdmin.from('properties').select('id, status')
    ]);

    if (profilesRes.error)   throw profilesRes.error;
    if (propertiesRes.error) throw propertiesRes.error;

    const profiles   = profilesRes.data   || [];
    const properties = propertiesRes.data || [];

    res.json({
      // Listing stats
      total:          properties.length,
      pending:        properties.filter(p => p.status === 'pending').length,
      approved:       properties.filter(p => p.status === 'approved').length,
      rejected:       properties.filter(p => p.status === 'rejected').length,
      // User stats
      users:          profiles.length,
      phone_verified: profiles.filter(p => p.phone_verified).length,
      rera_pending:   profiles.filter(p => p.rera_number && !p.rera_verified).length,
      rera_verified:  profiles.filter(p => p.rera_verified).length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;