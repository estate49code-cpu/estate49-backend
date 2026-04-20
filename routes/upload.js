// routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Watermark SVG — E49 text overlay
function makeWatermarkSVG(width, height) {
  const fontSize = Math.max(16, Math.round(width * 0.055));
  const padding = 14;
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${width - fontSize*3 - padding*2}" y="${height - fontSize - padding*2}"
            width="${fontSize*3 + padding}" height="${fontSize + padding}"
            rx="4" fill="rgba(0,0,0,0.45)"/>
      <text
        x="${width - fontSize*1.5 - padding*1.5}"
        y="${height - padding*0.9}"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="white"
        text-anchor="middle"
        opacity="0.92">E49</text>
    </svg>`);
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // 1. Get image dimensions first
    const meta = await sharp(req.file.buffer).metadata();
    const w = meta.width || 1200;
    const h = meta.height || 900;

    // 2. Compress + resize (max 1200px wide) + add watermark
    const processed = await sharp(req.file.buffer)
      .rotate()                          // auto-rotate based on EXIF
      .resize(1200, 900, {
        fit: 'inside',                   // preserve aspect ratio
        withoutEnlargement: true
      })
      .composite([{
        input: makeWatermarkSVG(Math.min(w, 1200), Math.min(h, 900)),
        blend: 'over'
      }])
      .webp({ quality: 78 })            // compress to WebP, ~78% quality
      .toBuffer();

    // 3. Upload to Supabase Storage
    const filename = `properties/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
    const { error: upErr } = await supabase.storage
      .from('property-images')
      .upload(filename, processed, {
        contentType: 'image/webp',
        upsert: false
      });

    if (upErr) throw upErr;

    // 4. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('property-images')
      .getPublicUrl(filename);

    res.json(publicUrl);
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message || 'Upload failed' });
  }
});

module.exports = router;