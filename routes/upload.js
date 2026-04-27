const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const sharp    = require('sharp');
const { createClient } = require('@supabase/supabase-js');

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  c.auth.getUser(token).then(({ data, error }) => {
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });
    req.user = data.user;
    next();
  });
}

// ── Supabase service-role client (lazy) ──────────────────────────────────────
let sb;
function getSB() {
  if (!sb) sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return sb;
}

// ── Multer: memory storage ────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

// ── E49 Round Stamp (only applied to app uploads) ────────────────────────────
// Web already stamps client-side via Canvas — no double-stamp needed.
// App sends X-Upload-Source: app header → server stamps here.
async function stampE49(buffer) {
  const meta = await sharp(buffer).metadata();
  const W   = meta.width  || 1280;
  const H   = meta.height || 960;
  const r   = Math.round(Math.min(W, H) * 0.09);
  const mg  = Math.round(r * 0.55);
  const cx  = mg + r;
  const cy  = mg + r;
  const r2  = Math.round(r * 0.72);
  const fs  = Math.round(r * 0.50);
  const lw1 = Math.max(1, Math.round(r * 0.07));
  const lw2 = Math.max(1, Math.round(r * 0.03));

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}"
        fill="none" stroke="#c0392b"
        stroke-width="${lw1}" stroke-opacity="0.28"/>
      <circle cx="${cx}" cy="${cy}" r="${r2}"
        fill="none" stroke="#c0392b"
        stroke-width="${lw2}" stroke-opacity="0.18"/>
      <text
        x="${cx}" y="${cy}"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="Arial,Helvetica,sans-serif"
        font-size="${fs}"
        font-weight="900"
        fill="#c0392b"
        fill-opacity="0.32">E49</text>
    </svg>`);

  return sharp(buffer)
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

// ── POST /api/upload ──────────────────────────────────────────────────────────
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // App sends X-Upload-Source: app → stamp watermark server-side
    // Web uploads are already stamped client-side via Canvas → pass through as-is
    const isApp     = req.headers['x-upload-source'] === 'app';
    const fileBuffer = isApp ? await stampE49(req.file.buffer) : req.file.buffer;
    const mimeType   = isApp ? 'image/jpeg' : req.file.mimetype;
    const ext        = isApp ? 'jpg' : (req.file.mimetype === 'image/png' ? 'png' : 'jpg');

    const fname = `properties/${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await getSB()
      .storage
      .from('property-photos')
      .upload(fname, fileBuffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '31536000',
      });

    if (upErr) throw new Error(upErr.message);

    const { data } = getSB().storage.from('property-photos').getPublicUrl(fname);
    res.json({ url: data.publicUrl });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/upload ────────────────────────────────────────────────────────
router.delete('/', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const marker = 'property-photos/';
    const idx    = url.indexOf(marker);
    if (idx === -1) return res.status(400).json({ error: 'Invalid storage URL' });

    const storagePath = url.substring(idx + marker.length);
    const { error }   = await getSB().storage.from('property-photos').remove([storagePath]);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;