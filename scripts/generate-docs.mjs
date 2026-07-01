import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, PageBreak, TableOfContents,
  NumberFormat, convertInchesToTwip, Header, Footer, Tab,
} from "docx";
import fs from "fs";
import path from "path";

// ── Helpers ───────────────────────────────────────────────────────────────────
const C = {
  amber:  "F59E0B",
  slate:  "1E293B",
  white:  "FFFFFF",
  gray:   "64748B",
  dark:   "0F172A",
  green:  "10B981",
  red:    "F43F5E",
  violet: "8B5CF6",
  blue:   "3B82F6",
};

const h = (text, level = HeadingLevel.HEADING_1, opts = {}) => new Paragraph({
  text,
  heading: level,
  spacing: { before: 300, after: 120 },
  ...opts,
});

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, size: 22, color: "1E293B" })],
  spacing: { after: 160 },
  ...opts,
});

const bold = (text, color = "1E293B") =>
  new TextRun({ text, bold: true, size: 22, color });

const normal = (text) =>
  new TextRun({ text, size: 22, color: "1E293B" });

const code = (text) =>
  new TextRun({ text, font: "Courier New", size: 18, color: "8B5CF6",
    highlight: "yellow" });

const bullet = (text, level = 0) => new Paragraph({
  children: [new TextRun({ text, size: 22, color: "1E293B" })],
  bullet: { level },
  spacing: { after: 80 },
});

const mixed = (...runs) => new Paragraph({
  children: runs,
  spacing: { after: 140 },
});

const divider = () => new Paragraph({
  text: "",
  border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" } },
  spacing: { before: 200, after: 200 },
});

const infoBox = (label, ...lines) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: [
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: "FEF3C7" },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 2, color: "F59E0B" },
          left: { style: BorderStyle.SINGLE, size: 6, color: "F59E0B" },
          right: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
        },
        children: [
          new Paragraph({ children: [bold(label, "92400E")], spacing: { after: 60 } }),
          ...lines.map(l => p(l)),
        ],
        margins: { top: 100, bottom: 100, left: 180, right: 120 },
      }),
    ]}),
  ],
});


const twoColTable = (rows, headerA, headerB) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      tableHeader: true,
      children: [headerA, headerB].map(h => new TableCell({
        shading: { type: ShadingType.CLEAR, color: "1E293B" },
        children: [new Paragraph({ children: [bold(h, "FFFFFF")], spacing: { after: 0 } })],
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
      })),
    }),
    ...rows.map((row, i) => new TableRow({
      children: row.map(cell => new TableCell({
        shading: { type: ShadingType.CLEAR, color: i % 2 === 0 ? "F8FAFC" : "FFFFFF" },
        children: [new Paragraph({ children: [normal(cell)], spacing: { after: 0 } })],
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
      })),
    })),
  ],
});

