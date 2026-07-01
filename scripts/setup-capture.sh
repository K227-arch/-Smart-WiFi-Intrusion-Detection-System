#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SALAMANDA WIDS — One-time capture privilege setup (macOS)
#
# This script grants packet capture access to the 'admin' group by:
#   1. Installing a launchd daemon that fixes /dev/bpf* permissions at boot
#   2. Applying the fix immediately so you don't need to reboot
#
# Run ONCE with sudo:
#   sudo bash scripts/setup-capture.sh
#
# After this, any admin user can run `npm run dev` without sudo and get
# live packet capture.
# ─────────────────────────────────────────────────────────────────────────────

set -e

PLIST_PATH="/Library/LaunchDaemons/com.salamanda.bpf.plist"
SCRIPT_PATH="/Library/Application Support/Salamanda/fix-bpf.sh"

echo "→ Installing SALAMANDA BPF capture privilege helper..."

# Create the helper script directory
mkdir -p "/Library/Application Support/Salamanda"

# Write the BPF fix script (runs at every boot)
cat > "$SCRIPT_PATH" << 'FIXSCRIPT'
#!/bin/bash
# Grant admin group read/write access to all BPF devices
for dev in /dev/bpf*; do
  chgrp admin "$dev"
  chmod g+rw "$dev"
done
FIXSCRIPT

chmod +x "$SCRIPT_PATH"

# Write the launchd plist
cat > "$PLIST_PATH" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.salamanda.bpf</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Library/Application Support/Salamanda/fix-bpf.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/var/log/salamanda-bpf.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/salamanda-bpf.log</string>
</dict>
</plist>
PLIST

# Set correct ownership on the plist
chown root:wheel "$PLIST_PATH"
chmod 644 "$PLIST_PATH"

# Load the daemon immediately (applies fix right now without reboot)
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

# Apply the fix right now
bash "$SCRIPT_PATH"

echo ""
echo "✓ BPF permissions fixed. Current /dev/bpf* permissions:"
ls -la /dev/bpf* 2>/dev/null | head -6

echo ""
echo "✓ launchd daemon installed — permissions will be restored automatically at every boot."
echo ""
echo "You can now run:  npm run dev"
echo "without sudo and get live packet capture."
