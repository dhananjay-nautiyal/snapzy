const path = require('path');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');

require('dotenv').config();

const db = require('./db');
const { getSponsoredAd } = require('./ads');
const SqliteSessionStore = require('./session-store');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Use a stable secret in production — a random per-boot secret would log
// everyone out whenever the service restarts.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  if (IS_PROD) {
    console.warn(
      '[Snapzy] WARNING: SESSION_SECRET is not set in production. ' +
        'Sessions will reset on every restart. Set a SESSION_SECRET env var.'
    );
  }
}
const sessionSecret = SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// --- View engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Behind a reverse proxy (Render/Railway/etc.) trust the first hop so
// Express sees the real client IP and protocol.
if (IS_PROD) app.set('trust proxy', 1);

// --- Body parsing ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Sessions ---
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    // SQLite-backed store (session-store.js): sessions survive restarts,
    // no MemoryStore production warning, no unbounded memory growth.
    store: new SqliteSessionStore(db),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // HTTPS-only in production (trust proxy above makes Express honour
      // X-Forwarded-Proto behind Render). Off in local dev so plain-HTTP
      // http://localhost sessions keep working.
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  })
);

// --- Flash messages, current user, and CSRF token into views ---
// NOTE: This must run BEFORE the CSRF verification below so that any error
// view rendered by the verifier has access to res.locals.csrf / currentUser.
app.use((req, res, next) => {
  res.locals.currentUser = null;
  res.locals.flash = null;

  // Ensure a CSRF token exists for this session and expose it to all views.
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;

  if (req.session.userId) {
    const user = db
      .prepare('SELECT id, username, bio FROM users WHERE id = ?')
      .get(req.session.userId);
    if (user) res.locals.currentUser = user;
  }
  if (req.session.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  }
  next();
});

// --- CSRF protection for state-changing requests ---
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  // Accept the token from: parsed body (normal forms), header (AJAX),
  // or query string (multipart file-upload forms, whose bodies aren't
  // parsed until the route's multer runs — after this middleware).
  const token =
    (req.body && req.body._csrf) ||
    req.headers['x-csrf-token'] ||
    req.query._csrf;
  if (token && token === req.session.csrf) return next();
  return res.status(403).render('error', {
    title: 'Forbidden',
    message: 'Invalid or missing security token. Please go back and try again.',
  });
});

// --- Routes ---
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/admin'));
app.use('/', require('./routes/search'));
app.use('/', require('./routes/settings'));
app.use('/posts', require('./routes/posts'));
app.use('/u', require('./routes/users'));

// --- Home = feed ---
app.get('/', (req, res) => {
  const posts = db
    .prepare(
      `SELECT p.id, p.caption, p.image_url, p.created_at,
              u.username,
              (SELECT COUNT(*) FROM likes  l WHERE l.post_id = p.id) AS like_count,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
              (SELECT COUNT(*) FROM likes  l WHERE l.post_id = p.id
                 AND l.user_id = @me) AS liked_by_me
       FROM posts p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 60`
    )
    .all({ me: req.session.userId || -1 });

  // Sponsored card for the feed (null when no active ads — renders nothing).
  const ad = getSponsoredAd();

  res.render('feed', { title: 'Feed', posts, ad });
});

// --- 404 ---
app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'Page not found.' });
});

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Something went wrong',
    message: process.env.NODE_ENV === 'production' ? 'Unexpected error.' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`\n  Snapzy is running → http://localhost:${PORT}\n`);
});