// ── Cover page ────────────────────────────────────────────────────────────────
const coverPage = [
  new Paragraph({ text: "", spacing: { after: 1200 } }),
  new Paragraph({
    children: [new TextRun({ text: "SALAMANDA", bold: true, size: 96, color: C.amber })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Smart WiFi Intrusion Detection System", size: 40, color: C.gray })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "System Documentation v2.0", bold: true, size: 32, color: C.slate })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Technical & User Reference Manual", size: 26, color: C.gray })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 800 },
  }),
  divider(),
  new Paragraph({ text: "", spacing: { after: 200 } }),
  new Paragraph({
    children: [new TextRun({ text: `Produced: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, size: 22, color: C.gray })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Classification: Internal / Confidential", size: 22, color: C.gray })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ children: [new PageBreak()] }),
];


// ── Section 1 — Executive Summary ────────────────────────────────────────────
const section1 = [
  h("1. Executive Summary"),
  p("SALAMANDA (Smart Adaptive Local Area Monitoring And Network Defense Architecture) is a full-stack, real-time Wireless Intrusion Detection System (WIDS) designed for deployment in SMEs, academic institutions, and enterprise environments. It provides continuous monitoring of both wireless (802.11) and wired network traffic, combining signature-based rules, statistical anomaly detection, and machine learning inference to identify and alert on a broad spectrum of cyber threats."),
  p("Unlike cloud-dependent security platforms, SALAMANDA runs entirely on-premises — a single Node.js process captures live packets from the host machine's network interface, runs ONNX-powered ML models locally, and serves a React-based dashboard to authorized users over the LAN. No data leaves the premises."),
  infoBox("Key Metrics at a Glance",
    "• Detection accuracy: 96% overall (Chapter 6 thesis evaluation)",
    "• Supported attack types: 12+ including Rogue AP, Deauth Flood, MAC Spoofing, SYN Flood, DNS Tunneling, ARP Spoofing, Port Scan, Brute Force",
    "• ML models: 3 ONNX models (Random Forest v1, Random Forest v2 NSL-KDD, Gaussian Naive Bayes fallback)",
    "• Response latency: < 200 ms from packet capture to alert",
    "• Auth: Email + 2FA OTP — no external auth service required",
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Section 2 — System Overview ───────────────────────────────────────────────
const section2 = [
  h("2. System Overview"),
  h("2.1 Purpose and Scope", HeadingLevel.HEADING_2),
  p("SALAMANDA addresses the growing need for affordable, intelligent network security monitoring in environments that lack dedicated security operations centres (SOCs). It is purpose-built to:"),
  bullet("Detect wireless attacks in real time on 802.11 WiFi networks"),
  bullet("Monitor Ethernet-connected hosts for TCP/UDP layer threats"),
  bullet("Apply machine learning to identify anomalous device behaviour"),
  bullet("Provide a clear, web-based interface accessible to non-specialist staff"),
  bullet("Give network personnel full shell access for hands-on diagnostics"),
  bullet("Generate forensic logs exportable to CSV for incident reporting"),
  new Paragraph({ text: "", spacing: { after: 80 } }),
  h("2.2 Target Environments", HeadingLevel.HEADING_2),
  twoColTable([
    ["Small to Medium Enterprises (SMEs)", "Guest WiFi monitoring, rogue AP detection, unauthorized device alerts"],
    ["Academic Institutions", "Campus network security, student device management, research lab protection"],
    ["Healthcare Facilities", "Medical IoT device monitoring, HIPAA-relevant anomaly detection"],
    ["Government Offices", "Sensitive network protection, insider threat detection"],
    ["Home Labs / Research", "Security research, thesis evaluation, proof-of-concept deployments"],
  ], "Environment", "Use Case"),
  new Paragraph({ text: "", spacing: { after: 200 } }),
  h("2.3 Architecture Overview", HeadingLevel.HEADING_2),
  p("SALAMANDA follows a monolithic-server, single-page-application architecture:"),
  bullet("Backend: Node.js + Express (TypeScript), compiled via tsx"),
  bullet("Frontend: React 19 + Vite 6 + Tailwind CSS 3.4"),
  bullet("Database: InsForge (PostgreSQL-compatible, optional) + local JSON fallback"),
  bullet("Realtime: Server-Sent Events (SSE) for live packet streaming; InsForge WebSocket pub/sub for multi-user alert sync"),
  bullet("ML Runtime: onnxruntime-node — ONNX models run in-process with no Python dependency at runtime"),
  bullet("Packet Capture: libpcap via the `cap` native module (Npcap on Windows)"),
  new Paragraph({ children: [new PageBreak()] }),
];


// ── Section 3 — Detection Engines ────────────────────────────────────────────
const section3 = [
  h("3. Detection Engines"),
  p("SALAMANDA employs three complementary detection layers that operate concurrently on every packet:"),

  h("3.1 Signature-Based Detection (Snort-Style Rules)", HeadingLevel.HEADING_2),
  p("The first layer matches incoming packets against a library of known attack patterns. Rules are stored in Snort syntax in data/wids.rules and are editable at runtime from the Snort Rules tab without restarting the server."),
  twoColTable([
    ["Rogue AP (Evil Twin)", "Beacon frame from an SSID matching a configured known network but with a different BSSID."],
    ["Deauth Flood (DoS)", "≥ N deauthentication frames from the same source MAC within a configurable rolling window."],
    ["MAC Spoofing", "A known SSID broadcasted from a BSSID not previously associated with that SSID."],
    ["Channel Anomaly", "A known BSSID suddenly transmitting on a different channel — common in Evil Twin attacks."],
    ["Unauthorized Device", "A new MAC address seen on the network that is not in the trusted whitelist (fires once per device)."],
    ["Port Scan (WiFi)", "A source MAC probing 6+ unique BSSID/channel combinations within 5 seconds."],
    ["Brute Force", "10+ repeated management (auth/assoc) frames from the same source within 5 seconds."],
    ["SYN Flood", "50+ TCP SYN packets from the same IP within 5 seconds (NetworkAnalyzer layer)."],
    ["ARP Spoofing", "An IP address claiming a different MAC than previously recorded in the ARP table."],
    ["ARP Scan", "20+ ARP requests from the same MAC within 5 seconds."],
    ["ICMP Flood", "100+ ICMP packets from the same source within 5 seconds."],
    ["DNS Tunneling", "DNS query with subdomain Shannon entropy > 3.8 bits (data exfiltration indicator)."],
    ["DNS Exfiltration", "DNS query with more than 4 subdomain labels (encoded data smuggling)."],
    ["TCP RST Storm", "More than 10 TCP RST packets on a single flow."],
  ], "Attack Type", "Detection Rule"),
  new Paragraph({ text: "", spacing: { after: 160 } }),

  h("3.2 Statistical Anomaly Detection (Per-Device Welford Baseline)", HeadingLevel.HEADING_2),
  p("Each device builds its own rolling statistical baseline using Welford's online algorithm — a numerically stable method for computing mean and variance incrementally without storing all past values. The system tracks three features per device across 10-second windows:"),
  bullet("Packet Rate — packets per second from this device"),
  bullet("Deauth Ratio — fraction of packets that are deauthentication frames"),
  bullet("Port Diversity — number of unique destination ports contacted in the window"),
  p("An ANOMALY alert fires when any feature deviates more than 3.5 standard deviations from the device's own learned mean. A minimum of 5 baseline windows must be observed before alerting begins, preventing cold-start false positives."),
  infoBox("Why Per-Device Baselines Matter",
    "A global baseline would flag a server that legitimately sends 10,000 packets/second as anomalous. Per-device baselines mean the system learns what 'normal' looks like for each individual host and only alerts on deviations from that device's own behaviour."),
  new Paragraph({ text: "", spacing: { after: 160 } }),

  h("3.3 Machine Learning Scoring (ONNX Runtime)", HeadingLevel.HEADING_2),
  p("Three ONNX models run in-process via onnxruntime-node:"),
  twoColTable([
    ["Wireless RF v1\n(wids_rf.onnx)", "5 features: packet rate, deauth ratio, beacon ratio, unique channels, normalised signal strength.\nClasses: Normal / Suspicious / Malicious.\nFires ANOMALY alert when device is classified Malicious."],
    ["NSL-KDD RF v2\n(wids_rf_v2.onnx)", "10 features: duration, protocol type, src/dst bytes, land flag, wrong fragments, urgent count, connection count, service count, SYN error rate.\nClasses: Normal / DoS / Probe / R2L / U2R.\nRequires 92% confidence before alerting."],
    ["Naive Bayes NB\n(wids_nb_v2.onnx)", "Same 10 features as RF v2.\nLightweight fallback model used when RF v2 fails to load.\nGaussian Naive Bayes — faster inference, slightly lower accuracy."],
  ], "Model", "Features & Behaviour"),
  new Paragraph({ children: [new PageBreak()] }),
];


// ── Section 4 — Dashboard & UI Modules ───────────────────────────────────────
const section4 = [
  h("4. Dashboard Modules"),
  p("The SALAMANDA web interface is served at http://localhost:3000 and is accessible from any browser on the same network. It is organized into ten functional tabs:"),

  h("4.1 Dashboard (Home)", HeadingLevel.HEADING_2),
  p("The main dashboard provides an at-a-glance security posture view:"),
  bullet("KPI cards: Active Devices, Rogue APs detected, Deauth Events, MAC Spoofing incidents"),
  bullet("Live traffic area chart: Data, Beacons, and Deauth packet rates over rolling 30-second buckets"),
  bullet("ML Insight panel: AI-generated security assessment based on current alerts, devices, and ML scores"),
  bullet("Device inventory table: All detected devices with IP, hostname, MAC, SSID, signal strength, last seen, and trust status"),

  h("4.2 Live Traffic", HeadingLevel.HEADING_2),
  p("Real-time packet stream via Server-Sent Events (SSE). Each row shows:"),
  bullet("Timestamp (millisecond precision), Source MAC, Destination MAC, Frame type, Source Port, Destination Port, Signal strength (dBm)"),
  bullet("Expandable row: BSSID, Channel (2.4/5 GHz), SSID, Layer-3 IP addresses, Protocol"),
  bullet("Capture controls: Pause (keeps SSE connection open), Resume, Stop, Restart, Clear buffer"),
  bullet("Stats bar: Total packets, DATA, BEACONS, MGMT, DEAUTH counts, Average signal"),
  bullet("Cloud mode fallback: Graceful message when live capture is unavailable"),

  h("4.3 Device Registry", HeadingLevel.HEADING_2),
  p("All devices seen on the network with full detail cards. Features:"),
  bullet("Search by IP, hostname, MAC, or SSID"),
  bullet("Filter by trust status: Trusted / Unknown / Blocked"),
  bullet("Click any device to open a detail modal with signal history and management options"),
  bullet("Trust / Block actions are pushed to both the in-memory engine and the InsForge database in real time"),

  h("4.4 Forensic Logs (Alerts)", HeadingLevel.HEADING_2),
  bullet("Filterable by alert type (8 types) and severity (High / Medium / Low)"),
  bullet("Columns: Type with icon, Description, Severity badge, Target IP (with MAC secondary), Timestamp"),
  bullet("Expandable detail row: all contextual data (srcIp, dstIp, ports, confidence scores, detection method)"),
  bullet("Dismiss as false positive — increments FP counter for accuracy calculation"),
  bullet("Clear All — bulk dismiss"),
  bullet("Export CSV — downloads a spreadsheet of all current alerts"),

  h("4.5 Analytics", HeadingLevel.HEADING_2),
  bullet("Detection count bar chart per attack type"),
  bullet("False positive rates and real accuracy percentages (true positives / total detections)"),
  bullet("Device breakdown: Trusted / Unknown / Blocked"),
  bullet("Alert severity breakdown with time-series area chart"),

  h("4.6 ML Engine", HeadingLevel.HEADING_2),
  bullet("Thesis evaluation matrix: Precision, Recall, and F1-Score for each attack type from offline evaluation"),
  bullet("Radar chart: Precision, Recall, F1, Accuracy, Specificity"),
  bullet("Live ML Device Scores table: per-device anomaly score bar, packet rate, deauth ratio, channel count, classification badge"),
  bullet("Active Detection Methods summary: Signature / Anomaly / ML scoring status"),

  h("4.7 Network Monitor", HeadingLevel.HEADING_2),
  p("Four sub-tabs providing deep network visibility:"),
  bullet("Overview: Capture engine stats (live/simulator mode, interface, packet counts), ML models loaded"),
  bullet("ARP Table: IP → MAC bindings learned from live traffic; conflict count highlights spoofing"),
  bullet("Flow Table: Active TCP/UDP flows with src/dst IPs, ports, protocol, packet count, SYN count, state"),
  bullet("DNS Log: All DNS queries with source IP, suspicious flag, and reason (entropy, label depth)"),

  h("4.8 Snort Rules", HeadingLevel.HEADING_2),
  bullet("Live editor for the data/wids.rules file in Snort syntax"),
  bullet("Reload button applies changes to the running engine without restart"),
  bullet("Rule syntax highlighting and validation"),

  h("4.9 Settings", HeadingLevel.HEADING_2),
  bullet("Capture Interface: Lists all network adapters (WiFi and Ethernet) with IP, MAC, type. One-click selection — persisted to .env.local"),
  bullet("Known Networks: Add/remove SSID + BSSID + channel entries for Rogue AP and MAC Spoofing detection"),
  bullet("Trusted MAC Whitelist: Suppress Unauthorized Device alerts for known devices"),
  bullet("Detection Thresholds: Deauth threshold, deauth window (ms), alert dedup window (ms)"),
  bullet("Detection Rules Reference: Quick-reference card for all rule logic"),

  h("4.10 Network Terminal", HeadingLevel.HEADING_2),
  p("A full browser-based terminal with complete shell access for network engineers:"),
  bullet("Direct command input with command history (↑/↓), Tab autocomplete, Ctrl+L clear"),
  bullet("Quick-command palette: 21 pre-built commands in 6 groups (Network Info, DNS, Connectivity, WiFi, Security, System)"),
  bullet("Copy output to clipboard, clear buffer"),
  bullet("AI Agent (requires Gemini API key): Accept natural language tasks, plan and execute relevant commands, summarise results using Gemini 1.5 Flash"),
  new Paragraph({ children: [new PageBreak()] }),
];


// ── Section 5 — Authentication ────────────────────────────────────────────────
const section5 = [
  h("5. Authentication & Security"),
  h("5.1 Local Auth System", HeadingLevel.HEADING_2),
  p("SALAMANDA uses a self-contained authentication system requiring no external service. All user data is stored locally on the server machine:"),
  bullet("Users: data/wids-users.json (password hashed with scrypt, 64-byte key, random 16-byte salt)"),
  bullet("Sessions: data/wids-sessions.json (32-byte random hex tokens, 7-day expiry, auto-cleaned)"),
  bullet("OTPs: in-memory only, 10-minute expiry, not persisted"),

  h("5.2 Sign-Up Flow", HeadingLevel.HEADING_2),
  p("1. User submits email + password + name"),
  p("2. Server validates password length (min 6), checks for duplicate email, hashes password with scrypt"),
  p("3. A 6-digit OTP is generated and printed to the server console (dev mode — no email service configured)"),
  p("4. The OTP is also returned in the API response as devOtp and displayed in the login UI"),
  p("5. User enters OTP → session token issued → user logged in"),

  h("5.3 Sign-In Flow (2FA)", HeadingLevel.HEADING_2),
  p("1. User submits email + password → credentials validated"),
  p("2. If valid, a fresh OTP is generated and shown in the UI"),
  p("3. User enters OTP → existing sessions for this user preserved → new session token issued"),
  p("4. Session token stored in localStorage; all subsequent API calls send it in the Authorization header"),

  infoBox("Security Note",
    "In production, replace devOtp display with a real email delivery service (SendGrid, SES, etc.).",
    "The server-side logic is already structured to support this — simply remove the devOtp field from API responses and implement email dispatch in the /api/local-auth/signup and /api/local-auth/signin handlers.",
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Section 6 — How It Works (Data Flow) ─────────────────────────────────────
const section6 = [
  h("6. How It Works — End-to-End Data Flow"),

  h("6.1 Packet Capture", HeadingLevel.HEADING_2),
  p("On startup, the server auto-detects the active network interface (preference order: en1, en0, wlan0, WiFi, Ethernet). It then attempts to open a live libpcap capture session via the `cap` native module."),
  bullet("Windows: requires Npcap (https://npcap.com) to be installed"),
  bullet("macOS/Linux: run `sudo npm run setup:capture` once to grant capture permissions"),
  bullet("Fallback: if libpcap is unavailable, a built-in simulator generates synthetic traffic at 5 packets/second and periodically injects deauth floods, rogue APs, and port scans for testing"),

  h("6.2 Packet Parsing", HeadingLevel.HEADING_2),
  p("Each raw Ethernet frame is parsed by parseEthernetFrame() into a CapturedPacket object containing:"),
  bullet("Layer 2: Source MAC, Destination MAC, EtherType"),
  bullet("Layer 3: Source IP, Destination IP, Protocol (TCP/UDP/ICMP), TTL"),
  bullet("Layer 4: Source Port, Destination Port, TCP flags, payload length"),
  bullet("ARP: Operation (request/reply), sender/target IP and MAC"),
  bullet("DNS: Query name and type (parsed from UDP port 53 payload)"),

  h("6.3 Detection Pipeline", HeadingLevel.HEADING_2),
  p("Every parsed packet flows through three parallel pipelines:"),
  mixed(bold("Pipeline 1 — WiFi/802.11 Detection Engine: "), normal("Checks for Rogue AP, MAC Spoofing, Deauth Flood, Channel Anomaly, Unauthorized Device, Port Scan (WiFi), Brute Force. Fires alerts via addAlert().")),
  mixed(bold("Pipeline 2 — Network Analyzer (Layer 3/4): "), normal("Maintains ARP table, TCP flow table, SYN tracker, port scan tracker, ICMP tracker, DNS records. Fires ARP_SPOOFING, SYN_FLOOD, PORT_SCAN_TCP, DNS_TUNNELING, DNS_EXFILTRATION, ICMP_FLOOD, TCP_ANOMALY, ARP_SCAN alerts.")),
  mixed(bold("Pipeline 3 — ML Inference: "), normal("Per-device feature windows feed the ONNX models. RF v1 scores each device 0–1 every 10 seconds. NSL-KDD RF v2 classifies each packet into Normal/DoS/Probe/R2L/U2R at ≥92% confidence threshold.")),

  h("6.4 Alert Generation and Deduplication", HeadingLevel.HEADING_2),
  p("All detection paths call addAlert(alertData, dedupWindowMs). Before creating a new alert, it checks: is there already an alert of the same type from the same target within the dedup window? If yes, the alert is silently dropped. This prevents alert storms from a single sustained attack."),
  p("New alerts are:"),
  bullet("Stored in memory (up to 200, trimmed FIFO)"),
  bullet("Written to data/wids-alerts.json (last 200, last 24 hours)"),
  bullet("Written to InsForge PostgreSQL database (async, fire-and-forget)"),
  bullet("Broadcast via SSE to all connected browser clients"),
  bullet("Broadcast via InsForge realtime WebSocket for multi-user dashboards"),

  h("6.5 Frontend Updates", HeadingLevel.HEADING_2),
  p("The React frontend receives alerts in two ways:"),
  bullet("Initial load: fetches /api/alerts (or InsForge DB) on mount"),
  bullet("Realtime: InsForge WebSocket pushes new_alert events → React state updated inline (no reload)"),
  p("Live packet stream (Live Traffic tab) uses a dedicated SSE connection to /api/stream. Each packet event is a WiFiPacket JSON object. The browser updates local state only — no polling, no re-renders of other tabs."),

  new Paragraph({ children: [new PageBreak()] }),
];


// ── Section 7 — ML Models ─────────────────────────────────────────────────────
const section7 = [
  h("7. Machine Learning Models"),
  h("7.1 Training Data", HeadingLevel.HEADING_2),
  p("The NSL-KDD v2 models are trained on a synthetic dataset of 7,000 samples inspired by the NSL-KDD benchmark dataset, generated by ml/train_nslkdd.py. The dataset is class-balanced:"),
  twoColTable([
    ["Normal traffic", "3,000", "Varied protocols, realistic byte counts, low error rates"],
    ["DoS (SYN flood, ICMP flood)", "1,500", "Near-zero duration, very high connection counts, high SYN error rate"],
    ["Probe (port scan, network scan)", "1,000", "Short duration, high connection counts, low service count"],
    ["R2L (brute force, unauthorized)", "800", "Medium duration, high src_bytes, low error rate"],
    ["U2R (privilege escalation, anomaly)", "700", "Medium duration, non-zero urgent/wrong_fragment counts"],
  ], "Class", "Samples / Characteristics"),
  new Paragraph({ text: "", spacing: { after: 120 } }),

  h("7.2 Model Architecture", HeadingLevel.HEADING_2),
  p("Both production models use scikit-learn pipelines exported to ONNX opset 17 via skl2onnx:"),
  bullet("Random Forest: 150 estimators, max depth 10, min samples per leaf 3, balanced class weights"),
  bullet("Gaussian Naive Bayes: Default parameters, StandardScaler preprocessing"),
  p("The Wireless RF v1 model uses 5 features derived from per-device 10-second windows (packet rate, deauth ratio, beacon ratio, unique channels, normalised signal). It was trained separately on 802.11-specific feature distributions."),

  h("7.3 Evaluation Results (Chapter 6)", HeadingLevel.HEADING_2),
  twoColTable([
    ["Port Scan",   "95%", "96%", "95%"],
    ["Brute Force", "93%", "94%", "93%"],
    ["DoS Attack",  "97%", "98%", "97%"],
    ["Rogue AP",    "94%", "95%", "94%"],
    ["MAC Spoofing","91%", "92%", "91%"],
    ["Overall",     "94%", "95%", "96% accuracy"],
  ], "Attack Type  |  Precision", "Recall  |  F1-Score"),
  new Paragraph({ text: "", spacing: { after: 120 } }),

  h("7.4 Retraining", HeadingLevel.HEADING_2),
  p("To retrain the models with updated data:"),
  mixed(code("cd ml"), normal("")),
  mixed(code("pip install scikit-learn skl2onnx numpy"), normal("")),
  mixed(code("python train_nslkdd.py"), normal("")),
  p("The new .onnx files are automatically saved to /models/ and loaded on the next server restart."),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Section 8 — Installation & Deployment ────────────────────────────────────
const section8 = [
  h("8. Installation & Deployment"),
  h("8.1 Prerequisites", HeadingLevel.HEADING_2),
  bullet("Node.js 20 or later"),
  bullet("npm 9 or later"),
  bullet("Windows: Npcap 1.79+ (https://npcap.com) for live capture"),
  bullet("macOS/Linux: libpcap-dev (usually pre-installed)"),
  bullet("Python 3.8+ (optional — only needed to retrain ML models)"),

  h("8.2 Quick Start", HeadingLevel.HEADING_2),
  mixed(bold("Clone and install:"), normal("")),
  mixed(code("git clone https://github.com/K227-arch/-Smart-WiFi-Intrusion-Detection-System.git"), normal("")),
  mixed(code("cd -Smart-WiFi-Intrusion-Detection-System"), normal("")),
  mixed(code("npm install"), normal("")),
  mixed(bold("Configure (optional):"), normal(" Edit .env.local to set CAPTURE_IFACE or GEMINI_API_KEY")),
  mixed(bold("Run:"), normal("")),
  mixed(code("npm run dev"), normal("")),
  p("Open http://localhost:3000 in a browser, create an account, enter the OTP shown in the UI or server console."),

  h("8.3 Live Capture Setup", HeadingLevel.HEADING_2),
  mixed(bold("Windows: "), normal("Install Npcap from https://npcap.com. Run the app as Administrator if needed.")),
  mixed(bold("macOS: "), normal("Run once: sudo npm run setup:capture  then  npm run dev")),
  mixed(bold("Linux: "), normal("Run once: sudo npm run setup:capture:linux  then  npm run dev")),

  h("8.4 Docker Deployment", HeadingLevel.HEADING_2),
  mixed(code("docker compose up"), normal("")),
  p("The provided docker-compose.yml mounts the host network interface and runs the full stack including live capture."),

  h("8.5 Environment Variables", HeadingLevel.HEADING_2),
  twoColTable([
    ["CAPTURE_IFACE", "Override the auto-detected capture interface name (e.g. WiFi, eth0, wlan0)"],
    ["CAPTURE_FILTER", "BPF filter string for libpcap (e.g. 'tcp or udp'). Default: capture all."],
    ["GEMINI_API_KEY", "Google Gemini API key. Required to enable the AI Terminal Agent. Get free at aistudio.google.com/apikey"],
    ["APP_URL", "Public URL of the app (used for OAuth redirects if re-enabled). Default: http://localhost:3000"],
  ], "Variable", "Description"),
  new Paragraph({ children: [new PageBreak()] }),
];


// ── Section 9 — API Reference ─────────────────────────────────────────────────
const section9 = [
  h("9. API Reference"),
  p("All endpoints are served by the Express server at http://localhost:3000. Authentication uses Bearer tokens from the local auth system."),
  twoColTable([
    ["GET  /api/status",                "Engine status: monitoring state, packet count, detection counts, capture mode"],
    ["GET  /api/alerts",                "All active (non-dismissed) alerts, newest first"],
    ["DELETE  /api/alerts/:id",         "Dismiss a single alert (marks as false positive)"],
    ["DELETE  /api/alerts",             "Clear all alerts"],
    ["GET  /api/alerts/export",         "Download alerts as CSV"],
    ["GET  /api/devices",               "All detected devices"],
    ["POST  /api/devices/:mac/status",  "Set device status: trusted / unknown / blocked"],
    ["GET  /api/ml-results",            "Per-device ML anomaly scores"],
    ["GET  /api/network/interfaces",    "All active network interfaces with type, IP, MAC"],
    ["POST  /api/network/interfaces/select", "Select capture interface (saved to .env.local)"],
    ["GET  /api/network/arp",           "ARP binding table"],
    ["GET  /api/network/flows",         "Active TCP/UDP flow table"],
    ["GET  /api/network/dns",           "DNS query log"],
    ["GET  /api/network/stats",         "Capture engine and analyzer statistics"],
    ["GET  /api/snort-rules",           "Parsed Snort rules"],
    ["GET  /api/snort-rules/file",      "Raw rules file content"],
    ["PUT  /api/snort-rules/file",      "Save and hot-reload rules file"],
    ["POST  /api/snort-rules/reload",   "Reload rules from disk"],
    ["GET  /api/config",                "Engine configuration"],
    ["PUT  /api/config",                "Update engine configuration"],
    ["GET  /api/anomaly-baseline",      "Statistical anomaly baseline stats"],
    ["GET  /api/traffic/chart",         "Traffic bucket data for charts (last 12 × 30s buckets)"],
    ["GET  /api/stream",                "SSE stream: packet, alert, device, session events"],
    ["POST  /api/terminal/exec",        "Execute a shell command, returns {stdout, stderr}"],
    ["POST  /api/terminal/ai",          "AI agent: plan + execute + summarise a natural language task (Gemini)"],
    ["POST  /api/local-auth/signup",    "Create account with email + password + name"],
    ["POST  /api/local-auth/signin",    "Verify credentials, trigger OTP"],
    ["POST  /api/local-auth/verify-otp","Verify OTP, issue session token"],
    ["POST  /api/local-auth/resend-otp","Resend OTP to registered email"],
    ["GET  /api/local-auth/me",         "Get current user from Bearer token"],
    ["POST  /api/local-auth/signout",   "Invalidate session token"],
  ], "Endpoint", "Description"),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Section 10 — Importance & Threat Landscape ───────────────────────────────
const section10 = [
  h("10. Importance & Threat Landscape"),
  h("10.1 Why Wireless Security Matters", HeadingLevel.HEADING_2),
  p("Wireless networks are fundamentally more exposed than wired networks: any device within radio range can attempt to associate, inject frames, or conduct passive reconnaissance. The proliferation of IoT devices, BYOD policies, and remote work has dramatically expanded the attack surface in every type of organisation."),
  p("Common wireless attacks that SALAMANDA detects and mitigates awareness of:"),
  bullet("Evil Twin / Rogue AP: An attacker creates a look-alike access point to intercept all traffic passing through it (man-in-the-middle). SALAMANDA detects these within milliseconds of the first beacon frame."),
  bullet("Deauthentication DoS: 802.11 management frames (including deauth) are unauthenticated by default. An attacker can force all clients off a network with freely available tools (aircrack-ng, MDK4). SALAMANDA detects burst patterns above the threshold."),
  bullet("MAC Spoofing: A device impersonates a trusted MAC address to bypass MAC-based access controls or evade detection. SALAMANDA tracks SSID-to-BSSID bindings and alerts on new associations."),
  bullet("ARP Poisoning: By sending gratuitous ARP replies, an attacker can redirect all traffic from a target through their machine. SALAMANDA's ARP table binding tracker catches IP/MAC conflicts immediately."),
  bullet("DNS Tunneling: Malware exfiltrates data or maintains C2 communication by encoding payloads in DNS query subdomains. Shannon entropy analysis of subdomain labels detects this reliably."),
  bullet("Port Scanning and Brute Force: Reconnaissance and credential-stuffing attacks are detected by rate-based analysis at both the WiFi layer and the TCP/IP layer."),

  h("10.2 Cost of Wireless Incidents", HeadingLevel.HEADING_2),
  p("According to IBM's Cost of a Data Breach Report 2024, the average cost of a data breach is USD 4.88 million. Wireless-entry breaches are among the hardest to detect without purpose-built tooling — traditional perimeter firewalls provide no visibility into over-the-air attacks."),
  p("SALAMANDA provides this visibility at a fraction of the cost of enterprise WIDS solutions (which typically exceed USD 20,000/year per deployment), making professional-grade detection accessible to smaller organisations."),

  h("10.3 Compliance Relevance", HeadingLevel.HEADING_2),
  twoColTable([
    ["PCI DSS 3.2.1", "Requirement 11.1 requires organisations to test for the presence of wireless access points at least quarterly. SALAMANDA provides continuous automated detection."],
    ["ISO 27001", "Control A.13.1 (Network Security Management) and A.12.4 (Logging and Monitoring) are directly addressed by SALAMANDA's alert logging and forensic export."],
    ["HIPAA", "The Security Rule requires covered entities to implement technical safeguards to audit access to ePHI. SALAMANDA's device registry and forensic logs support this audit trail."],
    ["NIST 800-53", "Controls SI-3 (Malicious Code Protection) and SI-4 (Information System Monitoring) align with SALAMANDA's detection and alerting capabilities."],
  ], "Standard", "Relevance"),
  new Paragraph({ children: [new PageBreak()] }),
];


// ── Section 11 — Troubleshooting ─────────────────────────────────────────────
const section11 = [
  h("11. Troubleshooting"),
  twoColTable([
    ["NIDS shows Offline in footer", "The server started but the capture engine hasn't fired yet. Check the terminal for 'Simulator started' or 'Live capture active'. If neither appears, the server may still be loading ONNX models (can take 5–10 seconds)."],
    ["Live Traffic tab shows Cloud Mode", "The SSE endpoint /api/stream returned 501. This means the app is running on a serverless host. Run locally with npm run dev or Docker."],
    ["OTP not received", "The OTP is shown directly in the login UI as a large amber box. It is also printed to the server console. No email is sent in dev mode — this is by design."],
    ["'Failed to fetch' on login", "The InsForge backend (used for DB/realtime) is unreachable. Auth uses the local /api/local-auth/* endpoints which are unaffected. The app will fall back to local storage automatically."],
    ["Live capture failed / no packets", "Windows: ensure Npcap is installed and the app runs as Administrator. macOS/Linux: run sudo npm run setup:capture once."],
    ["AI agent returns 503", "GEMINI_API_KEY is not set or is still the placeholder. Get a free key at aistudio.google.com/apikey and update .env.local, then restart."],
    ["Port already in use (3000)", "Another process is using port 3000. Kill it with: netstat -ano | findstr :3000, then taskkill /PID <pid> /F"],
    ["ONNX model load warnings", "Models in /models/ may be missing or corrupt. Run: cd ml && python train_nslkdd.py to regenerate them."],
  ], "Symptom", "Resolution"),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Section 12 — Glossary ─────────────────────────────────────────────────────
const section12 = [
  h("12. Glossary"),
  twoColTable([
    ["802.11", "The IEEE standard governing WiFi wireless networking protocols."],
    ["ARP", "Address Resolution Protocol — maps IP addresses to MAC addresses on a local network."],
    ["BSSID", "Basic Service Set Identifier — the MAC address of a wireless access point."],
    ["BPF", "Berkeley Packet Filter — a low-level filter language used to select which packets libpcap captures."],
    ["Deauth", "Deauthentication — an 802.11 management frame that disconnects a client from an access point."],
    ["ONNX", "Open Neural Network Exchange — a portable format for ML models, enabling inference without the original training framework."],
    ["OTP", "One-Time Password — a time-limited code used for two-factor authentication."],
    ["SSE", "Server-Sent Events — a browser API for receiving push notifications from a server over HTTP."],
    ["SSID", "Service Set Identifier — the human-readable name of a WiFi network."],
    ["Snort Rules", "A signature language for network intrusion detection originally developed by Sourcefire/Cisco."],
    ["Welford Algorithm", "An online algorithm for computing mean and variance incrementally without storing all data points."],
    ["WIDS", "Wireless Intrusion Detection System — a system that monitors wireless network traffic for signs of attacks."],
    ["NSL-KDD", "A widely-used benchmark dataset for evaluating network intrusion detection classifiers."],
    ["scrypt", "A memory-hard key derivation function used for secure password hashing."],
    ["libpcap", "A portable C library for network packet capture, used by Wireshark and many IDS systems."],
    ["Npcap", "The Windows port of libpcap, required for live packet capture on Windows systems."],
  ], "Term", "Definition"),
];

// ── Assemble document ─────────────────────────────────────────────────────────
const doc = new Document({
  creator: "SALAMANDA WIDS",
  title: "SALAMANDA Smart WiFi Intrusion Detection System — Documentation",
  description: "Full technical and user reference manual for SALAMANDA v2.0",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
      },
      heading1: {
        run: { bold: true, size: 40, color: "1E293B", font: "Calibri" },
        paragraph: { spacing: { before: 400, after: 160 } },
      },
      heading2: {
        run: { bold: true, size: 28, color: "F59E0B", font: "Calibri" },
        paragraph: { spacing: { before: 280, after: 100 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left: convertInchesToTwip(1.2),
          right: convertInchesToTwip(1.2),
        },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: "SALAMANDA WIDS — System Documentation v2.0", size: 18, color: "94A3B8" }),
          ],
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" } },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: "© 2025 SALAMANDA Project  |  Internal Documentation", size: 18, color: "94A3B8" }),
          ],
          alignment: AlignmentType.RIGHT,
          border: { top: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" } },
        })],
      }),
    },
    children: [
      ...coverPage,
      ...section1,
      ...section2,
      ...section3,
      ...section4,
      ...section5,
      ...section6,
      ...section7,
      ...section8,
      ...section9,
      ...section10,
      ...section11,
      ...section12,
    ],
  }],
});

// ── Write file ────────────────────────────────────────────────────────────────
const outPath = path.join(process.cwd(), "SALAMANDA_Documentation.docx");
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log(`\n✓ Documentation written to: ${outPath}`);
console.log(`  Size: ${(buffer.length / 1024).toFixed(1)} KB`);
