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


// ── E49 Round Stamp ───────────────────────────────────────────────────────────
// Font-free: E49 drawn as pure SVG <rect> elements — no server fonts needed.
// Watermark style: light, absorbed look — visible only on close inspection.
async function stampE49(buffer) {
  const meta = await sharp(buffer).metadata();
  const W  = meta.width  || 1280;
  const H  = meta.height || 960;

  const r   = Math.round(Math.min(W, H) * 0.11);
  const mg  = Math.round(r * 0.50);
  const cx  = mg + r;
  const cy  = mg + r;
  const r2  = Math.round(r * 0.70);
  const lw1 = Math.max(1, Math.round(r * 0.05));   // ✅ thinner outer ring
  const lw2 = Math.max(1, Math.round(r * 0.02));   // ✅ thinner inner ring
  const col = '#c0392b';

  // ── Watermark opacities — light absorbed watercolor look ─────────────────
  const ringOp1 = 0.18;   // outer ring  — very faint
  const ringOp2 = 0.12;   // inner ring  — even fainter
  const textOp  = 0.22;   // E49 bars    — subtle, absorbed into photo

  const UW = 128, UH = 56;
  const sc = (r2 * 1.45) / UW;
  const ox = cx - (UW * sc) / 2;
  const oy = cy - (UH * sc) / 2;
  const t  = 7;

  function R(ux, uy, uw, uh) {
    const x = (ox + ux * sc).toFixed(1);
    const y = (oy + uy * sc).toFixed(1);
    const w = (uw * sc).toFixed(1);
    const h = (uh * sc).toFixed(1);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}" fill-opacity="${textOp}" rx="1.5"/>`;
  }

  // Letter E
  const E = [
    R( 0,  0,  t, 56),
    R( 0,  0, 36,  t),
    R( 0, 24, 30,  t),
    R( 0, 49, 36,  t),
  ].join('');

  // Number 4
  const o4 = 46;
  const N4 = [
    R(o4,       0,  t, 32),
    R(o4,      24, 36,  t),
    R(o4 + 29,  0,  t, 56),
  ].join('');

  // Number 9
  const o9 = 92;
  const N9 = [
    R(o9,       0, 36,  t),
    R(o9,       0,  t, 32),
    R(o9,      24, 36,  t),
    R(o9 + 29,  0,  t, 56),
  ].join('');

  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${col}" stroke-width="${lw1}" stroke-opacity="${ringOp1}"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}"
      fill="none" stroke="${col}" stroke-width="${lw2}" stroke-opacity="${ringOp2}"/>
    ${E}${N4}${N9}
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

    const isApp      = req.headers['x-upload-source'] === 'app';
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