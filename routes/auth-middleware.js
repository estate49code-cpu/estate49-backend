// routes/auth-middleware.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ✅ Critical: persistSession: false + autoRefreshToken: false for server-side use
const _adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
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
      console.error('❌ Auth failed:', error?.message);
      return res.status(401).json({ error: 'Invalid or expired token', detail: error?.message });
    }

    req.user = user;
    next();
  } catch (e) {
    console.error('❌ authMiddleware crash:', e.message);
    return res.status(500).json({ error: 'Auth check failed', detail: e.message });
  }
}

module.exports = { authMiddleware };