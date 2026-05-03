// routes/profiles.js
'use strict';

const express        = require('express');
const router         = express.Router();
const db             = require('../db');
const { createClient } = require('@supabase/supabase-js');

// ─── FIX: auth-middleware exports a plain function, not { authMiddleware } ────
const authMiddleware = require('./auth-middleware');


// ─── Lazy admin client ────────────────────────────────────────────────────────
let _dbAdmin = null;
function getDbAdmin() {
  if (_dbAdmin) return _dbAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('[profiles] ❌ SUPABASE_URL or SUPABASE_SERVICE_KEY missing!');
    throw new Error('Server misconfiguration: missing Supabase admin credentials');
  }
  _dbAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  console.log('[profiles] ✅ dbAdmin client created, key length:', key.length);
  return _dbAdmin;
}


// ─── requireAdmin middleware ──────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const dbAdmin = getDbAdmin();
    console.log('[requireAdmin] checking user:', req.user?.email, '| id:', req.user?.id);

    const { data: profile, error } = await dbAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();

    console.log('[requireAdmin] profile row:', profile, '| db error:', error?.message || null);

    const metaAdmin =
      req.user.user_metadata?.is_admin === true ||
      req.user.app_metadata?.role      === 'admin';

    const isAdmin = profile?.is_admin === true || metaAdmin;
    console.log('[requireAdmin] isAdmin:', isAdmin, '| metaAdmin:', metaAdmin);

    if (!isAdmin) {
      return res.status(403).json({
        error:    'Forbidden — admin only',
        userId:   req.user?.id,
        dbAdmin:  profile?.is_admin ?? null,
        metaAdmin,
      });
    }
    next();
  } catch (e) {
    console.error('[requireAdmin] threw:', e.message);
    res.status(403).json({ error: 'Admin check failed: ' + e.message });
  }
}


// ════════════════════════════════════════════════════
// DEBUG ROUTES (keep until confirmed working)
// ════════════════════════════════════════════════════

// Public — check env vars are loaded
router.get('/debug/env', (req, res) => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const url = process.env.SUPABASE_URL;
  res.json({
    has_url:            !!url,
    url_prefix:         url?.slice(0, 30) || null,
    has_service_key:    !!key,
    service_key_len:    key?.length || 0,
    service_key_prefix: key?.slice(0, 20) || null,
    has_anon_key:       !!process.env.SUPABASE_ANON_KEY,
    node_env:           process.env.NODE_ENV,
  });
});

// Auth-protected — confirm token is valid and user row exists
router.get('/debug/me-admin', authMiddleware, async (req, res) => {
  try {
    const dbAdmin = getDbAdmin();
    const { data: profile, error } = await dbAdmin
      .from('profiles')
      .select('id, email, is_admin, role')
      .eq('id', req.user.id)
      .single();

    res.json({
      auth_user_id:    req.user.id,
      auth_user_email: req.user.email,
      profile_row:     profile,
      db_error:        error?.message || null,
      user_metadata:   req.user.user_metadata,
      app_metadata:    req.user.app_metadata,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ════════════════════════════════════════════════════
// PUBLIC + AUTH ROUTES  (must come before /:id wildcard)
// ════════════════════════════════════════════════════

// GET /api/profiles/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const dbAdmin = getDbAdmin();
    const { data, error } = await dbAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    // Auto-create profile row if it doesn't exist yet
    if (error?.code === 'PGRST116' || !data) {
      const { data: created, error: ce } = await dbAdmin
        .from('profiles')
        .insert({
          id:         req.user.id,
          email:      req.user.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (ce) throw ce;
      return res.json(created);
    }
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/profiles/me
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const dbAdmin = getDbAdmin();

    // Strip fields users must never be allowed to set themselves
    const {
      is_admin, rera_verified, phone_verified,
      email_verified, id, created_at,
      ...safe
    } = req.body;

    const { data, error } = await dbAdmin
      .from('profiles')
      .upsert(
        { id: req.user.id, ...safe, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/profiles/push-token  (mobile app convenience)
router.patch('/push-token', authMiddleware, async (req, res) => {
  try {
    const dbAdmin = getDbAdmin();
    const { pushtoken } = req.body;

    const { error } = await dbAdmin
      .from('profiles')
      .update({ pushtoken, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════

// GET /api/profiles/admin/all
router.get('/admin/all', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const dbAdmin = getDbAdmin();
    const { data, error } = await dbAdmin
      .from('profiles')
      .select(`
        id, email, fullname, phone, role, bio, avatar_url,
        agency_name, rera_number, rera_verified,
        phone_verified, email_verified, is_admin,
        created_at, updated_at
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/profiles/admin/stats
router.get('/admin/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const dbAdmin = getDbAdmin();
    const [profilesRes, propertiesRes] = await Promise.all([
      dbAdmin.from('profiles').select('id, phone_verified, rera_number, rera_verified'),
      dbAdmin.from('properties').select('id, status'),
    ]);

    if (profilesRes.error)   throw profilesRes.error;
    if (propertiesRes.error) throw propertiesRes.error;

    const profiles   = profilesRes.data   || [];
    const properties = propertiesRes.data || [];

    res.json({
      total:          properties.length,
      pending:        properties.filter(p => p.status === 'pending').length,
      approved:       properties.filter(p => p.status === 'approved').length,
      rejected:       properties.filter(p => p.status === 'rejected').length,
      users:          profiles.length,
      phone_verified: profiles.filter(p => p.phone_verified).length,
      rera_pending:   profiles.filter(p => p.rera_number && !p.rera_verified).length,
      rera_verified:  profiles.filter(p => p.rera_verified).length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/profiles/admin/:id  (update any user's profile as admin)
router.patch('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const dbAdmin = getDbAdmin();
    const { id } = req.params;
    const { id: _id, created_at, ...updates } = req.body;

    const { data, error } = await dbAdmin
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ════════════════════════════════════════════════════
// ⚠️  WILDCARD — must stay LAST
// ════════════════════════════════════════════════════

// GET /api/profiles/:id  (public, limited fields)
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, fullname, role, agency_name, rera_number, avatar_url, phone_verified, rera_verified, bio')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;