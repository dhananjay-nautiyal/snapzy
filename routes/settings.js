const express = require('express');
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

// --- Settings page ---
router.get('/settings', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, username, email, bio FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) return res.redirect('/login');
  res.render('settings', { title: 'Settings', user });
});

// --- Update profile (bio) ---
router.post('/settings', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, username FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) return res.redirect('/login');

  const bio = (req.body.bio || '').trim().slice(0, 200);

  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, user.id);

  setFlash(req, 'success', 'Profile updated.');
  res.redirect('/u/' + user.username);
});

module.exports = router;
