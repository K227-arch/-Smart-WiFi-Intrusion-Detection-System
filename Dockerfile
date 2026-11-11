# ═══════════════════════════════════════════════════════════════════════════════
# SALAMANDA WIDS — Production Dockerfile
# Multi-stage build targeting linux/amd64 + linux/arm64
#
# Live packet capture on Linux:
#   docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
#
# Windows/macOS:
#   docker compose up -d  → runs in simulator mode (synthetic traffic)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Builder (compile frontend + server bundle) ───────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Build tools needed to compile native modules (cap, onnxruntime-node)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libpcap-dev \
    && rm -rf /var/lib/apt/lists/*

# Install ALL dependencies (including devDeps) for the build step
# --ignore-scripts avoids downloading electron/onnxruntime prebuilt binaries
# (we only need the JS source for Vite/esbuild bundling, not native addons)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build && npm run build:server

# ── Stage 2: Production runner ───────────────────────────────────────────────
FROM node:20-slim AS runner

LABEL org.opencontainers.image.title="SALAMANDA WIDS" \
      org.opencontainers.image.description="Smart Adaptive Local Area Monitoring And Network Defense Architecture" \
      org.opencontainers.image.version="2.0.0" \
      org.opencontainers.image.source="https://github.com/K227-arch/-Smart-WiFi-Intrusion-Detection-System" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Runtime dependencies:
#   libpcap0.8   — packet capture library (live mode on Linux)
#   libcap2-bin  — provides setcap/getcap for granting NET_RAW without root
#   wget         — healthcheck
#   iproute2     — ip link show (interface discovery)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpcap0.8 libcap2-bin wget iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install production deps INCLUDING optional native modules (cap, onnxruntime-node)
# --ignore-scripts=false lets cap compile against libpcap-dev headers
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ libpcap-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy static assets
COPY --from=builder /app/models ./models
COPY --from=builder /app/data/wids-config.json ./data/wids-config.json
COPY --from=builder /app/data/wids.rules ./data/wids.rules

# Copy entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Ensure data directory exists for runtime-generated files
# (alerts, sessions, users will be written here by the app)
RUN mkdir -p /app/data

EXPOSE 3000

# Healthcheck — /api/status returns JSON when server is ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/status || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/server.cjs"]
