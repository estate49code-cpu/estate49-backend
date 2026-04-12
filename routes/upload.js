const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WEBP images are allowed'));
    }
  }
});

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

router.post('/photos', upload.array('photos', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photos uploaded'
      });
    }

    const savedFiles = [];

    for (const file of req.files) {
      const filename = `estate49_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const outputPath = path.join(uploadDir, filename);

      const watermarkSvg = Buffer.from(`
        <svg width="320" height="50">
          <rect x="0" y="0" width="320" height="50" rx="8" ry="8" fill="rgba(0,0,0,0.45)" />
          <text x="14" y="32" font-size="24" font-family="Arial" font-weight="bold" fill="white">
            © Estate49
          </text>
        </svg>
      `);

      await sharp(file.buffer)
        .resize({ width: 1400, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .composite([
          {
            input: watermarkSvg,
            gravity: 'southeast'
          }
        ])
        .toFile(outputPath);

      savedFiles.push(`/uploads/${filename}`);
    }

    res.json({
      success: true,
      photos: savedFiles,
      message: 'Photos uploaded successfully'
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;