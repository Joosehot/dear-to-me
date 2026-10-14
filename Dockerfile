# Dear to Me: the site built, and the server run with tsx (as `npm start` runs it).
#
# The server stays TypeScript run by tsx rather than compiled: it finds dist/, index.html and the
# .env beside the app from its own folder (import.meta.dirname/..), which compiling into another
# folder would move, and tsx is what the checks and `npm start` run, so production runs the same code.
#
#   docker build -t d2m .
#   docker run -p 5174:5174 -v d2m-data:/data --env-file deploy/.env d2m
# (deploy/docker-compose.yml runs it behind Caddy, with HTTPS.)

# ---- the site: the client built into dist/ (tsc checks the whole project first) ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- the production dependencies only (tsx among them) ----
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- the runtime ----
FROM node:24-bookworm-slim
# FFmpeg reads a vlog's length and makes its smaller copy
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    D2M_DATA=/data \
    PORT=5174
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json index.html ./
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
COPY --from=build /app/dist ./dist
# the data (db.sqlite, uploads/, backups/) lives in a volume, owned by the user the server runs as
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 5174
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5174) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# node itself as the main process (not npm), so SIGTERM from `docker stop` reaches the server's shutdown
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "tsx", "server/index.ts"]
