const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Use memory storage — no local disk needed
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Use service role key for storage uploads
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

router.post('/', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const ext      = path.extname(req.file.originalname) || '.jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    const { error } = await supabase.storage
      .from('property-photos')
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) throw error;

    // Get public URL
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