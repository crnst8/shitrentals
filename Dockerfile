# syntax=docker/dockerfile:1

# ---- builder: install deps, compile better-sqlite3, build the frontend ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 is a native module with no prebuilt binary here, so it is
# compiled from source and needs python3 + a C/C++ toolchain at install time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runner: lean image with the compiled module + built assets ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Carry over the already-compiled node_modules (same base image = matching ABI),
# the built frontend, the server, and the data snapshot the DB is seeded from.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
COPY data/reviews.json ./data/reviews.json

# The SQLite DB is rebuilt from data/reviews.json on first start. Keep it on a
# writable volume so it survives restarts. DB_PATH points the app at the volume.
ENV PORT=3001
ENV DB_PATH=/data/shitrentals.db
VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/app.js"]
