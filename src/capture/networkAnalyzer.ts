/**
 * SALAMANDA WIDS — Network Analyzer
 * Processes captured packets and runs:
 *   - ARP spoofing detection
 *   - IP/MAC binding table
 *   - DNS monitoring (tunneling, exfiltration, suspicious queries)
 *   - TCP/UDP flow tracking (SYN flood, port scan, connection state)
 *   - Protocol anomaly detection
 *   - HTTP Host header extraction
 *   - TLS SNI extraction
 *   - Per-device application activity tracking
 */

import { EventEmitter } from "events";
import type { CapturedPacket } from "./packetCapture";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ArpEntry {
  ip: string;
  mac: string;
  firstSeen: number;
  lastSeen: number;
  conflictCount: number;
}

// ── Application connection entry ──────────────────────────────────────────────
// Represents a single observed website or application used by a device.
export interface AppConnection {
  srcIp: string;           // device that made the connection
  dstIp: string;           // destination IP
  dstPort: number;         // destination port
  hostname: string;        // HTTP Host or TLS SNI or reverse-resolved hostname
  protocol: string;        // "HTTPS" | "HTTP" | "DNS" | "SSH" | "FTP" | etc.
  appCategory: string;     // guessed app category e.g. "Social Media", "Streaming"
  appName: string;         // guessed app name e.g. "YouTube", "WhatsApp"
  firstSeen: number;
  lastSeen: number;
  byteCount: number;
  requestCount: number;
  detectionMethod: "sni" | "http-host" | "dns" | "port" | "rdns";
}

export interface TcpFlow {
  key: string;           // srcIp:srcPort->dstIp:dstPort
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  protocol: "tcp" | "udp";
  startTime: number;
  lastSeen: number;
  packetCount: number;
  byteCount: number;
  synCount: number;
  rstCount: number;
  finCount: number;
  state: "syn" | "established" | "closed" | "reset";
}

export interface DnsRecord {
  query: string;
  type: string;
  srcIp: string;
  timestamp: number;
  suspicious: boolean;
  reason?: string;
}

