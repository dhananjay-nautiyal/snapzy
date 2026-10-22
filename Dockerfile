# Snapzy — Docker image (works on Fly.io, Railway, Render, any container host)
FROM node:24-slim

# node:sqlite is built into Node 24 — no native build tools needed.
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source
COPY . .

# Seed data + uploads live here; mount a volume at /app/data for persistence.
ENV DATABASE_PATH=/app/data/snapzy.db
RUN mkdir -p /app/data uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Seed (idempotent) then start
CMD ["sh", "-c", "npm run seed && node server.js"]
