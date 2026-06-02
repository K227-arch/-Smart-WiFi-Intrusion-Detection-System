<div align="center">
<img width="1200" height="475" alt="SALAMANDA WIDS Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# SALAMANDA — Smart WiFi Intrusion Detection System

**Real-time 802.11 + network threat detection powered by ONNX ML, Snort-style rules, and statistical anomaly analysis.**

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-yellow)

</div>

---

## Overview

SALAMANDA is a full-stack wireless intrusion detection system that monitors your network in real time and raises alerts for a broad range of threats — from rogue access points and deauthentication floods to TCP port scans, ARP spoofing, DNS tunnelling, and ML-detected anomalies.

It runs entirely on your local machine with no cloud dependency for detection. An optional [InsForge](https://insforge.app) backend provides persistent storage and multi-user real-time sync when reachable.

---

## Features

### Detection Engines

| Engine | What it catches |
|--------|----------------|
| **Signature / Snort rules** | Rogue AP, Deauth flood, MAC spoofing, Channel anomaly, Port scan, Brute force, SYN flood, ARP scan, ICMP flood, DNS tunnelling/exfiltration |
| **Statistical anomaly** | Per-device Welford baseline — fires when packet rate, deauth ratio, or port diversity exceeds 3.5 σ from the device's own learned normal |
| **ONNX ML v1** (wireless RF) | 5-feature Random Forest scorer per device window → 0–1 malicious probability |
| **ONNX ML v2** (NSL-KDD RF) | 10-feature network classifier → Normal / DoS / Probe / R2L / U2R |
| **Naive Bayes fallback** | Lightweight backup when RF v2 fails to load |

### Dashboard

- **Live Traffic** — real-time packet table with src/dst MAC, src/dst port, IP, protocol, signal strength
- **Alerts / Forensic Logs** — filterable by type and severity, CSV export, dismiss as false positive
- **Device Registry** — IP + hostname, trust/block management
- **Analytics** — detection counts, false positive rates, accuracy per attack type
- **ML Engine** — live per-device anomaly scores, thesis evaluation matrix, radar chart
- **Network Monitor** — ARP binding table, TCP/UDP flow table, DNS query log
- **Snort Rules** — live rule editor with file persistence
- **Settings** — known networks, trusted MACs, detection thresholds

### Auth

- Email + password sign-up / sign-in
- **2FA OTP on every login** — 6-digit code printed to the server console (dev mode) and displayed directly in the UI
- Self-contained — no external auth service required; users and sessions stored locally in `data/`

---

## Quick Start

### Prerequisites

- **Node.js 20+**
- Windows: install [Npcap](https://npcap.com/) for live packet capture (optional — simulator runs without it)
- macOS / Linux: run `sudo npm run setup:capture` once to grant libpcap permissions

### Install & run

```bash
git clone https://github.com/your-org/salamanda-wids.git
cd salamanda-wids
npm install
npm run dev
```

Open **http://localhost:3000** — create an account, enter the OTP shown in the UI, and you're in.

### With live capture (macOS / Linux)

```bash
sudo npm run setup:capture   # one-time permission grant
npm run dev
```

### Docker (recommended for full feature set)

```bash
docker compose up
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (React + Vite)             │
│  Dashboard · Alerts · ML · Network · Snort · Auth   │
└──────────────────┬──────────────────────────────────┘
                   │  HTTP + SSE (localhost:3000)
┌──────────────────▼──────────────────────────────────┐
│              Express Server (server.ts)              │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ PacketCapture│  │NetworkAnalyzer│  │ ONNX Models│ │
│  │ (libpcap /  │  │ ARP · TCP    │  │ RF v1/v2   │ │
│  │  simulator) │  │ DNS · ICMP   │  │ Naive Bayes│ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                │         │
│  ┌──────▼────────────────▼────────────────▼──────┐  │
│  │           Detection Engine                     │  │
│  │  Signature · Statistical Anomaly · ML Scoring │  │
│  └────────────────────┬──────────────────────────┘  │
│                       │ Alerts · SSE broadcast       │
│  ┌────────────────────▼──────────────────────────┐  │
│  │  Local Auth  │  InsForge DB (optional)         │  │
│  │  (crypto)    │  alerts · devices · traffic     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## ML Models

Three ONNX models live in `/models/`:

| Model | File | Features | Classes |
|-------|------|----------|---------|
| Wireless RF | `wids_rf.onnx` | 5 (packet rate, deauth ratio, beacon ratio, channels, signal) | Normal / Suspicious / Malicious |
| NSL-KDD RF | `wids_rf_v2.onnx` | 10 (duration, protocol, bytes, counts, error rates) | Normal / DoS / Probe / R2L / U2R |
| Naive Bayes | `wids_nb_v2.onnx` | 10 (same as above) | Same 5 classes |

Retrain with:

```bash
cd ml
pip install scikit-learn skl2onnx numpy
python train_nslkdd.py
```

---

## Environment

| Variable | Purpose |
|----------|---------|
| `CAPTURE_IFACE` | Override the auto-detected network interface |
| `CAPTURE_FILTER` | BPF filter string for libpcap (e.g. `tcp or udp`) |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Vite + Express) |
| `npm run build` | Build frontend for production |
| `npm run start` | Run production build |
| `npm run setup:capture` | Grant libpcap permissions (macOS, run once with sudo) |
| `npm run setup:capture:linux` | Grant libpcap permissions (Linux, run once with sudo) |

---

## Thesis Evaluation (Chapter 6)

| Attack Type | Precision | Recall | F1-Score |
|-------------|-----------|--------|----------|
| Port Scan | 95% | 96% | 95% |
| Brute Force | 93% | 94% | 93% |
| DoS | 97% | 98% | 97% |
| Rogue AP | 94% | 95% | 94% |
| MAC Spoofing | 91% | 92% | 91% |

Overall accuracy: **96%** · Macro F1: **94%**

---

## License

MIT © 2025 SALAMANDA Project
