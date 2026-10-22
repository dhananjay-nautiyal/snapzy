const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('../db');

const router = express.Router();

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// --- Auth guard ---
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// --- Multer config: image uploads only, 5MB limit ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
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

// --- Show upload page ---
router.get('/new', requireAuth, (req, res) => {
  res.render('upload', { title: 'New post' });
});

// --- Handle upload ---
router.post('/new', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    setFlash(req, 'error', 'Please choose an image to share.');
    return res.redirect('/posts/new');
  }
  const caption = (req.body.caption || '').trim().slice(0, 500);
  const info = db
    .prepare('INSERT INTO posts (user_id, image_url, caption) VALUES (?, ?, ?)')
    .run(req.session.userId, '/uploads/' + req.file.filename, caption);

  setFlash(req, 'success', 'Your photo is live! 📸');
  res.redirect('/posts/' + info.lastInsertRowid);
});

// --- Single post with comments ---
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const post = db
    .prepare(
      `SELECT p.*, u.username,
              (SELECT COUNT(*) FROM likes  l WHERE l.post_id = p.id) AS like_count,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
              (SELECT COUNT(*) FROM likes  l WHERE l.post_id = p.id
                 AND l.user_id = @me) AS liked_by_me
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.id = @id`
    )
    .get({ id, me: req.session.userId || -1 });

  if (!post) return res.status(404).render('error', { title: 'Not found', message: 'Post not found.' });

  const comments = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, u.username
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC`
    )
    .all(id);

  res.render('post', { title: 'Post', post, comments });
});

// --- Like / unlike (toggle) ---
router.post('/:id/like', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.userId;
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });

  const existing = db
    .prepare('SELECT id FROM likes WHERE user_id = ? AND post_id = ?')
    .get(userId, id);

  let liked;
  if (existing) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
    liked = false;
  } else {
    db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(userId, id);
    liked = true;
  }

  const count = db
    .prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?')
    .get(id).c;

  // Support both AJAX and form posts
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ ok: true, liked, count });
  }
  setFlash(req, 'success', liked ? 'Liked ♥' : 'Removed like');
  res.redirect(req.get('Referer') || '/');
});

// --- Add comment ---
router.post('/:id/comments', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const body = (req.body.body || '').trim().slice(0, 1000);
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);

  if (!post) return res.status(404).render('error', { title: 'Not found', message: 'Post not found.' });
  if (!body) {
    setFlash(req, 'error', 'Comment cannot be empty.');
    return res.redirect('/posts/' + id);
  }

  db.prepare('INSERT INTO comments (user_id, post_id, body) VALUES (?, ?, ?)').run(
    req.session.userId,
    id,
    body
  );
  res.redirect('/posts/' + id);
});

// --- Delete own post ---
router.post('/:id/delete', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).render('error', { title: 'Not found', message: 'Post not found.' });
  if (post.user_id !== req.session.userId) {
    setFlash(req, 'error', "You can only delete your own posts.");
    return res.redirect('/posts/' + id);
  }

  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  // Best-effort remove image file
  const fs = require('fs');
  const file = path.join(__dirname, '..', post.image_url.replace('/uploads/', 'uploads/'));
  fs.unlink(file, () => {});

  setFlash(req, 'success', 'Post deleted.');
  res.redirect('/u/' + (db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId)?.username || ''));
});

// --- Friendly handling for upload errors (wrong type / too large) ---
// Catches MulterError and fileFilter rejections so users get a flash
// message + redirect instead of a raw 500 page.
router.use((err, req, res, next) => {
  if (err && (err.name === 'MulterError' || /^Only JPG/.test(err.message || ''))) {
    const msg =
      err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE'
        ? 'That image is too large — max 5MB.'
        : err.message;
    setFlash(req, 'error', msg);
    return res.redirect('/posts/new');
  }
  next(err);
});

module.exports = router;
