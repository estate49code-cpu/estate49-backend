// routes/auth-middleware.js — TEMPORARY DEBUG VERSION
require('dotenv').config();

console.log('🔑 SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ set' : '❌ MISSING');
console.log('🔑 SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ set' : '❌ MISSING');
console.log('🔑 SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ set' : '❌ MISSING');

const { createClient } = require('@supabase/supabase-js');

const _adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization;
    console.log('🔐 Auth header received:', auth ? auth.slice(0, 30) + '...' : 'NONE');

    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized – no token' });
    }

    const token = auth.split(' ')[1].trim();
    const { data: { user }, error } = await _adminClient.auth.getUser(token);

    console.log('👤 User from token:', user?.id || 'NULL', '| Error:', error?.message || 'none');

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token', detail: error?.message });
    }

    req.user = user;
    next();
  } catch (e) {
    console.error('❌ authMiddleware crash:', e.message);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

module.exports = { authMiddleware };

// routes/auth-middleware.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ✅ Uses service_role key — required for server-side token verification
// Make sure SUPABASE_SERVICE_KEY is set in your .env file
const _adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized – no token' });
    }

    const token = auth.split(' ')[1].trim();
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized – empty token' });
    }

    const { data: { user }, error } = await _adminClient.auth.getUser(token);

    if (error || !user) {
      console.error('❌ Auth failed:', error?.message || 'No user returned');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (e) {
    console.error('❌ authMiddleware crash:', e.message);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

module.exports = { authMiddleware };