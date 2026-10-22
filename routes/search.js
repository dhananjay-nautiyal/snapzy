const express = require('express');
const db = require('../db');

const router = express.Router();

// Escape LIKE wildcards so user input is matched literally.
function likeEscape(s) {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

// Shared user-search query. Matches username (ranked first) or bio.
// Exposes whether the current viewer already follows each result.
function searchUsers(q, meId) {
  const like = '%' + likeEscape(q) + '%';
  return db
    .prepare(
      `SELECT u.id, u.username, u.bio,
              (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS post_count,
              EXISTS(SELECT 1 FROM follows f
                      WHERE f.follower_id = @me AND f.following_id = u.id) AS following
         FROM users u
        WHERE u.username LIKE @like ESCAPE '\\'
           OR u.bio        LIKE @like ESCAPE '\\'
        ORDER BY (u.username = @exact) DESC, u.username ASC
        LIMIT 20`
    )
    .all({ like, exact: q, me: meId || -1 });
}

// --- Search page (works with JS off via the GET form; JS upgrades it to live) ---
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 50);
  const results = q ? searchUsers(q, req.session.userId) : [];
  res.render('search', { title: q ? `Search: ${q}` : 'Search', q, results });
});

// --- Live results for the search box (JSON) ---
router.get('/search.json', (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 50);
  if (!q) return res.json({ ok: true, results: [] });
  const rows = searchUsers(q, req.session.userId);
  // Only expose what the client needs.
  res.json({
    ok: true,
    results: rows.map((r) => ({
      username: r.username,
      bio: r.bio,
      post_count: r.post_count,
      following: !!r.following,
    })),
  });
});

module.exports = router;
