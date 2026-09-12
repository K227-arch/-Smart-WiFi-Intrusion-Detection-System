# SALAMANDA WIDS - Cross-Platform Deployment Guide

## Quick Start

### Windows
```batch
deploy.bat
```
Access: http://localhost:3001

### macOS / Linux
```bash
chmod +x deploy.sh
./deploy.sh
```
Access: http://localhost:3001

---

## Platform Support

| OS | Packet Capture | Method |
|----|----------------|--------|
| **Windows** | Simulator mode (synthetic traffic) | Docker container |
| **macOS** | Simulator mode | Docker container |
| **Linux** | Live capture | Docker + host networking |

### For Live Packet Capture (Linux Only)

1. Copy and edit the override file:
```bash
cp docker-compose.override.example.yml docker-compose.override.yml
```

2. Edit `docker-compose.override.yml` and set your interface:
```yaml
CAPTURE_IFACE: wlan0  # or eth0, en0, etc.
```

3. Restart:
```bash
docker-compose down
docker-compose up -d
```

---

## Docker Commands

| Command | Description |
|---------|-------------|
| `docker-compose up -d` | Start in background |
| `docker-compose down` | Stop and remove |
| `docker-compose logs -f` | View live logs |
| `docker-compose restart` | Restart container |
| `docker-compose ps` | Check status |

---

## Environment Variables

Create a `.env` file (see `.env.example`):

```env
GEMINI_API_KEY=your_api_key
APP_URL=http://localhost:3001
CAPTURE_IFACE=eth0           # Linux only
CAPTURE_FILTER=              # Optional BPF filter
```

---

## Ports

- **3001** - Web dashboard
- **3000** - Internal (container)

---

## Troubleshooting

### Docker not running?
- **Windows:** Start Docker Desktop, wait for whale icon to settle
- **macOS:** Start Docker Desktop
- **Linux:** `sudo systemctl start docker`

### Container won't start?
```bash
docker-compose logs
```

### Need Npcap for Windows native?
Download: https://npcap.com/#download (enable "Install Npcap in WinPcap-compatible mode")

---

## Production Deployment

For production on a Linux server:

```bash
# Set interface for monitoring
export CAPTURE_IFACE=wlan0

# Use host networking for live capture
cp docker-compose.override.example.yml docker-compose.override.yml
# Edit the file to uncomment host networking section

# Deploy
docker-compose up -d
```