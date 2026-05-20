#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SALAMANDA WIDS — One-time capture privilege setup (Linux)
#
# Grants CAP_NET_RAW + CAP_NET_ADMIN to the node binary so any user can
# run live packet capture without sudo.
#
# Run ONCE with sudo:
#   sudo bash scripts/setup-capture-linux.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

NODE_BIN=$(which node)
if [ -z "$NODE_BIN" ]; then
  echo "✗ node not found in PATH"
  exit 1
fi

# Resolve symlinks to get the real binary
NODE_REAL=$(readlink -f "$NODE_BIN")
echo "→ Setting capabilities on: $NODE_REAL"

# Install libcap if needed
if ! command -v setcap &>/dev/null; then
  echo "→ Installing libcap2-bin..."
  apt-get install -y libcap2-bin 2>/dev/null || yum install -y libcap 2>/dev/null || true
fi

# Grant packet capture capabilities
setcap cap_net_raw,cap_net_admin=eip "$NODE_REAL"

echo ""
echo "✓ Capabilities set:"
getcap "$NODE_REAL"
echo ""
echo "You can now run:  npm run dev"
echo "without sudo and get live packet capture."
