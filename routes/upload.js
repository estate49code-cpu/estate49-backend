const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { createClient } = require('@supabase/supabase-js');

// ── Inline auth — no external middleware dependency ──
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  c.auth.getUser(token).then(({ data, error }) => {
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });
    req.user = data.user;
    next();
  });
}

// ── Lazy service-role client ──
let sb;
function getSB() {
  if (!sb) sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return sb;
}

// ── Multer: memory storage, 15MB limit, images only ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  }
});

// ── POST /api/upload ──
// Receives ONE already-watermarked file (stamped client-side via Canvas).
// No sharp / image processing on server — just store and return URL.
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const file  = req.file;
    const ext   = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const fname = `properties/${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await getSB()
      .storage
      .from('property-photos')
      .upload(fname, file.buffer, {
        contentType:  file.mimetype,
        upsert:       false,
        cacheControl: '31536000'
      });

    if (upErr) throw new Error(upErr.message);

    const { data } = getSB().storage.from('property-photos').getPublicUrl(fname);
    res.json({ url: data.publicUrl });

  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/upload ──
router.delete('/', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const marker = '/property-photos/';
    const idx    = url.indexOf(marker);
    if (idx === -1) return res.status(400).json({ error: 'Invalid storage URL' });

    const storagePath = url.substring(idx + marker.length);
    const { error } = await getSB().storage.from('property-photos').remove([storagePath]);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;