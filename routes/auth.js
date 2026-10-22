const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// --- Show signup ---
router.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('signup', { title: 'Create account' });
});

// --- Handle signup ---
router.post('/signup', (req, res) => {
  const { username, email, password, bio } = req.body;

  // Validation
  const uname = (username || '').trim();
  const mail = (email || '').trim().toLowerCase();
  const pass = password || '';

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) {
    setFlash(req, 'error', 'Username must be 3–20 characters (letters, numbers, underscore).');
    return res.redirect('/signup');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
    setFlash(req, 'error', 'Please enter a valid email address.');
    return res.redirect('/signup');
  }
  if (pass.length < 6) {
    setFlash(req, 'error', 'Password must be at least 6 characters.');
    return res.redirect('/signup');
  }

  // Uniqueness
  const exists = db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(uname, mail);
  if (exists) {
    setFlash(req, 'error', 'That username or email is already taken.');
    return res.redirect('/signup');
  }

  const hash = bcrypt.hashSync(pass, 10);
  const info = db
    .prepare('INSERT INTO users (username, email, password_hash, bio) VALUES (?, ?, ?, ?)')
    .run(uname, mail, hash, (bio || '').trim());

  req.session.userId = info.lastInsertRowid;
  setFlash(req, 'success', `Welcome to Snapzy, ${uname}! 🎉`);
  res.redirect('/');
});

// --- Show login ---
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { title: 'Log in' });
});

// --- Handle login ---
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const mail = (email || '').trim().toLowerCase();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(mail);

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    setFlash(req, 'error', 'Incorrect email or password.');
    return res.redirect('/login');
  }

  req.session.userId = user.id;
  setFlash(req, 'success', `Welcome back, ${user.username}!`);
  res.redirect('/');
});

// --- Logout ---
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
