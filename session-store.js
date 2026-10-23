/* SQLite-backed session store for express-session.
   Replaces the default MemoryStore, which prints a production warning,
   loses every session on restart, and grows without bound in process
   memory. Sessions live in the same node:sqlite database as everything
   else — no new dependencies, no external service.
   Schema: the `sessions` table is created in db.js. */
const { Store } = require('express-session');

// Fallback lifetime if a session somehow carries no cookie expiry —
// matches the app's own 30-day maxAge.
const DEFAULT_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

// Cookie expiry as epoch ms. Accepts a Date or an ISO string (sessions
// are round-tripped through JSON); falls back if missing/invalid so a
// row can never be stored with NaN (which would never expire).
function expiryOf(sess) {
  const raw = sess.cookie && sess.cookie.expires;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : Date.now() + DEFAULT_MAX_AGE;
}

class SqliteSessionStore extends Store {
  constructor(db) {
    super();
    this.db = db;
  }

  // Expired rows are deleted opportunistically on every write; the
  // expires index keeps this a cheap index range delete.
  _prune() {
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }

  get(sid, cb) {
    let row;
    try {
      row = this.db
        .prepare('SELECT sess, expires FROM sessions WHERE sid = ?')
        .get(sid);
      if (!row) return cb(null, null);
      if (row.expires <= Date.now()) {
        // Expired: clean it up and report "no session".
        this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return cb(null, null);
      }
    } catch (err) {
      return cb(err);
    }
    try {
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      // Corrupt row — treat like a miss rather than 500-ing every request.
      cb(null, null);
    }
  }

  set(sid, sess, cb) {
    try {
      // INSERT OR REPLACE = upsert; one round trip, no read-then-write race.
      this.db
        .prepare(
          'INSERT OR REPLACE INTO sessions (sid, sess, expires) VALUES (?, ?, ?)'
        )
        .run(sid, JSON.stringify(sess), expiryOf(sess));
      this._prune();
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  // express-session calls this (when resave: false) to slide the store
  // row's lifetime without rewriting the session payload.
  touch(sid, sess, cb) {
    try {
      this.db
        .prepare('UPDATE sessions SET expires = ? WHERE sid = ?')
        .run(expiryOf(sess), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SqliteSessionStore;
