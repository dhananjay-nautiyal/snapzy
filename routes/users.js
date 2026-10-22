const express = require('express');
const db = require('../db');

const router = express.Router();

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
         (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.user_id = @id) AS comments_received`
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

  res.render('profile', { title: user.username, user, stats, posts, isOwn });
});

module.exports = router;
