---
description: Repo-specific guidance for SALAMANDA WIDS
globs: *
alwaysApply: true
---

# SALAMANDA WIDS — Agent Instructions

Project: **Smart Adaptive Local Area Monitoring And Network Defense Architecture** (v2, MIT).
`package.json` name `react-example` is a template artifact — ignore it.

## Commands

| Command | Action |
|---------|--------|
| `npm run dev` | Start full server (Express + Vite SPA) on `:3000` via `tsx server.ts` |
| `npm run build` | Vite frontend build |
| `npm run build:server` | esbuild server bundle → `dist/server.cjs` |
| `npm run lint` | `tsc --noEmit` (no ESLint/Prettier) |
| `npm run clean` | Remove `dist/` and `server.js` |

No tests exist (no test framework, zero test files).

Production requires **both** builds: `npm run build` then `npm run build:server`.

## Architecture — Non-Obvious

- **Two Express apps**: `server.ts` (full 2377-line app for local/Docker) vs `api/index.ts` (lightweight Vercel serverless stub).
- **Monolithic**: Express serves the Vite-built SPA + all API endpoints on one port.
- **Three parallel detection pipelines**: Signature (Snort rules + NetworkAnalyzer) → Statistical Anomaly (Welford online, 3.5σ) → ML Scoring (3 ONNX models).
- **Auth is self-contained** (scrypt + 2FA OTP, JSON file sessions in `data/`) — NOT InsForge auth.
- **Realtime via SSE** at `/api/stream`.
- **Simulator fallback**: when `cap` native module unavailable, auto-generates 5 pkt/s synthetic traffic.
- **ML training**: Python scripts in `ml/` (scikit-learn → ONNX export).
- **10 dashboard tabs** in `src/tabs/`.

## Gotchas

- `@/*` path alias maps to **project root** (`./*`), not `src/*`.
- Tailwind **v4** with `@tailwindcss/vite` plugin — no `tailwind.config.js`, no PostCSS config.
- `onnxruntime-node` and `cap` are `optionalDependencies` — app runs without them (simulator mode).
- `data/*.json` for persistence (config, alerts, users, sessions, rules).
- `CAPTURE_IFACE` env var selects network interface; `CAPTURE_FILTER` for BPF filter.
- `GEMINI_API_KEY` required for the terminal AI agent (`/api/terminal/ai`).

## Security

- Hardcoded InsForge anon key + Gemini API fallback key in `server.ts` and `api/index.ts`.
- `/api/terminal/exec` has **no command whitelist** (any shell command if authenticated).
- 2FA OTP printed to both UI and server console on every login.

## InsForge Integration

- Backend URL: `https://bh9n4s8r.us-east.insforge.app`.
- `@insforge/sdk` for optional PostgreSQL sync (alerts, devices, traffic_buckets, detection_stats, user_sessions, engine_config).
- All DB writes are fire-and-forget with silent error handling.
- Before editing InsForge integration code, call the `fetch-docs` or `fetch-sdk-docs` MCP tool.

## Docker

- Multi-stage `Dockerfile` on `node:20-alpine`.
- Requires `CAP_NET_RAW` + `CAP_NET_ADMIN` Linux capabilities for live capture.
- `docker-compose.yml` with healthcheck (`/api/status`) and named volume.

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **SMART WIFI INTRUSION DETECTION** (API base `https://bh9n4s8r.us-east.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->
