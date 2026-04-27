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
// ✅ FONT-FREE: E49 is drawn as pure SVG <rect> elements (7-segment style).
//    This works on every server — no Arial/Helvetica/DejaVu needed.
//    Previous approach used SVG <text> which showed □□□ because server fonts
//    (Arial, Helvetica) are not installed in librsvg on Linux.
async function stampE49(buffer) {
  const meta = await sharp(buffer).metadata();
  const W  = meta.width  || 1280;
  const H  = meta.height || 960;

  // Stamp size: 11% of shorter dimension
  const r   = Math.round(Math.min(W, H) * 0.11);
  const mg  = Math.round(r * 0.50);       // margin from edge
  const cx  = mg + r;                     // stamp centre x
  const cy  = mg + r;                     // stamp centre y
  const r2  = Math.round(r * 0.70);       // inner ring radius
  const lw1 = Math.max(2, Math.round(r * 0.08));
  const lw2 = Math.max(1, Math.round(r * 0.035));
  const col = '#c0392b';

  // ── E49 as pure rectangles ────────────────────────────────────────────────
  // Unit grid per character: 36w × 56h, bar thickness t=7
  // Three chars side by side with gap=10 → total: 128w × 56h
  // Char offsets: E=0, 4=46, 9=92
  const UW = 128, UH = 56;
  const sc = (r2 * 1.45) / UW;            // scale to fill ~72% of inner ring diameter
  const ox = cx - (UW * sc) / 2;          // text block left edge (horizontally centred)
  const oy = cy - (UH * sc) / 2;          // text block top edge  (vertically centred)
  const t  = 7;                           // bar thickness in unit coords
  const op = 0.80;                        // opacity — clearly visible on any background

  // Helper: unit-coord rect → absolute SVG rect string
  function R(ux, uy, uw, uh) {
    const x = (ox + ux * sc).toFixed(1);
    const y = (oy + uy * sc).toFixed(1);
    const w = (uw * sc).toFixed(1);
    const h = (uh * sc).toFixed(1);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}" fill-opacity="${op}" rx="1.5"/>`;
  }

  // ── Letter E (offset x=0) ─────────────────────────────────────────────────
  const E = [
    R( 0,  0,  t, 56),   // left vertical (full height)
    R( 0,  0, 36,  t),   // top bar
    R( 0, 24, 30,  t),   // middle bar (slightly shorter for classic E look)
    R( 0, 49, 36,  t),   // bottom bar
  ].join('');

  // ── Number 4 (offset x=46) ───────────────────────────────────────────────
  const o4 = 46;
  const N4 = [
    R(o4,      0,  t, 32),   // left arm (top half only)
    R(o4,     24, 36,  t),   // crossbar
    R(o4 + 29, 0,  t, 56),  // right vertical (full height)
  ].join('');

  // ── Number 9 (offset x=92) ───────────────────────────────────────────────
  const o9 = 92;
  const N9 = [
    R(o9,       0, 36,  t),   // top bar
    R(o9,       0,  t, 32),   // left arm (top half only — makes the closed top loop)
    R(o9,      24, 36,  t),   // middle bar
    R(o9 + 29,  0,  t, 56),  // right vertical (full height — the tail of 9)
  ].join('');

  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${col}" stroke-width="${lw1}" stroke-opacity="0.55"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}"
      fill="none" stroke="${col}" stroke-width="${lw2}" stroke-opacity="0.40"/>
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

    // App sends x-upload-source: app → stamp watermark server-side
    // Web uploads already stamped client-side via Canvas → pass through as-is
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