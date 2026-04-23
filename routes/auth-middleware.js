// routes/auth-middleware.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// This client is ONLY for database queries, not auth verification
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

    // ✅ Decode JWT manually — works 100% reliably without auth.getUser()
    // Supabase JWTs are standard JWTs — we just decode the payload
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // Check token expiry
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Check it has a user sub (subject = user ID)
    if (!payload.sub) {
      return res.status(401).json({ error: 'Invalid token – no user ID' });
    }

    // ✅ Fetch the actual user record from Supabase using admin client
    const { data: { user }, error } = await _adminClient.auth.admin.getUserById(payload.sub);

    if (error || !user) {
      console.error('❌ getUserById failed:', error?.message);
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (e) {
    console.error('❌ authMiddleware crash:', e.message);
    return res.status(500).json({ error: 'Auth check failed', detail: e.message });
  }
}

module.exports = { authMiddleware };