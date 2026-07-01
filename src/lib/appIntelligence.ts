/**
 * SALAMANDA WIDS — App Intelligence
 * Maps apex domains to known applications and categories.
 * Used to enrich the DNS/Sites view with app identification.
 */

export type AppCategory =
  | "social"      // Social media platforms
  | "video"       // Video streaming
  | "vpn"         // VPN / proxy services
  | "gaming"      // Games and gaming platforms
  | "messaging"   // Chat and messaging
  | "adtech"      // Advertising / tracking
  | "cdn"         // Content delivery networks
  | "cloud"       // Cloud storage / productivity
  | "streaming"   // Music / audio streaming
  | "shopping"    // E-commerce
  | "news"        // News platforms
  | "finance"     // Banking / crypto
  | "security"    // Security / antivirus tools
  | "system"      // OS updates / telemetry
  | "search"      // Search engines
  | "adult"       // Adult content
  | "other";      // Known but uncategorized

export interface AppRecord {
  name: string;
  category: AppCategory;
  icon: string;       // emoji icon
  risk: "low" | "medium" | "high";  // risk level for investigation
  note?: string;      // investigator note
}

// ── Domain → App mapping ──────────────────────────────────────────────────────
// Keys are apex domains (matched with apexDomain() in NetworkTab)
const APP_MAP: Record<string, AppRecord> = {

  // ── Social Media ────────────────────────────────────────────────────────────
  "tiktok.com":        { name: "TikTok",      category: "social",    icon: "🎵", risk: "medium", note: "Chinese-owned, potential data exfil" },
  "tiktokv.com":       { name: "TikTok",      category: "social",    icon: "🎵", risk: "medium" },
  "musical.ly":        { name: "TikTok",      category: "social",    icon: "🎵", risk: "medium" },
  "facebook.com":      { name: "Facebook",    category: "social",    icon: "📘", risk: "low" },
  "fbcdn.net":         { name: "Facebook CDN",category: "cdn",       icon: "📘", risk: "low" },
  "instagram.com":     { name: "Instagram",   category: "social",    icon: "📷", risk: "low" },
  "cdninstagram.com":  { name: "Instagram CDN",category:"cdn",       icon: "📷", risk: "low" },
  "twitter.com":       { name: "Twitter/X",   category: "social",    icon: "🐦", risk: "low" },
  "twimg.com":         { name: "Twitter/X CDN",category: "cdn",      icon: "🐦", risk: "low" },
  "x.com":             { name: "Twitter/X",   category: "social",    icon: "🐦", risk: "low" },
  "snapchat.com":      { name: "Snapchat",    category: "social",    icon: "👻", risk: "low" },
  "sc-cdn.net":        { name: "Snapchat CDN",category: "cdn",       icon: "👻", risk: "low" },
  "linkedin.com":      { name: "LinkedIn",    category: "social",    icon: "💼", risk: "low" },
  "licdn.com":         { name: "LinkedIn CDN",category: "cdn",       icon: "💼", risk: "low" },
  "pinterest.com":     { name: "Pinterest",   category: "social",    icon: "📌", risk: "low" },
  "reddit.com":        { name: "Reddit",      category: "social",    icon: "🤖", risk: "low" },
  "redd.it":           { name: "Reddit",      category: "social",    icon: "🤖", risk: "low" },
  "tumblr.com":        { name: "Tumblr",      category: "social",    icon: "📝", risk: "low" },
  "telegram.org":      { name: "Telegram",    category: "messaging", icon: "✈️", risk: "medium", note: "Encrypted messaging, used by threat actors" },
  "t.me":              { name: "Telegram",    category: "messaging", icon: "✈️", risk: "medium" },
  "whatsapp.com":      { name: "WhatsApp",    category: "messaging", icon: "💬", risk: "low" },
  "whatsapp.net":      { name: "WhatsApp",    category: "messaging", icon: "💬", risk: "low" },
  "signal.org":        { name: "Signal",      category: "messaging", icon: "🔒", risk: "medium", note: "End-to-end encrypted" },
  "discord.com":       { name: "Discord",     category: "messaging", icon: "🎮", risk: "medium", note: "Used for C2 communications" },
  "discordapp.com":    { name: "Discord",     category: "messaging", icon: "🎮", risk: "medium" },
  "discordcdn.com":    { name: "Discord CDN", category: "cdn",       icon: "🎮", risk: "low" },
  "viber.com":         { name: "Viber",       category: "messaging", icon: "📱", risk: "low" },
  "line.me":           { name: "LINE",        category: "messaging", icon: "💚", risk: "low" },
  "wechat.com":        { name: "WeChat",      category: "messaging", icon: "💚", risk: "high", note: "Chinese app, state surveillance risk" },
  "wx.qq.com":         { name: "WeChat",      category: "messaging", icon: "💚", risk: "high" },

  // ── Video Streaming ─────────────────────────────────────────────────────────
  "youtube.com":       { name: "YouTube",     category: "video",     icon: "▶️",  risk: "low" },
  "googlevideo.com":   { name: "YouTube",     category: "video",     icon: "▶️",  risk: "low" },
  "youtu.be":          { name: "YouTube",     category: "video",     icon: "▶️",  risk: "low" },
  "yt3.ggpht.com":     { name: "YouTube",     category: "cdn",       icon: "▶️",  risk: "low" },
  "netflix.com":       { name: "Netflix",     category: "video",     icon: "🍿", risk: "low" },
  "nflxvideo.net":     { name: "Netflix CDN", category: "cdn",       icon: "🍿", risk: "low" },
  "nflximg.net":       { name: "Netflix CDN", category: "cdn",       icon: "🍿", risk: "low" },
  "hbo.com":           { name: "HBO Max",     category: "video",     icon: "📺", risk: "low" },
  "hbomax.com":        { name: "HBO Max",     category: "video",     icon: "📺", risk: "low" },
  "disneyplus.com":    { name: "Disney+",     category: "video",     icon: "🏰", risk: "low" },
  "akamaihd.net":      { name: "Akamai CDN",  category: "cdn",       icon: "🌐", risk: "low" },
  "twitch.tv":         { name: "Twitch",      category: "video",     icon: "🎮", risk: "low" },
  "twitchsvc.net":     { name: "Twitch",      category: "video",     icon: "🎮", risk: "low" },
  "primevideo.com":    { name: "Prime Video", category: "video",     icon: "📦", risk: "low" },
  "vimeo.com":         { name: "Vimeo",       category: "video",     icon: "🎬", risk: "low" },
  "dailymotion.com":   { name: "Dailymotion", category: "video",     icon: "🎥", risk: "low" },

  // ── Music Streaming ─────────────────────────────────────────────────────────
  "spotify.com":       { name: "Spotify",     category: "streaming", icon: "🎧", risk: "low" },
  "scdn.co":           { name: "Spotify CDN", category: "cdn",       icon: "🎧", risk: "low" },
  "spotifycdn.com":    { name: "Spotify CDN", category: "cdn",       icon: "🎧", risk: "low" },
  "soundcloud.com":    { name: "SoundCloud",  category: "streaming", icon: "🎵", risk: "low" },
  "apple.com":         { name: "Apple",       category: "system",    icon: "🍎", risk: "low" },
  "mzstatic.com":      { name: "Apple CDN",   category: "cdn",       icon: "🍎", risk: "low" },
  "deezer.com":        { name: "Deezer",      category: "streaming", icon: "🎶", risk: "low" },
  "tidal.com":         { name: "Tidal",       category: "streaming", icon: "🎵", risk: "low" },

  // ── VPNs & Proxies ──────────────────────────────────────────────────────────
  "nordvpn.com":       { name: "NordVPN",     category: "vpn",       icon: "🛡️", risk: "high", note: "VPN — traffic obfuscation" },
  "nordvpn.net":       { name: "NordVPN",     category: "vpn",       icon: "🛡️", risk: "high" },
  "expressvpn.com":    { name: "ExpressVPN",  category: "vpn",       icon: "🛡️", risk: "high", note: "VPN — traffic obfuscation" },
  "expressvpn.net":    { name: "ExpressVPN",  category: "vpn",       icon: "🛡️", risk: "high" },
  "surfshark.com":     { name: "Surfshark",   category: "vpn",       icon: "🦈", risk: "high", note: "VPN — traffic obfuscation" },
  "privateinternetaccess.com": { name: "PIA VPN", category: "vpn",   icon: "🛡️", risk: "high" },
  "cyberghostvpn.com": { name: "CyberGhost",  category: "vpn",       icon: "👻", risk: "high" },
  "ipvanish.com":      { name: "IPVanish",    category: "vpn",       icon: "🛡️", risk: "high" },
  "protonvpn.com":     { name: "ProtonVPN",   category: "vpn",       icon: "🔐", risk: "high" },
  "windscribe.com":    { name: "Windscribe",  category: "vpn",       icon: "💨", risk: "high" },
  "tunnelbear.com":    { name: "TunnelBear",  category: "vpn",       icon: "🐻", risk: "high" },
  "hotspotshield.com": { name: "Hotspot Shield", category: "vpn",    icon: "🛡️", risk: "high" },
  "ultrasurf.us":      { name: "Ultrasurf",   category: "vpn",       icon: "🔒", risk: "high" },
  "psiphon3.com":      { name: "Psiphon",     category: "vpn",       icon: "🔓", risk: "high" },
  "tor2web.org":       { name: "Tor2Web",     category: "vpn",       icon: "🧅", risk: "high", note: "Tor access — anonymity tool" },
  "torproject.org":    { name: "Tor Project", category: "vpn",       icon: "🧅", risk: "high" },
  "mullvad.net":       { name: "Mullvad VPN", category: "vpn",       icon: "🛡️", risk: "high" },
  "hideme.ru":         { name: "Hide.me VPN", category: "vpn",       icon: "🛡️", risk: "high" },
  "zenmate.com":       { name: "ZenMate VPN", category: "vpn",       icon: "🛡️", risk: "high" },
  "1.1.1.1":           { name: "Cloudflare DNS", category: "security", icon: "🔧", risk: "low" },
  "cloudflare.com":    { name: "Cloudflare",  category: "cdn",       icon: "☁️", risk: "low" },

  // ── Gaming ──────────────────────────────────────────────────────────────────
  "steampowered.com":  { name: "Steam",       category: "gaming",    icon: "🎮", risk: "low" },
  "steamstatic.com":   { name: "Steam CDN",   category: "cdn",       icon: "🎮", risk: "low" },
  "epicgames.com":     { name: "Epic Games",  category: "gaming",    icon: "🎮", risk: "low" },
  "riotgames.com":     { name: "Riot Games",  category: "gaming",    icon: "⚔️",  risk: "low" },
  "ea.com":            { name: "EA Games",    category: "gaming",    icon: "🎯", risk: "low" },
  "xbox.com":          { name: "Xbox",        category: "gaming",    icon: "🎮", risk: "low" },
  "playstation.com":   { name: "PlayStation", category: "gaming",    icon: "🕹️", risk: "low" },
  "blizzard.com":      { name: "Blizzard",    category: "gaming",    icon: "🎮", risk: "low" },
  "minecraft.net":     { name: "Minecraft",   category: "gaming",    icon: "⛏️",  risk: "low" },
  "roblox.com":        { name: "Roblox",      category: "gaming",    icon: "🧱", risk: "low" },
  "pubg.com":          { name: "PUBG",        category: "gaming",    icon: "🔫", risk: "low" },

  // ── Search Engines ──────────────────────────────────────────────────────────
  "google.com":        { name: "Google",      category: "search",    icon: "🔍", risk: "low" },
  "googleapis.com":    { name: "Google APIs", category: "cloud",     icon: "🔍", risk: "low" },
  "gstatic.com":       { name: "Google Static",category: "cdn",      icon: "🔍", risk: "low" },
  "bing.com":          { name: "Bing",        category: "search",    icon: "🔍", risk: "low" },
  "duckduckgo.com":    { name: "DuckDuckGo",  category: "search",    icon: "🦆", risk: "low" },
  "yahoo.com":         { name: "Yahoo",       category: "search",    icon: "🔍", risk: "low" },

  // ── Cloud & Productivity ────────────────────────────────────────────────────
  "microsoft.com":     { name: "Microsoft",   category: "cloud",     icon: "🪟", risk: "low" },
  "office.com":        { name: "Microsoft 365", category: "cloud",   icon: "📊", risk: "low" },
  "microsoftonline.com":{ name: "Microsoft 365", category: "cloud",  icon: "📊", risk: "low" },
  "live.com":          { name: "Microsoft Live", category: "cloud",  icon: "📧", risk: "low" },
  "outlook.com":       { name: "Outlook",     category: "cloud",     icon: "📧", risk: "low" },
  "onedrive.com":      { name: "OneDrive",    category: "cloud",     icon: "☁️", risk: "low" },
  "sharepoint.com":    { name: "SharePoint",  category: "cloud",     icon: "📂", risk: "low" },
  "dropbox.com":       { name: "Dropbox",     category: "cloud",     icon: "📦", risk: "low" },
  "box.com":           { name: "Box",         category: "cloud",     icon: "📦", risk: "low" },
  "drive.google.com":  { name: "Google Drive",category: "cloud",     icon: "🗂️", risk: "low" },
  "docs.google.com":   { name: "Google Docs", category: "cloud",     icon: "📄", risk: "low" },
  "zoom.us":           { name: "Zoom",        category: "messaging", icon: "📹", risk: "low" },
  "slack.com":         { name: "Slack",       category: "messaging", icon: "💬", risk: "low" },
  "teams.microsoft.com":{ name: "MS Teams",   category: "messaging", icon: "💬", risk: "low" },
  "skype.com":         { name: "Skype",       category: "messaging", icon: "📞", risk: "low" },
  "amazonaws.com":     { name: "Amazon AWS",  category: "cloud",     icon: "☁️", risk: "low" },
  "awsstatic.com":     { name: "Amazon AWS",  category: "cloud",     icon: "☁️", risk: "low" },

  // ── Finance & Crypto ────────────────────────────────────────────────────────
  "paypal.com":        { name: "PayPal",      category: "finance",   icon: "💰", risk: "medium" },
  "stripe.com":        { name: "Stripe",      category: "finance",   icon: "💳", risk: "low" },
  "coinbase.com":      { name: "Coinbase",    category: "finance",   icon: "₿",  risk: "medium", note: "Cryptocurrency exchange" },
  "binance.com":       { name: "Binance",     category: "finance",   icon: "₿",  risk: "medium" },
  "blockchain.com":    { name: "Blockchain",  category: "finance",   icon: "⛓️", risk: "medium" },
  "crypto.com":        { name: "Crypto.com",  category: "finance",   icon: "₿",  risk: "medium" },

  // ── Ad Tech / Tracking ──────────────────────────────────────────────────────
  "doubleclick.net":   { name: "Google Ads",  category: "adtech",    icon: "📢", risk: "low" },
  "googleadservices.com":{ name: "Google Ads",category: "adtech",    icon: "📢", risk: "low" },
  "googlesyndication.com":{ name: "Google AdSense", category: "adtech", icon: "📢", risk: "low" },
  "facebook.net":      { name: "Facebook Pixel", category: "adtech", icon: "📢", risk: "low" },
  "hotjar.com":        { name: "Hotjar",      category: "adtech",    icon: "🔥", risk: "low" },
  "mixpanel.com":      { name: "Mixpanel",    category: "adtech",    icon: "📈", risk: "low" },

  // ── Security Tools ──────────────────────────────────────────────────────────
  "kaspersky.com":     { name: "Kaspersky AV",category: "security",  icon: "🛡️", risk: "medium", note: "Russian AV — restricted in some countries" },
  "avast.com":         { name: "Avast AV",    category: "security",  icon: "🛡️", risk: "low" },
  "malwarebytes.com":  { name: "Malwarebytes",category: "security",  icon: "🛡️", risk: "low" },
  "virustotal.com":    { name: "VirusTotal",  category: "security",  icon: "🔬", risk: "medium", note: "File scanning — could indicate incident response" },
  "shodan.io":         { name: "Shodan",      category: "security",  icon: "🔭", risk: "high", note: "Network recon tool" },
  "censys.io":         { name: "Censys",      category: "security",  icon: "🔭", risk: "high", note: "Network recon tool" },

  // ── System / OS Telemetry ───────────────────────────────────────────────────
  "windowsupdate.com": { name: "Windows Update", category: "system", icon: "🪟", risk: "low" },
  "update.microsoft.com":{ name: "Windows Update", category: "system", icon: "🪟", risk: "low" },
  "windows.com":       { name: "Windows",     category: "system",    icon: "🪟", risk: "low" },
  "events.data.microsoft.com":{ name: "MS Telemetry", category: "system", icon: "📡", risk: "low" },
  "ubuntu.com":        { name: "Ubuntu",      category: "system",    icon: "🐧", risk: "low" },
  "canonical.com":     { name: "Ubuntu/Canonical", category: "system", icon: "🐧", risk: "low" },

  // ── Shopping ────────────────────────────────────────────────────────────────
  "amazon.com":        { name: "Amazon",      category: "shopping",  icon: "🛒", risk: "low" },
  "ebay.com":          { name: "eBay",        category: "shopping",  icon: "🛍️", risk: "low" },
  "aliexpress.com":    { name: "AliExpress",  category: "shopping",  icon: "🛒", risk: "low" },
  "shopify.com":       { name: "Shopify",     category: "shopping",  icon: "🛒", risk: "low" },

  // ── Adult Content ───────────────────────────────────────────────────────────
  "pornhub.com":       { name: "PornHub",     category: "adult",     icon: "🔞", risk: "medium", note: "Adult content platform" },
  "xvideos.com":       { name: "XVideos",     category: "adult",     icon: "🔞", risk: "medium" },
  "xnxx.com":          { name: "XNXX",        category: "adult",     icon: "🔞", risk: "medium" },
  "onlyfans.com":      { name: "OnlyFans",    category: "adult",     icon: "🔞", risk: "medium" },
};

