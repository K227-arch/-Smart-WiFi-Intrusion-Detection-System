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
# When the container is started with --cap-add=NET_RAW --cap-add=NET_ADMIN
# (see docker-compose.override.yml), root inside the container already has
# those capabilities — no setcap needed.
# We only apply setcap when running as a non-root user (future enhancement).
echo "ℹ  Running as $(id -u 2>/dev/null || echo 'root') — packet capture uses container capabilities."

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
