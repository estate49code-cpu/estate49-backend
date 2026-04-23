const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const sharp   = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth-middleware');

// ✅ Fix: lazy-load Supabase client — only created when first request arrives,
//         not at module load time. Prevents crash on startup if env vars missing.
let supabase;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

// ── Multer: memory storage, 10MB limit, images only ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// ── Build E49 SVG watermark overlay ──
function buildWatermarkSvg(imgWidth, imgHeight) {
  const pillW   = Math.round(imgWidth * 0.18);
  const pillH   = Math.round(imgHeight * 0.09);
  const fontSize = Math.round(pillH * 0.52);
  const x = imgWidth - pillW - Math.round(imgWidth * 0.025);
  const y = Math.round((imgHeight - pillH) / 2);
  const rx = Math.round(pillH * 0.35);

  return Buffer.from(`
    <svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${y}" width="${pillW}" height="${pillH}"
        rx="${rx}" ry="${rx}" fill="rgba(192,57,43,0.82)"/>
      <text
        x="${x + pillW / 2}" y="${y + pillH / 2 + fontSize * 0.36}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}" font-weight="800"
        fill="white" text-anchor="middle" letter-spacing="1.5">E49</text>
    </svg>
  `);
}

// ── Main upload handler ──
router.post('/', requireAuth, upload.array('photos', 15), async (req, res) => {
  try {
    const sb = getSupabase(); // ✅ only called here, not at startup

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const userId = req.user.id;
    const uploadedUrls = [];

    for (const file of req.files) {
      const meta        = await sharp(file.buffer).metadata();
      const origWidth   = meta.width  || 1200;
      const origHeight  = meta.height || 900;
      const targetWidth = Math.min(origWidth, 1400);

      const resized = await sharp(file.buffer)
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true, mozjpeg: true })
        .toBuffer();

      const finalMeta = await sharp(resized).metadata();
      const finalW    = finalMeta.width  || targetWidth;
      const finalH    = finalMeta.height || Math.round(targetWidth * origHeight / origWidth);

      const watermarkSvg = buildWatermarkSvg(finalW, finalH);

      const watermarked = await sharp(resized)
        .composite([{ input: watermarkSvg, top: 0, left: 0 }])
        .jpeg({ quality: 82, progressive: true })
        .toBuffer();

      const timestamp = Date.now();
      const rand      = Math.random().toString(36).substring(2, 8);
      const filename  = `properties/${userId}/${timestamp}-${rand}.jpg`;

      const { error: uploadError } = await sb.storage
        .from('property-photos')
        .upload(filename, watermarked, {
          contentType: 'image/jpeg',
          upsert: false,
          cacheControl: '31536000'
        });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = sb.storage
        .from('property-photos')
        .getPublicUrl(filename);

      uploadedUrls.push(urlData.publicUrl);
    }

    res.json({ urls: uploadedUrls });

  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ── Delete a photo ──
router.delete('/', requireAuth, async (req, res) => {
  try {
    const sb = getSupabase();
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const marker = '/property-photos/';
    const idx    = url.indexOf(marker);
    if (idx === -1) return res.status(400).json({ error: 'Invalid URL' });

    const storagePath = url.substring(idx + marker.length);
    const { error } = await sb.storage.from('property-photos').remove([storagePath]);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Photo delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;