export interface NetworkAlert {
  type: "ARP_SPOOFING" | "SYN_FLOOD" | "PORT_SCAN_TCP" | "DNS_TUNNELING" | "DNS_EXFILTRATION"
      | "ICMP_FLOOD" | "TCP_ANOMALY" | "ARP_SCAN" | "PROTOCOL_ANOMALY";
  severity: "high" | "medium" | "low";
  srcIp?: string;
  srcMac?: string;
  dstIp?: string;
  description: string;
  details: Record<string, any>;
  timestamp: number;
  detectionMethod: "signature" | "anomaly";
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SYN_FLOOD_THRESHOLD = 50;       // SYNs per window
const SYN_FLOOD_WINDOW_MS = 5000;
const PORT_SCAN_THRESHOLD = 15;       // unique dst ports per window
const PORT_SCAN_WINDOW_MS = 10000;
const DNS_LABEL_MAX = 63;             // RFC 1035
const DNS_QUERY_ENTROPY_THRESHOLD = 3.8; // bits — high entropy = tunneling
const DNS_SUBDOMAIN_MAX = 4;          // more than this = suspicious
const ARP_SCAN_THRESHOLD = 20;        // ARP requests per window
const ARP_SCAN_WINDOW_MS = 5000;
const FLOW_TIMEOUT_MS = 120_000;      // 2 min idle flow cleanup

// ── Trusted IP prefixes — never generate alerts for these ─────────────────────
// Includes the InsForge/AWS backend, CDNs, and local loopback.
// Add your own trusted server IPs here if needed.
const TRUSTED_IP_PREFIXES = [
  "127.",           // loopback
  "169.254.",       // link-local
  "::1",            // IPv6 loopback
  // InsForge backend (AWS us-east-2) — these are the app's own API calls
  "3.132.",
  "3.151.",
  "18.219.",
  "52.54.",
  "98.84.",
  "32.195.",
  "32.192.",
  "54.80.",
  "96.45.",
];

// Own machine IPs — populated at runtime by the server
const ownIps = new Set<string>();

export function addOwnIp(ip: string) { ownIps.add(ip); }

// Returns true if this IP should be excluded from alert generation.
// Own machine IPs and known backend/CDN prefixes are both filtered.
function isFilteredIp(ip?: string): boolean {
  if (!ip) return false;
  if (ownIps.has(ip)) return true;          // own machine — never alert on self
  return TRUSTED_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

// Port scan: skip if the scanner is a trusted backend IP or own machine
function isTrustedScanner(ip?: string): boolean {
  if (!ip) return false;
  if (ownIps.has(ip)) return true;
  return TRUSTED_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

// ── Entropy calculator ────────────────────────────────────────────────────────
function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  const len = s.length;
  return -Object.values(freq).reduce((sum, f) => {
    const p = f / len;
    return sum + p * Math.log2(p);
  }, 0);
}

// ── Port → protocol/app name map ─────────────────────────────────────────────
const PORT_APP_MAP: Record<number, { protocol: string; appName: string; appCategory: string }> = {
  21:    { protocol: "FTP",     appName: "FTP",           appCategory: "File Transfer" },
  22:    { protocol: "SSH",     appName: "SSH",           appCategory: "Remote Access" },
  23:    { protocol: "Telnet",  appName: "Telnet",        appCategory: "Remote Access" },
  25:    { protocol: "SMTP",    appName: "Email (SMTP)",  appCategory: "Email" },
  53:    { protocol: "DNS",     appName: "DNS",           appCategory: "Network" },
  67:    { protocol: "DHCP",    appName: "DHCP",          appCategory: "Network" },
  80:    { protocol: "HTTP",    appName: "Web Browser",   appCategory: "Web Browsing" },
  110:   { protocol: "POP3",    appName: "Email (POP3)",  appCategory: "Email" },
  143:   { protocol: "IMAP",    appName: "Email (IMAP)",  appCategory: "Email" },
  194:   { protocol: "IRC",     appName: "IRC Chat",      appCategory: "Messaging" },
  443:   { protocol: "HTTPS",   appName: "Web Browser",   appCategory: "Web Browsing" },
  445:   { protocol: "SMB",     appName: "File Sharing",  appCategory: "File Transfer" },
  465:   { protocol: "SMTPS",   appName: "Email (SMTPS)", appCategory: "Email" },
  587:   { protocol: "SMTP",    appName: "Email (SMTP)",  appCategory: "Email" },
  993:   { protocol: "IMAPS",   appName: "Email (IMAPS)", appCategory: "Email" },
  995:   { protocol: "POP3S",   appName: "Email (POP3S)", appCategory: "Email" },
  1194:  { protocol: "OpenVPN", appName: "VPN",           appCategory: "VPN" },
  1433:  { protocol: "MSSQL",   appName: "SQL Server",    appCategory: "Database" },
  1723:  { protocol: "PPTP",    appName: "VPN (PPTP)",    appCategory: "VPN" },
  3306:  { protocol: "MySQL",   appName: "MySQL",         appCategory: "Database" },
  3389:  { protocol: "RDP",     appName: "Remote Desktop",appCategory: "Remote Access" },
  4444:  { protocol: "TCP",     appName: "Meterpreter",   appCategory: "Suspicious" },
  5222:  { protocol: "XMPP",    appName: "Chat (XMPP)",   appCategory: "Messaging" },
  5228:  { protocol: "HTTPS",   appName: "Google Play",   appCategory: "App Store" },
  5349:  { protocol: "STUN",    appName: "WebRTC",        appCategory: "Video Call" },
  5900:  { protocol: "VNC",     appName: "VNC",           appCategory: "Remote Access" },
  6667:  { protocol: "IRC",     appName: "IRC Botnet",    appCategory: "Suspicious" },
  8080:  { protocol: "HTTP",    appName: "Web Proxy",     appCategory: "Web Browsing" },
  8443:  { protocol: "HTTPS",   appName: "Alt HTTPS",     appCategory: "Web Browsing" },
  9001:  { protocol: "TCP",     appName: "Tor",           appCategory: "Anonymizer" },
  27015: { protocol: "UDP",     appName: "Steam/Game",    appCategory: "Gaming" },
  3074:  { protocol: "TCP",     appName: "Xbox Live",     appCategory: "Gaming" },
  3478:  { protocol: "UDP",     appName: "STUN/WebRTC",   appCategory: "Video Call" },
};

// ── Domain → app name classifier ─────────────────────────────────────────────
const DOMAIN_APP_MAP: Array<{ pattern: RegExp; appName: string; appCategory: string }> = [
  // Social Media
  { pattern: /facebook\.com|fbcdn\.net|fb\.com/, appName: "Facebook", appCategory: "Social Media" },
  { pattern: /instagram\.com|cdninstagram\.com/, appName: "Instagram", appCategory: "Social Media" },
  { pattern: /twitter\.com|x\.com|twimg\.com/, appName: "Twitter/X", appCategory: "Social Media" },
  { pattern: /tiktok\.com|tiktokcdn\.com/, appName: "TikTok", appCategory: "Social Media" },
  { pattern: /snapchat\.com|sc-cdn\.net/, appName: "Snapchat", appCategory: "Social Media" },
  { pattern: /linkedin\.com|licdn\.com/, appName: "LinkedIn", appCategory: "Social Media" },
  { pattern: /pinterest\.com/, appName: "Pinterest", appCategory: "Social Media" },
  { pattern: /reddit\.com|redd\.it/, appName: "Reddit", appCategory: "Social Media" },
  // Messaging
  { pattern: /whatsapp\.com|whatsapp\.net/, appName: "WhatsApp", appCategory: "Messaging" },
  { pattern: /telegram\.org|t\.me/, appName: "Telegram", appCategory: "Messaging" },
  { pattern: /signal\.org/, appName: "Signal", appCategory: "Messaging" },
  { pattern: /discord\.com|discordapp\.com|discord\.gg/, appName: "Discord", appCategory: "Messaging" },
  { pattern: /slack\.com|slack-edge\.com/, appName: "Slack", appCategory: "Messaging" },
  { pattern: /teams\.microsoft\.com|skype\.com/, appName: "Teams/Skype", appCategory: "Messaging" },
  // Streaming
  { pattern: /netflix\.com|nflxvideo\.net|nflxext\.com/, appName: "Netflix", appCategory: "Streaming" },
  { pattern: /youtube\.com|youtu\.be|googlevideo\.com|ytimg\.com/, appName: "YouTube", appCategory: "Streaming" },
  { pattern: /spotify\.com|scdn\.co/, appName: "Spotify", appCategory: "Streaming" },
  { pattern: /twitch\.tv|jtvnw\.net/, appName: "Twitch", appCategory: "Streaming" },
  { pattern: /disneyplus\.com|bamgrid\.com/, appName: "Disney+", appCategory: "Streaming" },
  { pattern: /primevideo\.com|aiv-cdn\.net/, appName: "Prime Video", appCategory: "Streaming" },
  { pattern: /hbo\.com|hbomax\.com|max\.com/, appName: "HBO Max", appCategory: "Streaming" },
  { pattern: /soundcloud\.com/, appName: "SoundCloud", appCategory: "Streaming" },
  // Google
  { pattern: /google\.com|googleapis\.com|gstatic\.com|googleusercontent\.com/, appName: "Google", appCategory: "Search/Productivity" },
  { pattern: /gmail\.com|mail\.google\.com/, appName: "Gmail", appCategory: "Email" },
  { pattern: /drive\.google\.com|docs\.google\.com/, appName: "Google Drive", appCategory: "Cloud Storage" },
  { pattern: /meet\.google\.com/, appName: "Google Meet", appCategory: "Video Call" },
  { pattern: /maps\.google\.com|maps\.googleapis\.com/, appName: "Google Maps", appCategory: "Navigation" },
  // Microsoft
  { pattern: /microsoft\.com|live\.com|hotmail\.com|outlook\.com|office\.com|office365\.com/, appName: "Microsoft", appCategory: "Search/Productivity" },
  { pattern: /onedrive\.com|1drv\.ms/, appName: "OneDrive", appCategory: "Cloud Storage" },
  { pattern: /azure\.com|azureedge\.net/, appName: "Azure", appCategory: "Cloud" },
  // Apple
  { pattern: /apple\.com|icloud\.com|mzstatic\.com|aaplimg\.com/, appName: "Apple/iCloud", appCategory: "Cloud Storage" },
  // Amazon
  { pattern: /amazon\.com|amazonaws\.com|cloudfront\.net/, appName: "Amazon/AWS", appCategory: "Shopping/Cloud" },
  // Gaming
  { pattern: /steampowered\.com|steamcontent\.com/, appName: "Steam", appCategory: "Gaming" },
  { pattern: /epicgames\.com/, appName: "Epic Games", appCategory: "Gaming" },
  { pattern: /riotgames\.com|leagueoflegends\.com/, appName: "Riot Games", appCategory: "Gaming" },
  { pattern: /playstation\.com|sonyentertainmentnetwork\.com/, appName: "PlayStation", appCategory: "Gaming" },
  { pattern: /xbox\.com|xboxlive\.com/, appName: "Xbox Live", appCategory: "Gaming" },
  // VPN / Privacy
  { pattern: /nordvpn\.com|expressvpn\.com|protonvpn\.com|surfshark\.com/, appName: "VPN Service", appCategory: "VPN" },
  { pattern: /torproject\.org/, appName: "Tor Browser", appCategory: "Anonymizer" },
  // Finance
  { pattern: /paypal\.com/, appName: "PayPal", appCategory: "Finance" },
  { pattern: /stripe\.com/, appName: "Stripe", appCategory: "Finance" },
  { pattern: /coinbase\.com|binance\.com|kraken\.com/, appName: "Crypto Exchange", appCategory: "Finance" },
  // Cloud storage
  { pattern: /dropbox\.com|dropboxstatic\.com/, appName: "Dropbox", appCategory: "Cloud Storage" },
  { pattern: /box\.com/, appName: "Box", appCategory: "Cloud Storage" },
  // Productivity
  { pattern: /zoom\.us|zoom\.com/, appName: "Zoom", appCategory: "Video Call" },
  { pattern: /notion\.so/, appName: "Notion", appCategory: "Productivity" },
  { pattern: /github\.com|raw\.githubusercontent\.com/, appName: "GitHub", appCategory: "Development" },
  { pattern: /gitlab\.com/, appName: "GitLab", appCategory: "Development" },
  { pattern: /stackoverflow\.com/, appName: "Stack Overflow", appCategory: "Development" },
  { pattern: /npmjs\.com|registry\.npmjs\.org/, appName: "npm", appCategory: "Development" },
  // Adult content
  { pattern: /pornhub\.com|phncdn\.com/, appName: "Pornhub", appCategory: "Adult Content" },
  { pattern: /xvideos\.com|xvideos-cdn\.com/, appName: "XVideos", appCategory: "Adult Content" },
  { pattern: /xnxx\.com/, appName: "XNXX", appCategory: "Adult Content" },
  { pattern: /xhamster\.com|xhcdn\.com/, appName: "xHamster", appCategory: "Adult Content" },
  { pattern: /redtube\.com/, appName: "RedTube", appCategory: "Adult Content" },
  { pattern: /youporn\.com/, appName: "YouPorn", appCategory: "Adult Content" },
  { pattern: /tube8\.com/, appName: "Tube8", appCategory: "Adult Content" },
  { pattern: /spankbang\.com/, appName: "SpankBang", appCategory: "Adult Content" },
  { pattern: /eporner\.com/, appName: "ePorner", appCategory: "Adult Content" },
  { pattern: /onlyfans\.com|onlyfanscdn\.com/, appName: "OnlyFans", appCategory: "Adult Content" },
  { pattern: /brazzers\.com/, appName: "Brazzers", appCategory: "Adult Content" },
  { pattern: /reality(?:kings|joes)\.com/, appName: "Reality Kings", appCategory: "Adult Content" },
  { pattern: /bangbros\.com/, appName: "Bang Bros", appCategory: "Adult Content" },
  { pattern: /naughtyamerica\.com/, appName: "Naughty America", appCategory: "Adult Content" },
  { pattern: /chaturbate\.com/, appName: "Chaturbate", appCategory: "Adult Content" },
  { pattern: /cam4\.com|cam4cdn\.com/, appName: "Cam4", appCategory: "Adult Content" },
  { pattern: /livejasmin\.com/, appName: "LiveJasmin", appCategory: "Adult Content" },
  { pattern: /stripchat\.com/, appName: "Stripchat", appCategory: "Adult Content" },
  { pattern: /myfreecams\.com/, appName: "MyFreeCams", appCategory: "Adult Content" },
  { pattern: /camsoda\.com/, appName: "CamSoda", appCategory: "Adult Content" },
  { pattern: /tnaflix\.com|empflix\.com/, appName: "TNAFlix", appCategory: "Adult Content" },
  { pattern: /motherless\.com/, appName: "Motherless", appCategory: "Adult Content" },
  { pattern: /fapello\.com|fap\..*|thefap\.com/, appName: "Fapello", appCategory: "Adult Content" },
  // News & Media
  { pattern: /bbc\.co\.uk|bbc\.com/, appName: "BBC", appCategory: "News" },
  { pattern: /cnn\.com/, appName: "CNN", appCategory: "News" },
  { pattern: /reuters\.com/, appName: "Reuters", appCategory: "News" },
  { pattern: /aljazeera\.com/, appName: "Al Jazeera", appCategory: "News" },
  { pattern: /theguardian\.com/, appName: "The Guardian", appCategory: "News" },
  { pattern: /nytimes\.com/, appName: "NY Times", appCategory: "News" },
  // Shopping
  { pattern: /ebay\.com|ebayimg\.com/, appName: "eBay", appCategory: "Shopping" },
  { pattern: /aliexpress\.com|alicdn\.com/, appName: "AliExpress", appCategory: "Shopping" },
  { pattern: /shein\.com/, appName: "SHEIN", appCategory: "Shopping" },
  { pattern: /takealot\.com/, appName: "Takealot", appCategory: "Shopping" },
  // Food & Delivery
  { pattern: /ubereats\.com/, appName: "Uber Eats", appCategory: "Food & Delivery" },
  { pattern: /doordash\.com/, appName: "DoorDash", appCategory: "Food & Delivery" },
  { pattern: /mr-d\.co\.za|mrdelivery\.com/, appName: "Mr D Food", appCategory: "Food & Delivery" },
  // Transport
  { pattern: /uber\.com/, appName: "Uber", appCategory: "Transport" },
  { pattern: /bolt\.eu/, appName: "Bolt", appCategory: "Transport" },
  // Hacking / Exploit Tools
  { pattern: /exploit-db\.com/, appName: "Exploit-DB", appCategory: "Hacking Tool" },
  { pattern: /metasploit\.com|rapid7\.com/, appName: "Metasploit", appCategory: "Hacking Tool" },
  { pattern: /hackforums\.net/, appName: "HackForums", appCategory: "Hacking Tool" },
  { pattern: /nulled\.to|nulled\.cx/, appName: "Nulled Forum", appCategory: "Hacking Tool" },
  { pattern: /cracked\.io|cracked\.to/, appName: "Cracked Forum", appCategory: "Hacking Tool" },
  { pattern: /darkc0de\.com|darkcoders\.com/, appName: "DarkC0de", appCategory: "Hacking Tool" },
  { pattern: /kali\.org/, appName: "Kali Linux", appCategory: "Hacking Tool" },
  { pattern: /shodan\.io/, appName: "Shodan Scanner", appCategory: "Hacking Tool" },
  { pattern: /censys\.io/, appName: "Censys Scanner", appCategory: "Hacking Tool" },
  { pattern: /haveibeenpwned\.com/, appName: "HIBP", appCategory: "Hacking Tool" },
  // Weapons / Illegal Firearms
  { pattern: /gunbroker\.com/, appName: "GunBroker", appCategory: "Weapons" },
  { pattern: /armslist\.com/, appName: "Armslist", appCategory: "Weapons" },
  { pattern: /cheaperthandirt\.com/, appName: "Cheaper Than Dirt", appCategory: "Weapons" },
  { pattern: /ghostgunner\.net|ghostguns\.com/, appName: "Ghost Guns", appCategory: "Weapons" },
  { pattern: /solvent-trap\.com|solventtrap\.com/, appName: "Solvent Trap (Silencer)", appCategory: "Weapons" },
  // Dark Web / Anonymizers
  { pattern: /\.onion(?:\.|$)|onion\.(?:link|city|cab|direct|ly|pet|ws)/, appName: "Dark Web (.onion)", appCategory: "Dark Web" },
  { pattern: /darkwebnews\.com|deepdotweb\.com/, appName: "Dark Web News", appCategory: "Dark Web" },
  { pattern: /dread\.onion|dreadfultales\.com/, appName: "Dread Forum", appCategory: "Dark Web" },
  { pattern: /torproject\.org/, appName: "Tor Browser", appCategory: "Dark Web" },
  { pattern: /i2p(?:project)?\.(?:com|net|org)|geti2p\.net/, appName: "I2P Network", appCategory: "Dark Web" },
  { pattern: /freenet(?:project)?\.org/, appName: "Freenet", appCategory: "Dark Web" },
  // Extremism / Hate
  { pattern: /stormfront\.org/, appName: "Stormfront", appCategory: "Extremism" },
  { pattern: /dailystormer\.|stormer\.com/, appName: "Daily Stormer", appCategory: "Extremism" },
  { pattern: /gab\.com|gab\.ai/, appName: "Gab", appCategory: "Extremism" },
  { pattern: /parler\.com/, appName: "Parler", appCategory: "Extremism" },
  { pattern: /4chan\.org|8kun\.top|8chan\.moe/, appName: "4chan/8chan", appCategory: "Extremism" },
  // Drug Markets
  { pattern: /silkroad|darknetmarket|empire-market|versus-market|alphabay/, appName: "Drug Market", appCategory: "Dark Market" },
  { pattern: /weedmaps\.com/, appName: "Weedmaps", appCategory: "Dark Market" },
  // Malware / Phishing Infrastructure
  { pattern: /pastebin\.com/, appName: "Pastebin", appCategory: "Suspicious" },
  { pattern: /paste\.ee|paste\.gg|ghostbin\.com/, appName: "Paste Site", appCategory: "Suspicious" },
  { pattern: /bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd|ow\.ly/, appName: "URL Shortener", appCategory: "Suspicious" },
  { pattern: /ngrok\.io|ngrok\.com/, appName: "ngrok Tunnel", appCategory: "Suspicious" },
  { pattern: /serveo\.net|localhost\.run/, appName: "Reverse Tunnel", appCategory: "Suspicious" },
  { pattern: /temp-mail\.org|guerrillamail\.com|mailinator\.com|throwam\.com/, appName: "Disposable Email", appCategory: "Suspicious" },
  { pattern: /noip\.com|dyndns\.com|hopto\.org|no-ip\.biz/, appName: "Dynamic DNS", appCategory: "Suspicious" },
  // Gambling
  { pattern: /bet365\.com|betway\.com|draftkings\.com|fanduel\.com/, appName: "Sports Betting", appCategory: "Gambling" },
  { pattern: /pokerstars\.com|888poker\.com|partypoker\.com/, appName: "Online Poker", appCategory: "Gambling" },
  { pattern: /casino\.com|888casino\.com|betmgm\.com/, appName: "Online Casino", appCategory: "Gambling" },
];

function classifyConnection(hostname: string, port: number): { protocol: string; appName: string; appCategory: string } {
  // 1. Try domain pattern matching
  const lower = hostname.toLowerCase();
  for (const entry of DOMAIN_APP_MAP) {
    if (entry.pattern.test(lower)) {
      const proto = port === 443 || port === 8443 ? "HTTPS" : port === 80 ? "HTTP" : PORT_APP_MAP[port]?.protocol ?? "TCP";
      return { protocol: proto, appName: entry.appName, appCategory: entry.appCategory };
    }
  }
  // 2. Fall back to port-based classification
  const portInfo = PORT_APP_MAP[port];
  if (portInfo) return portInfo;
  // 3. Generic fallback
  const proto = port === 443 || port === 8443 ? "HTTPS" : port === 80 || port === 8080 ? "HTTP" : "TCP";
  return { protocol: proto, appName: hostname, appCategory: "Other" };
}

// Categories that should generate a security alert when accessed
const THREAT_CATEGORIES = new Set([
  "Dark Web",
  "Hacking Tool",
  "Weapons",
  "Extremism",
  "Dark Market",
]);

// ── Network Analyzer ──────────────────────────────────────────────────────────
export class NetworkAnalyzer extends EventEmitter {
  // ARP table: ip → entry
  private arpTable = new Map<string, ArpEntry>();

  // Flow table: flowKey → flow
  private flowTable = new Map<string, TcpFlow>();

  // SYN flood tracker: srcIp → { count, windowStart }
  private synTracker = new Map<string, { count: number; windowStart: number }>();

  // Port scan tracker: srcIp → { ports: Set, windowStart }
  private portScanTracker = new Map<string, { ports: Set<number>; windowStart: number }>();

  // ARP scan tracker: srcMac → { count, windowStart }
  private arpScanTracker = new Map<string, { count: number; windowStart: number }>();

  // DNS records (last 500)
  private dnsRecords: DnsRecord[] = [];

  // ICMP flood tracker
  private icmpTracker = new Map<string, { count: number; windowStart: number }>();

  // ── Application connection tracking ──────────────────────────────────────
  // Key: "srcIp|hostname|dstPort" → AppConnection
  private appConnections = new Map<string, AppConnection>();
  // IP → hostname cache from DNS (avoids repeated lookups)
  private dnsHostCache = new Map<string, string>();

  // Stats
  public stats = {
    packetsAnalyzed: 0,
    arpEntries: 0,
    activeFlows: 0,
    dnsQueries: 0,
    alertsGenerated: 0,
  };

  processPacket(pkt: CapturedPacket) {
    this.stats.packetsAnalyzed++;

    // ── Activity tracking runs for ALL packets including own machine ──────
    // This is how we see what websites/apps every device on the network uses,
    // including the machine running SALAMANDA itself.
    if (pkt.etherType === 0x0800 && pkt.srcIp && pkt.dstIp) {
      // DNS query — captures domain lookups from any device
      if (pkt.dnsQuery && pkt.srcPort !== 53) {
        // srcIp queried dnsQuery — cache it for connection labelling
        this.dnsHostCache.set(`${pkt.srcIp}|${pkt.dnsQuery.toLowerCase()}`, pkt.dnsQuery.toLowerCase());
        this.upsertAppConnection({
          srcIp: pkt.srcIp, dstIp: pkt.dstIp ?? "unknown", dstPort: 53,
          hostname: pkt.dnsQuery.toLowerCase(), detectionMethod: "dns",
          bytesDelta: pkt.length,
        });
      }
      // TCP payload — HTTP Host / TLS SNI
      if (pkt.protocol === 6 && pkt.payload && pkt.payload.length > 0 && pkt.dstPort) {
        if (pkt.dstPort === 80 || pkt.dstPort === 8080 || pkt.dstPort === 8000) {
          const host = this.extractHttpHost(pkt.payload);
          if (host) this.upsertAppConnection({ srcIp: pkt.srcIp, dstIp: pkt.dstIp, dstPort: pkt.dstPort, hostname: host, detectionMethod: "http-host", bytesDelta: pkt.length });
        }
        if (pkt.dstPort === 443 || pkt.dstPort === 8443 || pkt.dstPort === 9443) {
          const sni = this.extractTlsSni(pkt.payload);
          if (sni) this.upsertAppConnection({ srcIp: pkt.srcIp, dstIp: pkt.dstIp, dstPort: pkt.dstPort, hostname: sni, detectionMethod: "sni", bytesDelta: pkt.length });
        }
        // Known port fallback — any established TCP connection to a recognisable port
        const portInfo = PORT_APP_MAP[pkt.dstPort];
        if (portInfo && pkt.dstPort !== 80 && pkt.dstPort !== 443) {
          // Use a recent DNS entry for this dstIp if we have one
          const knownHost = [...this.dnsHostCache.entries()]
            .find(([k]) => k.startsWith(`${pkt.srcIp}|`))
            ?.[1] ?? pkt.dstIp;
          this.upsertAppConnection({ srcIp: pkt.srcIp, dstIp: pkt.dstIp, dstPort: pkt.dstPort, hostname: knownHost, detectionMethod: "port", bytesDelta: pkt.length });
        }
      }
    }

    // Skip security alert analysis for filtered IPs (own machine, backend CDNs)
    if (isFilteredIp(pkt.srcIp) || isFilteredIp(pkt.dstIp)) {
      // Still track flows for visibility but don't alert
      if (pkt.etherType === 0x0800 && pkt.protocol === 6) this.trackFlowOnly(pkt);
      return;
    }

    // Periodic flow cleanup
    if (this.stats.packetsAnalyzed % 1000 === 0) this.cleanupFlows();

    // Route to appropriate analyzer
    if (pkt.etherType === 0x0806) this.analyzeArp(pkt);
    if (pkt.etherType === 0x0800) {
      if (pkt.protocol === 6) this.analyzeTcp(pkt);
      if (pkt.protocol === 17) this.analyzeUdp(pkt);
      if (pkt.protocol === 1) this.analyzeIcmp(pkt);
    }
    if (pkt.dnsQuery) this.analyzeDns(pkt);
  }

  // ── ARP Analysis ─────────────────────────────────────────────────────────
  private analyzeArp(pkt: CapturedPacket) {
    const { arpSenderIp, arpSenderMac, arpOp, srcMac } = pkt;
    if (!arpSenderIp || !arpSenderMac) return;

    // ARP scan detection
    if (arpOp === 1) { // request
      const now = Date.now();
      const tracker = this.arpScanTracker.get(srcMac);
      if (!tracker || now - tracker.windowStart > ARP_SCAN_WINDOW_MS) {
        this.arpScanTracker.set(srcMac, { count: 1, windowStart: now });
      } else {
        tracker.count++;
        if (tracker.count === ARP_SCAN_THRESHOLD) {
          this.fireAlert({
            type: "ARP_SCAN",
            severity: "medium",
            srcMac,
            description: `ARP scan detected: ${srcMac} sent ${tracker.count} ARP requests in ${ARP_SCAN_WINDOW_MS / 1000}s — possible network reconnaissance.`,
            details: { srcMac, count: tracker.count, windowMs: ARP_SCAN_WINDOW_MS },
            detectionMethod: "signature",
          });
        }
      }
    }

    // ARP spoofing: IP already bound to a different MAC
    const existing = this.arpTable.get(arpSenderIp);
    if (existing && existing.mac !== arpSenderMac) {
      existing.conflictCount++;
      this.fireAlert({
        type: "ARP_SPOOFING",
        severity: "high",
        srcMac: arpSenderMac,
        srcIp: arpSenderIp,
        description: `ARP Spoofing detected: IP ${arpSenderIp} was bound to ${existing.mac}, now claimed by ${arpSenderMac}. Possible MITM attack.`,
        details: {
          ip: arpSenderIp,
          originalMac: existing.mac,
          spoofedMac: arpSenderMac,
          conflictCount: existing.conflictCount,
          arpOp: arpOp === 1 ? "request" : "reply",
        },
        detectionMethod: "signature",
      });
      existing.mac = arpSenderMac;
      existing.lastSeen = Date.now();
    } else if (!existing) {
      this.arpTable.set(arpSenderIp, {
        ip: arpSenderIp,
        mac: arpSenderMac,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        conflictCount: 0,
      });
      this.stats.arpEntries = this.arpTable.size;
    } else {
      existing.lastSeen = Date.now();
    }
  }

  // ── TCP Analysis ──────────────────────────────────────────────────────────
  private analyzeTcp(pkt: CapturedPacket) {
    if (!pkt.srcIp || !pkt.dstIp || !pkt.srcPort || !pkt.dstPort) return;
    const flags = pkt.tcpFlags ?? 0;
    const isSyn = (flags & 0x02) !== 0 && (flags & 0x10) === 0; // SYN without ACK
    const isRst = (flags & 0x04) !== 0;
    const isFin = (flags & 0x01) !== 0;

    // Flow tracking
    const key = `${pkt.srcIp}:${pkt.srcPort}->${pkt.dstIp}:${pkt.dstPort}`;
    let flow = this.flowTable.get(key);
    if (!flow) {
      flow = {
        key, srcIp: pkt.srcIp, dstIp: pkt.dstIp,
        srcPort: pkt.srcPort, dstPort: pkt.dstPort,
        protocol: "tcp", startTime: Date.now(), lastSeen: Date.now(),
        packetCount: 0, byteCount: 0, synCount: 0, rstCount: 0, finCount: 0,
        state: "syn",
      };
      this.flowTable.set(key, flow);
      this.stats.activeFlows = this.flowTable.size;
    }
    flow.packetCount++;
    flow.byteCount += pkt.length;
    flow.lastSeen = Date.now();
    if (isSyn) flow.synCount++;
    if (isRst) { flow.rstCount++; flow.state = "reset"; }
    if (isFin) { flow.finCount++; flow.state = "closed"; }
    if (!isSyn && !isRst && !isFin) flow.state = "established";

    // SYN flood detection
    if (isSyn) {
      const now = Date.now();
      const tracker = this.synTracker.get(pkt.srcIp);
      if (!tracker || now - tracker.windowStart > SYN_FLOOD_WINDOW_MS) {
        this.synTracker.set(pkt.srcIp, { count: 1, windowStart: now });
      } else {
        tracker.count++;
        if (tracker.count === SYN_FLOOD_THRESHOLD) {
          this.fireAlert({
            type: "SYN_FLOOD",
            severity: "high",
            srcIp: pkt.srcIp,
            dstIp: pkt.dstIp,
            description: `SYN Flood detected: ${pkt.srcIp} sent ${tracker.count} SYN packets in ${SYN_FLOOD_WINDOW_MS / 1000}s targeting ${pkt.dstIp}. DoS attack in progress.`,
            details: { srcIp: pkt.srcIp, dstIp: pkt.dstIp, synCount: tracker.count, windowMs: SYN_FLOOD_WINDOW_MS },
            detectionMethod: "signature",
          });
        }
      }
    }

    // TCP port scan: many unique dst ports from same src
    const now = Date.now();
    const psTracker = this.portScanTracker.get(pkt.srcIp);
    if (!isTrustedScanner(pkt.srcIp)) {
      if (!psTracker || now - psTracker.windowStart > PORT_SCAN_WINDOW_MS) {
        this.portScanTracker.set(pkt.srcIp, { ports: new Set([pkt.dstPort]), windowStart: now });
      } else {
        psTracker.ports.add(pkt.dstPort);
        if (psTracker.ports.size === PORT_SCAN_THRESHOLD) {
          this.fireAlert({
            type: "PORT_SCAN_TCP",
            severity: "medium",
            srcIp: pkt.srcIp,
            dstIp: pkt.dstIp,
            description: `TCP Port Scan: ${pkt.srcIp} probed ${psTracker.ports.size} unique ports on ${pkt.dstIp} in ${PORT_SCAN_WINDOW_MS / 1000}s.`,
            details: { srcIp: pkt.srcIp, dstIp: pkt.dstIp, portCount: psTracker.ports.size, samplePorts: [...psTracker.ports].slice(0, 10) },
            detectionMethod: "signature",
          });
        }
      }
    }

    // Protocol anomaly: RST storm
    if (isRst && flow.rstCount > 10) {
      this.fireAlert({
        type: "TCP_ANOMALY",
        severity: "low",
        srcIp: pkt.srcIp,
        description: `TCP RST storm from ${pkt.srcIp}: ${flow.rstCount} RST packets on flow ${key}.`,
        details: { flow: key, rstCount: flow.rstCount },
        detectionMethod: "anomaly",
      });
    }
  }

  // ── UDP Analysis ──────────────────────────────────────────────────────────
  private analyzeUdp(pkt: CapturedPacket) {
    if (!pkt.srcIp || !pkt.dstIp || !pkt.srcPort || !pkt.dstPort) return;
    const key = `${pkt.srcIp}:${pkt.srcPort}->${pkt.dstIp}:${pkt.dstPort}`;
    let flow = this.flowTable.get(key);
    if (!flow) {
      flow = {
        key, srcIp: pkt.srcIp, dstIp: pkt.dstIp,
        srcPort: pkt.srcPort, dstPort: pkt.dstPort,
        protocol: "udp", startTime: Date.now(), lastSeen: Date.now(),
        packetCount: 0, byteCount: 0, synCount: 0, rstCount: 0, finCount: 0,
        state: "established",
      };
      this.flowTable.set(key, flow);
    }
    flow.packetCount++;
    flow.byteCount += pkt.length;
    flow.lastSeen = Date.now();
  }

  // ── ICMP Analysis ─────────────────────────────────────────────────────────
  private analyzeIcmp(pkt: CapturedPacket) {
    if (!pkt.srcIp) return;
    const now = Date.now();
    const tracker = this.icmpTracker.get(pkt.srcIp);
    if (!tracker || now - tracker.windowStart > 5000) {
      this.icmpTracker.set(pkt.srcIp, { count: 1, windowStart: now });
    } else {
      tracker.count++;
      if (tracker.count === 100) {
        this.fireAlert({
          type: "ICMP_FLOOD",
          severity: "medium",
          srcIp: pkt.srcIp,
          description: `ICMP Flood: ${pkt.srcIp} sent ${tracker.count} ICMP packets in 5s. Possible ping flood or Smurf attack.`,
          details: { srcIp: pkt.srcIp, count: tracker.count },
          detectionMethod: "signature",
        });
      }
    }
  }

  // ── DNS Analysis ──────────────────────────────────────────────────────────
  private analyzeDns(pkt: CapturedPacket) {
    if (!pkt.dnsQuery || pkt.dnsQuery.length < 3) return;
    // Skip security alert analysis for own machine — but activity tracking
    // already happened above in processPacket before this point.
    if (isFilteredIp(pkt.srcIp)) return;
    this.stats.dnsQueries++;

    const query = pkt.dnsQuery.toLowerCase();
    const labels = query.split(".");
    const subdomain = labels.slice(0, -2).join(".");
    let suspicious = false;
    let reason = "";

    // DNS tunneling: high entropy subdomain
    if (subdomain.length > 10) {
      const entropy = shannonEntropy(subdomain);
      if (entropy > DNS_QUERY_ENTROPY_THRESHOLD) {
        suspicious = true;
        reason = `High entropy subdomain (${entropy.toFixed(2)} bits) — possible DNS tunneling`;
        this.fireAlert({
          type: "DNS_TUNNELING",
          severity: "high",
          srcIp: pkt.srcIp,
          description: `DNS Tunneling suspected: ${pkt.srcIp} queried "${query}" with entropy ${entropy.toFixed(2)} bits. Data may be exfiltrated via DNS.`,
          details: { query, entropy: entropy.toFixed(2), srcIp: pkt.srcIp, threshold: DNS_QUERY_ENTROPY_THRESHOLD },
          detectionMethod: "anomaly",
        });
      }
    }

    // DNS exfiltration: excessive subdomain depth
    if (labels.length > DNS_SUBDOMAIN_MAX + 2) {
      suspicious = true;
      reason = `Excessive subdomain depth (${labels.length} labels)`;
      this.fireAlert({
        type: "DNS_EXFILTRATION",
        severity: "medium",
        srcIp: pkt.srcIp,
        description: `DNS Exfiltration suspected: ${pkt.srcIp} queried "${query}" with ${labels.length} subdomain labels — possible data exfiltration.`,
        details: { query, labelCount: labels.length, srcIp: pkt.srcIp },
        detectionMethod: "anomaly",
      });
    }

    // Very long label (> RFC max)
    const maxLabel = Math.max(...labels.map((l) => l.length));
    if (maxLabel > DNS_LABEL_MAX) {
      suspicious = true;
      reason = `Label exceeds RFC 1035 max (${maxLabel} chars)`;
    }

    const record: DnsRecord = {
      query,
      type: pkt.dnsType ?? "A",
      srcIp: pkt.srcIp ?? "unknown",
      timestamp: Date.now(),
      suspicious,
      reason: reason || undefined,
    };
    this.dnsRecords.unshift(record);
    if (this.dnsRecords.length > 500) this.dnsRecords.pop();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private fireAlert(data: Omit<NetworkAlert, "timestamp">) {
    this.stats.alertsGenerated++;
    const alert: NetworkAlert = { ...data, timestamp: Date.now() };
    this.emit("alert", alert);
  }

  // Track flow without alerting — used for trusted IPs
  private trackFlowOnly(pkt: CapturedPacket) {
    if (!pkt.srcIp || !pkt.dstIp || !pkt.srcPort || !pkt.dstPort) return;
    const key = `${pkt.srcIp}:${pkt.srcPort}->${pkt.dstIp}:${pkt.dstPort}`;
    let flow = this.flowTable.get(key);
    if (!flow) {
      flow = {
        key, srcIp: pkt.srcIp, dstIp: pkt.dstIp,
        srcPort: pkt.srcPort, dstPort: pkt.dstPort,
        protocol: "tcp", startTime: Date.now(), lastSeen: Date.now(),
        packetCount: 0, byteCount: 0, synCount: 0, rstCount: 0, finCount: 0,
        state: "established",
      };
      this.flowTable.set(key, flow);
    }
    flow.packetCount++;
    flow.byteCount += pkt.length;
    flow.lastSeen = Date.now();
  }

  private cleanupFlows() {
    const cutoff = Date.now() - FLOW_TIMEOUT_MS;
    for (const [key, flow] of this.flowTable) {
      if (flow.lastSeen < cutoff) this.flowTable.delete(key);
    }
    this.stats.activeFlows = this.flowTable.size;
  }

  // ── HTTP Host header extraction ───────────────────────────────────────────
  private extractHttpHost(payload: Buffer): string | null {
    try {
      const text = payload.toString("binary", 0, Math.min(512, payload.length));
      // Match "Host: example.com" line in HTTP request
      const m = text.match(/[Hh]ost:\s*([^\r\n:]{3,253})/);
      if (!m) return null;
      const host = m[1].trim().toLowerCase().split(":")[0]; // strip port if present
      // Sanity check — must look like a real hostname
      if (/^[a-z0-9._-]{3,}$/.test(host) && host.includes(".")) return host;
    } catch { /* malformed */ }
    return null;
  }

  // ── TLS SNI extraction ────────────────────────────────────────────────────
  // Parses TLS 1.x ClientHello and extracts the SNI server_name extension.
  private extractTlsSni(payload: Buffer): string | null {
    try {
      if (payload.length < 5) return null;
      // TLS record: content_type=0x16 (handshake), version=0x0301/0x0303
      if (payload[0] !== 0x16) return null;
      if (payload[1] !== 0x03) return null;
      // Handshake message type = 0x01 (ClientHello)
      if (payload.length < 6 || payload[5] !== 0x01) return null;

      // Skip: record header(5) + handshake header(4) + version(2) + random(32) = 43
      let pos = 43;
      if (pos >= payload.length) return null;

      // Session ID length
      const sessionIdLen = payload[pos++];
      pos += sessionIdLen;
      if (pos + 2 >= payload.length) return null;

      // Cipher suites length
      const cipherLen = payload.readUInt16BE(pos); pos += 2;
      pos += cipherLen;
      if (pos + 1 >= payload.length) return null;

      // Compression methods length
      const compLen = payload[pos++];
      pos += compLen;
      if (pos + 2 >= payload.length) return null;

      // Extensions length
      const extLen = payload.readUInt16BE(pos); pos += 2;
      const extEnd = pos + extLen;

      // Walk extensions looking for type 0x0000 (SNI)
      while (pos + 4 <= extEnd && pos + 4 <= payload.length) {
        const extType = payload.readUInt16BE(pos); pos += 2;
        const extDataLen = payload.readUInt16BE(pos); pos += 2;
        if (extType === 0x0000) {
          // SNI extension: list_len(2) + name_type(1) + name_len(2) + name
          if (pos + 5 <= payload.length) {
            pos += 2; // skip list length
            pos += 1; // skip name type (0 = host_name)
            const nameLen = payload.readUInt16BE(pos); pos += 2;
            if (pos + nameLen <= payload.length) {
              return payload.toString("ascii", pos, pos + nameLen).toLowerCase();
            }
          }
        }
        pos += extDataLen;
      }
    } catch { /* malformed TLS */ }
    return null;
  }

  // ── Upsert an app connection record ──────────────────────────────────────
  private upsertAppConnection(opts: {
    srcIp: string; dstIp: string; dstPort: number;
    hostname: string; detectionMethod: AppConnection["detectionMethod"];
    bytesDelta: number;
  }) {
    if (!opts.hostname || opts.hostname === "unknown") return;
    const key = `${opts.srcIp}|${opts.hostname}|${opts.dstPort}`;
    const existing = this.appConnections.get(key);
    const now = Date.now();
    if (existing) {
      existing.lastSeen = now;
      existing.byteCount += opts.bytesDelta;
      existing.requestCount++;
      // Upgrade detection method: sni > http-host > dns > port > rdns
      const rank = { sni: 5, "http-host": 4, dns: 3, port: 2, rdns: 1 };
      if ((rank[opts.detectionMethod] ?? 0) > (rank[existing.detectionMethod] ?? 0)) {
        existing.detectionMethod = opts.detectionMethod;
      }
    } else {
      const { protocol, appName, appCategory } = classifyConnection(opts.hostname, opts.dstPort);
      this.appConnections.set(key, {
        srcIp: opts.srcIp,
        dstIp: opts.dstIp,
        dstPort: opts.dstPort,
        hostname: opts.hostname,
        protocol,
        appName,
        appCategory,
        firstSeen: now,
        lastSeen: now,
        byteCount: opts.bytesDelta,
        requestCount: 1,
        detectionMethod: opts.detectionMethod,
      });

      // ── Fire a threat alert for dangerous categories ──────────────────
      if (THREAT_CATEGORIES.has(appCategory)) {
        const severityMap: Record<string, NetworkAlert["severity"]> = {
          "Dark Web": "high",
          "Hacking Tool": "high",
          "Weapons": "high",
          "Extremism": "high",
          "Dark Market": "high",
        };
        this.fireAlert({
          type: "PROTOCOL_ANOMALY",
          severity: severityMap[appCategory] ?? "medium",
          srcIp: opts.srcIp,
          dstIp: opts.dstIp,
          description: `[${appCategory}] ${opts.srcIp} accessed "${appName}" (${opts.hostname}) — ${appCategory} site detected`,
          details: {
            hostname: opts.hostname,
            appName,
            appCategory,
            dstPort: opts.dstPort,
            detectionMethod: opts.detectionMethod,
            category: appCategory,
          },
          detectionMethod: "signature",
        });
      }

      // Evict oldest if over limit
      if (this.appConnections.size > 2000) {
        const oldest = [...this.appConnections.entries()]
          .sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
        if (oldest) this.appConnections.delete(oldest[0]);
      }
    }
  }

  // ── Public accessors ──────────────────────────────────────────────────────
  getArpTable(): ArpEntry[] { return [...this.arpTable.values()]; }
  getFlows(): TcpFlow[] { return [...this.flowTable.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 100); }
  getDnsRecords(): DnsRecord[] { return this.dnsRecords.slice(0, 100); }
  getStats() { return { ...this.stats }; }

  // Return app connections grouped by srcIp, sorted by lastSeen desc
  getAppConnections(): AppConnection[] {
    return [...this.appConnections.values()]
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 500);
  }

  // Return per-device activity summary
  getDeviceActivity(): Record<string, AppConnection[]> {
    const result: Record<string, AppConnection[]> = {};
    for (const conn of this.appConnections.values()) {
      if (!result[conn.srcIp]) result[conn.srcIp] = [];
      result[conn.srcIp].push(conn);
    }
    // Sort each device's connections by lastSeen desc
    for (const ip of Object.keys(result)) {
      result[ip].sort((a, b) => b.lastSeen - a.lastSeen);
    }
    return result;
  }
}
