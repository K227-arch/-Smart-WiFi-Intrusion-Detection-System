# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools needed for native modules (cap, onnxruntime-node)
RUN apk add --no-cache python3 make g++ linux-headers libpcap-dev

COPY package*.json ./
# Install ALL deps (including devDeps) for the build stage
RUN npm ci

COPY . .

# Build frontend (Vite) + bundle server (esbuild)
RUN npm run build && npm run build:server

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Runtime deps for packet capture
RUN apt-get update && apt-get install -y --no-install-recommends libpcap0.8 wget && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist/server.cjs ./dist/server.cjs

# Copy models, data defaults
COPY --from=builder /app/models ./models
COPY --from=builder /app/data/wids-config.json ./data/wids-config.json

# Note: For live capture, add cap_add: [NET_RAW, NET_ADMIN] in docker-compose
# RUN setcap cap_net_raw,cap_net_admin=eip $(which node)

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
