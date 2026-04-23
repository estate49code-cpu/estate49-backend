// routes/auth-middleware.js
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// Log env status on startup
console.log('🔑 SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ set' : '❌ MISSING');
console.log('🔑 SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ set' : '❌ MISSING');
console.log('🔑 SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ set' : '❌ MISSING');

const _adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization;
    console.log('🔐 Auth header:', auth ? auth.slice(0, 40) + '...' : '❌ NONE');

    if (!auth || !auth.startsWith('Bearer ')) {
      console.log('❌ No Bearer token in request');
      return res.status(401).json({ error: 'Unauthorized – no token' });
    }

    const token = auth.split(' ')[1].trim();

    if (!token) {
      console.log('❌ Token is empty after split');
      return res.status(401).json({ error: 'Unauthorized – empty token' });
    }

    console.log('🔍 Verifying token with Supabase...');
    const { data: { user }, error } = await _adminClient.auth.getUser(token);

    if (error) {
      console.log('❌ Supabase auth error:', error.message);
      return res.status(401).json({ error: 'Invalid or expired token', detail: error.message });
    }

    if (!user) {
      console.log('❌ No user returned from token');
      return res.status(401).json({ error: 'No user found for token' });
    }

    console.log('✅ Authenticated user:', user.id, user.email);
    req.user = user;
    next();
  } catch (e) {
    console.error('❌ authMiddleware crash:', e.message);
    return res.status(500).json({ error: 'Auth check failed', detail: e.message });
  }
}

module.exports = { authMiddleware };