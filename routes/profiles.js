const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

async function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

// GET /api/profiles/:id  — get profile by user UUID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      // Fallback: don't crash the frontend
      return res.json({ id, full_name: 'Owner', email: null, phone: null, avatar_url: null });
    }

    res.json(data);
  } catch (err) {
    console.error('GET /api/profiles/:id error:', err.message);
    // Always return something so property page doesn't crash
    res.json({ id: req.params.id, full_name: 'Owner', email: null, phone: null, avatar_url: null });
  }
});

// GET /api/profiles  — get own profile (auth required)
router.get('/', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !data) {
      return res.json({ id: user.id, full_name: user.user_metadata?.full_name || '', email: user.email });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profiles/:id  — update profile (auth required, own profile only)
router.put('/:id', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

    const allowed = ['full_name', 'phone', 'bio', 'avatar_url', 'city', 'whatsapp'];
    const payload = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });
    payload.updated_at = new Date().toISOString();
    payload.id = req.params.id;

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PUT /api/profiles/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;