#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════════
# SALAMANDA WIDS — Docker Entrypoint
# Runs at container boot to:
#   1. Grant CAP_NET_RAW+CAP_NET_ADMIN to node binary (live capture on Linux)
#   2. Validate critical env vars and warn about missing optional ones
#   3. Exec the main process
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# ── 1. Packet Capture Capabilities ───────────────────────────────────────────
# Try to grant NET_RAW+NET_ADMIN to the node binary so the app can open raw
# sockets without running as root. This requires the container to have been
# started with --cap-add=NET_RAW --cap-add=NET_ADMIN (or equivalent).
# Silently skips when capabilities are unavailable (Windows/macOS Docker Desktop).
NODE_BIN=$(command -v node 2>/dev/null || true)
if [ -n "$NODE_BIN" ] && command -v setcap >/dev/null 2>&1; then
  NODE_REAL=$(readlink -f "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")
  if setcap cap_net_raw,cap_net_admin=eip "$NODE_REAL" 2>/dev/null; then
    echo "✓ Live capture capabilities granted to node"
  else
    echo "⚠  Could not set capabilities on node — live capture may be unavailable."
    echo "   Add --cap-add=NET_RAW --cap-add=NET_ADMIN to docker run, or use:"
    echo "   docker compose -f docker-compose.yml -f docker-compose.override.yml up"
  fi
fi

# ── 2. Environment validation ─────────────────────────────────────────────────
# Supabase DB sync (optional — app runs fully local without it)
if [ -z "$SUPABASE_SECRET_KEY" ]; then
  echo "ℹ  SUPABASE_SECRET_KEY not set — DB sync disabled, running fully local."
fi

# Gemini AI (optional — terminal AI agent won't work without it)
if [ -z "$GEMINI_API_KEY" ]; then
  echo "ℹ  GEMINI_API_KEY not set — Terminal AI agent disabled."
fi

# SMTP (optional — OTP shown in login UI instead of emailed)
if [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASS" ]; then
  echo "ℹ  SMTP not configured — OTP codes will appear in the login UI."
fi

# ── 3. Interface info ─────────────────────────────────────────────────────────
if command -v ip >/dev/null 2>&1; then
  echo "ℹ  Available interfaces: $(ip -o link show | awk -F': ' '{print $2}' | tr '\n' ' ')"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SALAMANDA WIDS v2.0.0 — http://0.0.0.0:${PORT:-3000}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 4. Hand off to CMD ────────────────────────────────────────────────────────
exec "$@"
