const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { authMiddleware } = require('./auth-middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (!['jpg','jpeg','png','webp'].includes(ext))
      return res.status(400).json({ error: 'Only JPG, PNG, WEBP allowed' });

    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'property-photos';
    const filename = `${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await db.storage.from(bucket)
      .upload(filename, req.file.buffer, { contentType: req.file.mimetype });
    if (error) throw error;

    const { data } = db.storage.from(bucket).getPublicUrl(filename);
    res.json({ url: data.publicUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;