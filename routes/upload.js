const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth-middleware');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
// Positioned: middle-right, semi-transparent white pill
function buildWatermarkSvg(imgWidth, imgHeight) {
  const pillW = Math.round(imgWidth * 0.18);   // ~18% of image width
  const pillH = Math.round(imgHeight * 0.09);  // ~9% of image height
  const fontSize = Math.round(pillH * 0.52);
  const x = imgWidth - pillW - Math.round(imgWidth * 0.025); // right margin
  const y = Math.round((imgHeight - pillH) / 2);              // vertically centred
  const rx = Math.round(pillH * 0.35);

  return Buffer.from(`
    <svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
      <!-- pill background -->
      <rect
        x="${x}" y="${y}"
        width="${pillW}" height="${pillH}"
        rx="${rx}" ry="${rx}"
        fill="rgba(192,57,43,0.82)"
      />
      <!-- E49 text -->
      <text
        x="${x + pillW / 2}" y="${y + pillH / 2 + fontSize * 0.36}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="800"
        fill="white"
        text-anchor="middle"
        letter-spacing="1.5"
      >E49</text>
    </svg>
  `);
}

// ── Main upload handler ──
router.post('/', requireAuth, upload.array('photos', 15), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const userId = req.user.id;
    const uploadedUrls = [];

    for (const file of req.files) {
      // ── 1. Get image metadata (dimensions) ──
      const meta = await sharp(file.buffer).metadata();
      const origWidth  = meta.width  || 1200;
      const origHeight = meta.height || 900;

      // ── 2. Resize: max 1400px wide, maintain aspect ratio ──
      const targetWidth = Math.min(origWidth, 1400);

      // ── 3. Process: resize + compress to JPEG ──
      const resized = await sharp(file.buffer)
        .rotate()                          // auto-correct EXIF orientation
        .resize({ width: targetWidth, withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true, mozjpeg: true })
        .toBuffer();

      // ── 4. Get final dimensions after resize ──
      const finalMeta = await sharp(resized).metadata();
      const finalW = finalMeta.width  || targetWidth;
      const finalH = finalMeta.height || Math.round(targetWidth * origHeight / origWidth);

      // ── 5. Build watermark SVG at final dimensions ──
      const watermarkSvg = buildWatermarkSvg(finalW, finalH);

      // ── 6. Composite watermark onto image ──
      const watermarked = await sharp(resized)
        .composite([{
          input: watermarkSvg,
          top: 0,
          left: 0
        }])
        .jpeg({ quality: 82, progressive: true })
        .toBuffer();

      // ── 7. Generate unique filename ──
      const ext = 'jpg';
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 8);
      const filename = `properties/${userId}/${timestamp}-${rand}.${ext}`;

      // ── 8. Upload to Supabase Storage ──
      const { error: uploadError } = await supabase.storage
        .from('property-photos')
        .upload(filename, watermarked, {
          contentType: 'image/jpeg',
          upsert: false,
          cacheControl: '31536000'   // 1 year cache
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // ── 9. Get public URL ──
      const { data: urlData } = supabase.storage
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

// ── Delete a photo (when user removes from form) ──
router.delete('/', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Extract storage path from public URL
    const marker = '/property-photos/';
    const idx = url.indexOf(marker);
    if (idx === -1) return res.status(400).json({ error: 'Invalid URL' });

    const storagePath = url.substring(idx + marker.length);

    const { error } = await supabase.storage
      .from('property-photos')
      .remove([storagePath]);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Photo delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;