// Category display config
export const CATEGORY_META: Record<AppCategory, { label: string; color: string; bg: string }> = {
  social:    { label: "Social Media",  color: "text-blue-400",   bg: "bg-blue-500/15 border-blue-500/30" },
  video:     { label: "Video",         color: "text-red-400",    bg: "bg-red-500/15 border-red-500/30" },
  vpn:       { label: "VPN / Proxy",   color: "text-rose-400",   bg: "bg-rose-500/20 border-rose-500/40" },
  gaming:    { label: "Gaming",        color: "text-violet-400", bg: "bg-violet-500/15 border-violet-500/30" },
  messaging: { label: "Messaging",     color: "text-emerald-400",bg: "bg-emerald-500/15 border-emerald-500/30" },
  adtech:    { label: "Ad / Tracking", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
  cdn:       { label: "CDN",           color: "text-slate-400",  bg: "bg-slate-700/50 border-slate-600" },
  cloud:     { label: "Cloud",         color: "text-sky-400",    bg: "bg-sky-500/15 border-sky-500/30" },
  streaming: { label: "Music",         color: "text-green-400",  bg: "bg-green-500/15 border-green-500/30" },
  shopping:  { label: "Shopping",      color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30" },
  news:      { label: "News",          color: "text-slate-300",  bg: "bg-slate-700/40 border-slate-600" },
  finance:   { label: "Finance",       color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/30" },
  security:  { label: "Security",      color: "text-teal-400",   bg: "bg-teal-500/15 border-teal-500/30" },
  system:    { label: "System",        color: "text-slate-400",  bg: "bg-slate-700/40 border-slate-600" },
  search:    { label: "Search",        color: "text-indigo-400", bg: "bg-indigo-500/15 border-indigo-500/30" },
  adult:     { label: "Adult",         color: "text-pink-400",   bg: "bg-pink-500/20 border-pink-500/40" },
  other:     { label: "Other",         color: "text-slate-500",  bg: "bg-slate-800 border-slate-700" },
};

/**
 * Look up app info for a given apex domain.
 * Also does partial suffix matching so subdomains of known apps are caught.
 */
export function identifyApp(domain: string): AppRecord | null {
  if (!domain) return null;
  const d = domain.toLowerCase();

  // Exact match first
  if (APP_MAP[d]) return APP_MAP[d];

  // Suffix match — catches things like "api.tiktok.com" → tiktok.com
  for (const key of Object.keys(APP_MAP)) {
    if (d === key || d.endsWith(`.${key}`)) return APP_MAP[key];
  }

  return null;
}

/** Return all unique categories present in an array of domains */
export function categoriseDomains(domains: string[]): AppCategory[] {
  const cats = new Set<AppCategory>();
  for (const d of domains) {
    const app = identifyApp(d);
    if (app) cats.add(app.category);
  }
  return [...cats];
}
