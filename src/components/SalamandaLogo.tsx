/**
 * SalamandaLogo — SVG recreation of the official SALAMANDA NIDS logo.
 * Black salamander with amber/gold markings, circuit board pattern,
 * shield+lock icon, and amber circular frame.
 */
export function SalamandaLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Salamanda NIDS logo"
      role="img"
    >
      {/* ── Outer amber ring ── */}
      <circle cx="60" cy="60" r="56" stroke="#F59E0B" strokeWidth="3" fill="none" />

      {/* ── Dark circle background ── */}
      <circle cx="60" cy="60" r="54" fill="#0D0D0D" />

      {/* ── Circuit board lines (right half) ── */}
      <g stroke="#F59E0B" strokeWidth="0.8" opacity="0.35">
        <line x1="72" y1="35" x2="100" y2="35" />
        <line x1="100" y1="35" x2="100" y2="55" />
        <line x1="85" y1="55" x2="100" y2="55" />
        <line x1="85" y1="55" x2="85" y2="75" />
        <line x1="85" y1="75" x2="105" y2="75" />
        <line x1="72" y1="85" x2="95" y2="85" />
        <line x1="95" y1="85" x2="95" y2="65" />
        <line x1="78" y1="45" x2="78" y2="30" />
        <line x1="78" y1="30" x2="108" y2="30" />
        {/* circuit nodes */}
        <circle cx="100" cy="35" r="2" fill="#F59E0B" opacity="0.5" />
        <circle cx="100" cy="55" r="2" fill="#F59E0B" opacity="0.5" />
        <circle cx="85" cy="75" r="2" fill="#F59E0B" opacity="0.5" />
        <circle cx="95" cy="65" r="2" fill="#F59E0B" opacity="0.5" />
        <circle cx="78" cy="30" r="2" fill="#F59E0B" opacity="0.5" />
        <circle cx="85" cy="55" r="2" fill="#F59E0B" opacity="0.5" />
      </g>

      {/* ── Shield with lock (right side) ── */}
      <path
        d="M82 52 L82 68 Q82 76 90 80 Q98 76 98 68 L98 52 L90 49 Z"
        fill="#1A1A1A"
        stroke="#F59E0B"
        strokeWidth="1.5"
      />
      {/* lock body */}
      <rect x="86" y="63" width="8" height="7" rx="1.5" fill="#D97706" />
      {/* lock shackle */}
      <path d="M87.5 63 L87.5 60 Q87.5 57 90 57 Q92.5 57 92.5 60 L92.5 63" stroke="#D97706" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* keyhole */}
      <circle cx="90" cy="66" r="1.2" fill="#0D0D0D" />
      <rect x="89.4" y="66" width="1.2" height="2" fill="#0D0D0D" />

      {/* ── Salamander body (curled, black with amber spots) ── */}
      {/* Main body curve */}
      <path
        d="M55 25 C40 22 28 28 22 40 C16 52 20 65 30 72 C40 79 52 78 58 85 C64 92 62 100 55 105"
        stroke="#1A1A1A"
        strokeWidth="14"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M55 25 C40 22 28 28 22 40 C16 52 20 65 30 72 C40 79 52 78 58 85 C64 92 62 100 55 105"
        stroke="#2A2A2A"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Amber/gold spots along body ── */}
      <ellipse cx="48" cy="27" rx="5" ry="3" fill="#F59E0B" transform="rotate(-20 48 27)" />
      <ellipse cx="35" cy="35" rx="4.5" ry="2.8" fill="#F59E0B" transform="rotate(-35 35 35)" />
      <ellipse cx="24" cy="48" rx="4" ry="2.5" fill="#F59E0B" transform="rotate(-60 24 48)" />
      <ellipse cx="26" cy="62" rx="4" ry="2.5" fill="#F59E0B" transform="rotate(-70 26 62)" />
      <ellipse cx="36" cy="73" rx="4.5" ry="2.8" fill="#F59E0B" transform="rotate(-50 36 73)" />
      <ellipse cx="50" cy="80" rx="4" ry="2.5" fill="#F59E0B" transform="rotate(-30 50 80)" />
      <ellipse cx="58" cy="92" rx="3.5" ry="2" fill="#F59E0B" transform="rotate(-10 58 92)" />

      {/* ── Head ── */}
      <ellipse cx="60" cy="22" rx="9" ry="7" fill="#1A1A1A" />
      <ellipse cx="60" cy="22" rx="7.5" ry="5.5" fill="#222222" />

      {/* ── Eye ── */}
      <circle cx="64" cy="19" r="3" fill="#F59E0B" />
      <circle cx="64" cy="19" r="1.8" fill="#1A1A1A" />
      <circle cx="64.8" cy="18.2" r="0.7" fill="#F59E0B" opacity="0.8" />

      {/* ── Head amber spot ── */}
      <ellipse cx="57" cy="20" rx="3.5" ry="2" fill="#F59E0B" opacity="0.9" />

      {/* ── Front legs ── */}
      <path d="M38 42 C32 38 26 36 22 32" stroke="#1A1A1A" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M38 42 C32 38 26 36 22 32" stroke="#2A2A2A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {/* front toes */}
      <path d="M22 32 C19 30 17 31 15 29" stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M22 32 C20 35 18 35 16 37" stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M22 32 C22 35 21 37 20 39" stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* ── Hind legs ── */}
      <path d="M32 70 C26 74 20 72 16 76" stroke="#1A1A1A" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M32 70 C26 74 20 72 16 76" stroke="#2A2A2A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {/* hind toes */}
      <path d="M16 76 C13 74 11 75 9 73" stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M16 76 C14 79 12 79 10 81" stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M16 76 C16 79 15 81 14 83" stroke="#2A2A2A" strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* ── Amber ring accent (top-right gap) ── */}
      <path d="M60 4 A56 56 0 0 1 116 60" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
