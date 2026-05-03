// routes/auth-middleware.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Service-role client — used ONLY to verify tokens via getUser
const _adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      persistSession:     false,
      autoRefreshToken:   false,
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

    // ✅ Use getUser(token) — validates token + returns full user object
    const { data, error } = await _adminClient.auth.getUser(token);

    if (error || !data?.user) {
      console.error('❌ authMiddleware getUser failed:', error?.message);
      return res.status(401).json({ error: 'Unauthorized – invalid or expired token' });
    }

    req.user  = data.user;  // full user: id, email, user_metadata, app_metadata
    req.token = token;
    next();

  } catch (e) {
    console.error('❌ authMiddleware crash:', e.message);
    return res.status(500).json({ error: 'Auth check failed', detail: e.message });
  }
}

module.exports = { authMiddleware };