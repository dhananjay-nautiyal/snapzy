# Snapzy 📸

A photo-sharing social app — an original, from-scratch build inspired by the
general concept of a photo feed (share, like, comment, profiles). All code,
design, and branding are original.

## Features (MVP)

- **Accounts** — sign up, log in, log out (secure hashed passwords + sessions)
- **Photo sharing** — upload images (JPG/PNG/GIF/WEBP, ≤ 5MB) with a caption
- **Feed** — newest photos first, with like counts
- **Likes** — like / unlike with instant in-page updates
- **Comments** — comment on any post
- **Profiles** — per-user page with bio, stats, and a photo grid
- **Delete** — remove your own posts

## Tech stack

| Layer      | Choice                          |
|------------|---------------------------------|
| Runtime    | Node.js (v18+)                  |
| Web server | Express 4                       |
| Views      | EJS templates                   |
| Database   | SQLite (better-sqlite3)         |
| Auth       | express-session + bcryptjs      |
| Uploads    | multer                          |
| Styling    | Hand-written CSS (no framework) |

## Quick start

```bash
cd snapzy
npm install
npm run seed     # optional: adds demo users + posts
npm run dev      # or: npm start
```

Open **http://localhost:3000**

The seed script prints the local demo login to your terminal. No credentials
are published in this repo — production demo accounts take their password
from the `SEED_PASSWORD` env var (see `render.yaml`).

## Scripts

| Command       | What it does                          |
|---------------|---------------------------------------|
| `npm start`   | Run the server                        |
| `npm run dev` | Run with auto-reload on file changes  |
| `npm run seed`| Add demo users, posts, comments       |

## Project structure

```
snapzy/
├── server.js          # App setup, middleware, routes, error handling
├── db.js              # SQLite connection + schema
├── seed.js            # Demo data
├── routes/
│   ├── auth.js        # signup / login / logout
│   ├── posts.js       # upload, like, comment, delete, single post
│   └── users.js       # profile pages
├── views/             # EJS templates
├── public/            # CSS + client JS
└── uploads/           # User-uploaded images (gitignored)
```

## Security notes

- Passwords hashed with **bcryptjs**
- **Parameterized SQL** everywhere (no injection)
- **CSRF tokens** on all state-changing forms
- **Session cookies** are `httpOnly` + `sameSite=lax`
- Uploads restricted by **type and size**, filenames randomized

> **Production checklist:** set a strong `SESSION_SECRET`, use a real session
> store (e.g. Redis) instead of the default in-memory store, serve over HTTPS,
> and put uploads on object storage (S3/GCS) with a CDN.

## Roadmap (next steps)

- [ ] Follow / unfollow + personalized feed
- [ ] Explore / trending page
- [ ] Profiles: edit bio & avatar
- [ ] Search users
- [ ] Mobile app (React Native / Expo) reusing this API
- [ ] Image resizing + CDN

## License

MIT
