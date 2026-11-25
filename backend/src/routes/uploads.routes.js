const express = require('express');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const storage = require('../lib/storage');

const router = express.Router();

// Photos are read into memory, optimised, then sent to Cloudflare R2 (or the local folder if R2 is not set up).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },   // phone photos are big; we shrink them
  fileFilter: (req, file, cb) => (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed'))),
});

router.post('/', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file received' });
  try {
    const out = await storage.saveProductImage(req.file.buffer, req.file.mimetype);
    res.status(201).json({ url: out.url, thumbUrl: out.thumbUrl, storage: out.storage });
  } catch (e) {
    console.error('[uploads] failed:', e.message);
    res.status(500).json({ error: (storage.isR2() ? 'Could not save the photo to Cloudflare R2: ' : 'Could not save the photo: ') + e.message });
  }
});

module.exports = router;
