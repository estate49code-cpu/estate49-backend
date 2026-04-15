const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const sharp   = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Watermark SVG
const watermarkSVG = (width) => {
  const fontSize = Math.max(16, Math.round(width * 0.04));
  return Buffer.from(`
    <svg width="${width}" height="${fontSize * 2.5}">
      <rect width="${width}" height="${fontSize * 2.5}" fill="rgba(0,0,0,0.28)" rx="0"/>
      <text
        x="${width / 2}" y="${fontSize * 1.7}"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="rgba(255,255,255,0.85)"
        text-anchor="middle"
        letter-spacing="2"
      >🏠 Estate49</text>
    </svg>`);
};

router.post('/', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    // Step 1: Get image metadata
    const metadata = await sharp(req.file.buffer).metadata();
    const width  = Math.min(metadata.width, 1200);
    const height = Math.round(metadata.height * (width / metadata.width));

    // Step 2: Resize + compress
    const resized = await sharp(req.file.buffer)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, progressive: true })
      .toBuffer();

    // Step 3: Create watermark overlay at bottom
    const wm = watermarkSVG(width);
    const wmHeight = Math.max(40, Math.round(width * 0.06));

    const watermarked = await sharp(resized)
      .composite([{
        input: wm,
        gravity: 'south',
        blend: 'over'
      }])
      .jpeg({ quality: 78 })
      .toBuffer();

    // Step 4: Upload to Supabase Storage
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const { error } = await supabase.storage
      .from('property-photos')
      .upload(filename, watermarked, {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from('property-photos')
      .getPublicUrl(filename);

    res.json({ url: data.publicUrl });

  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

module.exports = router;