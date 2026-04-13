const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const storageClient = require('../storageClient');

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'property-photos';

router.post('/', (req, res) => {
  upload.array('photos', 10)(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err.message);
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded.' });
      }

      const uploadedUrls = [];

      for (const file of req.files) {
        const ext = path.extname(file.originalname).toLowerCase();
        const fileName = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;

        const { error: uploadError } = await storageClient.storage
          .from(BUCKET)
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });

        if (uploadError) {
          console.error('Supabase upload error:', uploadError.message);
          return res.status(500).json({ error: `Upload failed: ${uploadError.message}` });
        }

        const { data: publicData } = storageClient.storage
          .from(BUCKET)
          .getPublicUrl(fileName);

        uploadedUrls.push(publicData.publicUrl);
      }

      res.json({
        success: true,
        urls: uploadedUrls,
        count: uploadedUrls.length
      });

    } catch (error) {
      console.error('Upload route error:', error.message);
      res.status(500).json({ error: 'Server error during upload.' });
    }
  });
});

module.exports = router;