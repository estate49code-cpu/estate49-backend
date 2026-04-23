const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { createClient } = require('@supabase/supabase-js');

// ── Inline auth (no import dependency) ──
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  client.auth.getUser(token).then(({ data, error }) => {
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });
    req.user = data.user;
    next();
  });
}

// ── Lazy service client ──
let sb;
function getSB() {
  if (!sb) sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return sb;
}

// ── Multer ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  }
});

// ── POST /api/upload ──
router.post('/', requireAuth, upload.array('photos', 15), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });

    // Try to load sharp — if not installed, upload raw
    let sharpAvailable = false;
    try { require('sharp'); sharpAvailable = true; } catch(e) { sharpAvailable = false; }

    const urls = [];
    for (const file of req.files) {
      let buffer = file.buffer;

      if (sharpAvailable) {
        const sharp = require('sharp');
        try {
          const meta    = await sharp(buffer).metadata();
          const w       = Math.min(meta.width || 1200, 1400);
          const resized = await sharp(buffer).rotate()
            .resize({ width: w, withoutEnlargement: true })
            .jpeg({ quality: 82, progressive: true })
            .toBuffer();

          // E49 watermark
          const fm    = await sharp(resized).metadata();
          const fw    = fm.width  || w;
          const fh    = fm.height || 900;
          const pillW = Math.round(fw * 0.18);
          const pillH = Math.round(fh * 0.09);
          const fs2   = Math.round(pillH * 0.52);
          const px    = fw - pillW - Math.round(fw * 0.025);
          const py    = Math.round((fh - pillH) / 2);
          const rx    = Math.round(pillH * 0.35);

          const svg = Buffer.from(`
            <svg width="${fw}" height="${fh}" xmlns="http://www.w3.org/2000/svg">
              <rect x="${px}" y="${py}" width="${pillW}" height="${pillH}"
                rx="${rx}" ry="${rx}" fill="rgba(192,57,43,0.82)"/>
              <text x="${px + pillW/2}" y="${py + pillH/2 + fs2*0.36}"
                font-family="Arial,sans-serif" font-size="${fs2}" font-weight="800"
                fill="white" text-anchor="middle" letter-spacing="1.5">E49</text>
            </svg>`);

          buffer = await sharp(resized)
            .composite([{ input: svg, top: 0, left: 0 }])
            .jpeg({ quality: 82, progressive: true })
            .toBuffer();
        } catch(e) {
          console.warn('Sharp processing failed, uploading raw:', e.message);
          buffer = file.buffer;
        }
      }

      const fname = `properties/${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: upErr } = await getSB().storage
        .from('property-photos')
        .upload(fname, buffer, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });

      if (upErr) throw new Error(upErr.message);

      const { data } = getSB().storage.from('property-photos').getPublicUrl(fname);
      urls.push(data.publicUrl);
    }

    res.json({ urls });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/upload ──
router.delete('/', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    const marker = '/property-photos/';
    const path   = url.substring(url.indexOf(marker) + marker.length);
    const { error } = await getSB().storage.from('property-photos').remove([path]);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;