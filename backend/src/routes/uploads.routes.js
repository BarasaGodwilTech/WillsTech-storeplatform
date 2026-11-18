const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Images are written straight into the existing frontend folder
// (public/images/products) so they're served as normal static files,
// just like the product photos already shipped with the site.
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'images', 'products');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
    const rand = require('crypto').randomBytes(3).toString('hex');
    cb(null, `product-${Date.now()}-${rand}${EXT[file.mimetype] || '.jpg'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed'));
  },
});

router.post('/', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file received' });
  res.status(201).json({ url: `/public/images/products/${req.file.filename}` });
});

module.exports = router;
