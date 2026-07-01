# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools needed for native modules (cap, onnxruntime-node)
RUN apk add --no-cache python3 make g++ linux-headers libpcap-dev

COPY package*.json ./
# Install ALL deps (including devDeps) for the build stage
RUN npm install --legacy-peer-deps

COPY . .

# Build frontend (Vite) + bundle server (esbuild)
RUN npm run build && npm run build:server

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Runtime deps for native modules + libcap for capability setting
RUN apk add --no-cache libpcap libcap

COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# Copy models, data defaults
COPY --from=builder /app/models ./models
COPY --from=builder /app/data ./data

# Grant CAP_NET_RAW to node so packet capture works without running as root
RUN setcap cap_net_raw,cap_net_admin=eip $(which node)

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
