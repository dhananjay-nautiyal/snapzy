const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('../db');

const router = express.Router();

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// --- Admin access control ---
// Opt-in via the ADMIN_USERS env var (comma-separated usernames).
// Secure default: if unset, nobody reaches the admin UI.
function isAdmin(req) {
  if (!req.session.userId) return false;
  const allowed = (process.env.ADMIN_USERS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId);
  return !!me && allowed.includes(me.username.toLowerCase());
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  // 404 (not 403) so we don't reveal that /admin exists.
  if (!isAdmin(req)) {
    return res.status(404).render('error', { title: 'Not found', message: 'Page not found.' });
  }
  next();
}

// --- Multer config for ad creatives (same rules as post uploads) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, 'ad-' + crypto.randomBytes(12).toString('hex') + ext);
  },
});
const ALLOWED = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.includes(ext) && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only JPG, PNG, GIF or WEBP images up to 5MB are allowed.'));
  },
});

// Only allow http(s) targets — blocks javascript: and data: URIs.
function validLink(url) {
  return /^https?:\/\//i.test(url);
}

// --- Admin dashboard: list ads + create form ---
router.get('/admin', requireAdmin, (req, res) => {
  const ads = db.prepare('SELECT * FROM ads ORDER BY created_at DESC, id DESC').all();
  res.render('admin', { title: 'Ads', ads });
});

// --- Create an ad ---
router.post('/admin/ads', requireAdmin, upload.single('image'), (req, res) => {
  const headline = (req.body.headline || '').trim().slice(0, 140);
  const sponsor = (req.body.sponsor || '').trim().slice(0, 80);
  const link = (req.body.link_url || '').trim().slice(0, 500);

  if (!req.file || !headline) {
    setFlash(req, 'error', 'An image and headline are required.');
    return res.redirect('/admin');
  }
  if (link && !validLink(link)) {
    setFlash(req, 'error', 'Link must start with http:// or https://.');
    return res.redirect('/admin');
  }

  db.prepare(
    'INSERT INTO ads (headline, sponsor, image_url, link_url) VALUES (?, ?, ?, ?)'
  ).run(headline, sponsor, '/uploads/' + req.file.filename, link);

  setFlash(req, 'success', 'Ad created.');
  res.redirect('/admin');
});

// --- Toggle active ---
router.post('/admin/ads/:id/toggle', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const ad = db.prepare('SELECT id, active FROM ads WHERE id = ?').get(id);
  if (!ad) {
    setFlash(req, 'error', 'Ad not found.');
    return res.redirect('/admin');
  }
  db.prepare('UPDATE ads SET active = ? WHERE id = ?').run(ad.active ? 0 : 1, id);
  setFlash(req, 'success', ad.active ? 'Ad paused.' : 'Ad activated.');
  res.redirect('/admin');
});

// --- Delete ---
router.post('/admin/ads/:id/delete', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const ad = db.prepare('SELECT id, image_url FROM ads WHERE id = ?').get(id);
  if (!ad) {
    setFlash(req, 'error', 'Ad not found.');
    return res.redirect('/admin');
  }
  db.prepare('DELETE FROM ads WHERE id = ?').run(id);
  // Best-effort remove the creative file
  const fs = require('fs');
  const file = path.join(__dirname, '..', ad.image_url.replace('/uploads/', 'uploads/'));
  fs.unlink(file, () => {});
  setFlash(req, 'success', 'Ad deleted.');
  res.redirect('/admin');
});

// --- Public click-through: count the click, then send the user onward ---
router.get('/ad/:id/click', (req, res) => {
  const id = Number(req.params.id);
  const ad = db.prepare('SELECT id, link_url FROM ads WHERE id = ?').get(id);
  if (ad && ad.link_url) {
    db.prepare('UPDATE ads SET clicks = clicks + 1 WHERE id = ?').run(id);
    return res.redirect(ad.link_url);
  }
  res.redirect('/');
});

// --- Friendly handling for upload errors (wrong type / too large) ---
router.use((err, req, res, next) => {
  if (err && (err.name === 'MulterError' || /^Only JPG/.test(err.message || ''))) {
    const msg =
      err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE'
        ? 'That image is too large — max 5MB.'
        : err.message;
    setFlash(req, 'error', msg);
    return res.redirect('/admin');
  }
  next(err);
});

module.exports = router;
