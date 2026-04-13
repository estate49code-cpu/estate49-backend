const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const supabase = require('../db');

// Use memory storage — no local disk writes
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max per file
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    if (allowed.test(ext) && allowed.test(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'property-photos';

router.post('/', upload.array('photos', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError.message);
        return res.status(500).json({ error: `Failed to upload ${file.originalname}: ${uploadError.message}` });
      }

      const { data: publicData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      uploadedUrls.push(publicData.publicUrl);
    }

    res.json({
      success: true,
      urls: uploadedUrls,
      count: uploadedUrls.length
    });

  } catch (err) {
    console.error('Upload route error:', err.message);
    res.status(500).json({ error: 'Server error during upload.' });
  }
});

module.exports = router;