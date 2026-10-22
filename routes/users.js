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

// --- Profile page ---
router.get('/:username', (req, res) => {
  const username = req.params.username;
  const user = db
    .prepare('SELECT id, username, bio, created_at FROM users WHERE username = ?')
    .get(username);

  if (!user) return res.status(404).render('error', { title: 'Not found', message: 'User not found.' });

  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM posts   WHERE user_id = @id) AS posts,
         (SELECT COUNT(*) FROM likes   l JOIN posts p ON p.id = l.post_id WHERE p.user_id = @id) AS likes_received,
         (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.user_id = @id) AS comments_received,
         (SELECT COUNT(*) FROM follows WHERE following_id = @id) AS followers,
         (SELECT COUNT(*) FROM follows WHERE follower_id  = @id) AS following`
    )
    .get({ id: user.id });

  const posts = db
    .prepare(
      `SELECT p.id, p.caption, p.image_url, p.created_at,
              (SELECT COUNT(*) FROM likes  l WHERE l.post_id = p.id) AS like_count,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
              (SELECT COUNT(*) FROM likes  l WHERE l.post_id = p.id
                 AND l.user_id = @me) AS liked_by_me
       FROM posts p WHERE p.user_id = @me2
       ORDER BY p.created_at DESC, p.id DESC`
    )
    .all({ me: req.session.userId || -1, me2: user.id });

  const isOwn = req.session.userId === user.id;

  // Whether the viewer already follows this profile (for the button state).
  const isFollowing = req.session.userId
    ? !!db
        .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
        .get(req.session.userId, user.id)
    : false;

  res.render('profile', { title: user.username, user, stats, posts, isOwn, isFollowing });
});

// --- Follow / unfollow (toggle) ---
router.post('/:username/follow', requireAuth, (req, res) => {
  const target = db
    .prepare('SELECT id, username FROM users WHERE username = ?')
    .get(req.params.username);
  if (!target) return res.status(404).render('error', { title: 'Not found', message: 'User not found.' });

  const me = req.session.userId;
  if (target.id === me) {
    // Can't follow yourself.
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ ok: false, error: 'You cannot follow yourself.' });
    }
    setFlash(req, 'error', 'You cannot follow yourself.');
    return res.redirect('/u/' + target.username);
  }

  const existing = db
    .prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(me, target.id);

  let following;
  if (existing) {
    db.prepare('DELETE FROM follows WHERE id = ?').run(existing.id);
    following = false;
  } else {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(me, target.id);
    following = true;
  }

  const followerCount = db
    .prepare('SELECT COUNT(*) AS c FROM follows WHERE following_id = ?')
    .get(target.id).c;

  // Support both AJAX and form posts (mirrors the like toggle).
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ ok: true, following, count: followerCount });
  }
  setFlash(req, 'success', following ? `Following ${target.username}` : `Unfollowed ${target.username}`);
  res.redirect(req.get('Referer') || '/u/' + target.username);
});

module.exports = router;
