/* Seed Snapzy with demo users + posts so the feed isn't empty.
   Run: npm run seed

   Demo password: SEED_PASSWORD env var if set; 'password123' in local dev;
   a random one per run in production. A published default is never used in
   production (see README "Security notes"). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

// --- Make pretty gradient SVG "photos" ---
function makePhoto(name, c1, c2, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="640" cy="160" r="220" fill="rgba(255,255,255,0.18)"/>
  <circle cx="140" cy="660" r="180" fill="rgba(255,255,255,0.12)"/>
  <text x="50%" y="50%" fill="rgba(255,255,255,0.92)" font-family="Inter,sans-serif"
        font-size="52" font-weight="700" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;
  const file = path.join(UPLOADS, name);
  fs.writeFileSync(file, svg);
  return '/uploads/' + name;
}

console.log('Seeding Snapzy…');

// --- Demo users ---
// Password precedence: SEED_PASSWORD (set in render.yaml) > random per run
// when in production (fail closed: nobody can log in as demo users) >
// local dev default. A published default is never used in production.
const IS_PROD = process.env.NODE_ENV === 'production';
const DEMO_PASSWORD =
  process.env.SEED_PASSWORD ||
  (IS_PROD ? crypto.randomBytes(16).toString('base64url') : 'password123');
const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
const users = [
  { username: 'ava', email: 'ava@snapzy.app', bio: 'Chasing light & colour 🌄' },
  { username: 'ben', email: 'ben@snapzy.app', bio: 'Coffee, code, cameras ☕️' },
  { username: 'cara', email: 'cara@snapzy.app', bio: 'City walks & film photos 🎞️' },
];

const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (username, email, password_hash, bio) VALUES (?, ?, ?, ?)'
);
const userIds = {};
for (const u of users) {
  const info = insertUser.run(u.username, u.email, hash, u.bio);
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
  userIds[u.username] = row.id;
}

// Keep the demo password authoritative even when the users already exist —
// e.g. an old DB still carrying a previously published password.
db.prepare(
  'UPDATE users SET password_hash = ? WHERE username IN (?, ?, ?)'
).run(hash, 'ava', 'ben', 'cara');

// --- Posts (skip if already seeded) ---
const postCount = db.prepare('SELECT COUNT(*) AS c FROM posts').get().c;
if (postCount === 0) {
  const photos = [
    ['p1.svg', '#7c3aed', '#ec4899', 'Golden hour', 'ava', 'Sunset never disappoints.'],
    ['p2.svg', '#0ea5e9', '#22d3ee', 'Ocean blues', 'cara', 'Found my happy place today.'],
    ['p3.svg', '#f59e0b', '#ef4444', 'Morning brew', 'ben', 'First coffee, best coffee.'],
    ['p4.svg', '#10b981', '#84cc16', 'Trail vibes', 'ava', 'Weekend hike, worth every step.'],
    ['p5.svg', '#8b5cf6', '#6366f1', 'Neon nights', 'cara', 'City lights hitting different.'],
    ['p6.svg', '#f43f5e', '#fb923c', 'Desert bloom', 'ben', 'Road trip stops.'],
  ];

  const insertPost = db.prepare(
    'INSERT INTO posts (user_id, image_url, caption) VALUES (?, ?, ?)'
  );
  const insertLike = db.prepare(
    'INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)'
  );
  const insertComment = db.prepare(
    'INSERT INTO comments (user_id, post_id, body) VALUES (?, ?, ?)'
  );

  const all = Object.values(userIds);
  for (const [file, c1, c2, label, owner, caption] of photos) {
    const url = makePhoto(file, c1, c2, label);
    const info = insertPost.run(userIds[owner], url, caption);
    const pid = info.lastInsertRowid;

    // Everyone (incl. author) likes it — feeds the like counts
    for (const uid of all) insertLike.run(uid, pid);
  }

  // A couple of comments
  insertComment.run(userIds.cara, 1, 'This is gorgeous! 😍');
  insertComment.run(userIds.ava, 3, 'Recipe please!');
  insertComment.run(userIds.cara, 2, 'Where is this?');

  console.log(`Created ${photos.length} posts.`);
} else {
  console.log('Posts already exist — skipping.');
}

// --- Demo ads (skip if any exist) ---
const adCount = db.prepare('SELECT COUNT(*) AS c FROM ads').get().c;
if (adCount === 0) {
  // [file, c1, c2, svgLabel, headline, sponsor, link]
  const creatives = [
    ['ad1.svg', '#6366f1', '#22d3ee', 'Snapzy Pro', 'Unlock 4K uploads & an ad-free feed', 'Snapzy', 'https://example.com/pro'],
    ['ad2.svg', '#ec4899', '#f59e0b', 'PhotoWeek', 'Free preset pack — this week only', 'PhotoWeek', 'https://example.com/presets'],
  ];
  const insertAd = db.prepare(
    'INSERT INTO ads (headline, sponsor, image_url, link_url) VALUES (?, ?, ?, ?)'
  );
  for (const [file, c1, c2, label, headline, sponsor, link] of creatives) {
    const url = makePhoto(file, c1, c2, label);
    insertAd.run(headline, sponsor, url, link);
  }
  console.log(`Created ${creatives.length} demo ads.`);
} else {
  console.log('Ads already exist — skipping.');
}

console.log('Done.');
if (IS_PROD) {
  console.log('Demo login → ava@snapzy.app, password = SEED_PASSWORD (see host env)');
} else {
  console.log(`\nDemo login → email: ava@snapzy.app  |  password: ${DEMO_PASSWORD}`);
}
console.log('Admin UI   → /admin (set ADMIN_USERS=ava to enable)\n');
