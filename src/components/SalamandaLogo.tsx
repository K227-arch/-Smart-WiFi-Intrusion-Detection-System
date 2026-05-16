/**
 * Salamanda — SVG salamander illustration used as the app logo.
 * Drawn as a stylised fire salamander (black body, orange/amber spots)
 * to match the dark cybersecurity aesthetic.
 */
export function SalamandaLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Salamanda logo"
      role="img"
    >
      {/* ── Body ── */}
      <ellipse cx="32" cy="36" rx="13" ry="8" fill="#1e293b" stroke="#0ea5e9" strokeWidth="1.2" />

      {/* ── Head ── */}
      <ellipse cx="32" cy="24" rx="8" ry="6.5" fill="#1e293b" stroke="#0ea5e9" strokeWidth="1.2" />

      {/* ── Eyes ── */}
      <circle cx="28.5" cy="22" r="2" fill="#0ea5e9" />
      <circle cx="35.5" cy="22" r="2" fill="#0ea5e9" />
      <circle cx="28.5" cy="22" r="0.9" fill="#fff" />
      <circle cx="35.5" cy="22" r="0.9" fill="#fff" />

      {/* ── Nostrils ── */}
      <circle cx="30" cy="25.5" r="0.7" fill="#0ea5e9" opacity="0.7" />
      <circle cx="34" cy="25.5" r="0.7" fill="#0ea5e9" opacity="0.7" />

      {/* ── Tail (curves right then down) ── */}
      <path
        d="M44 38 C52 38 56 42 54 50 C52 56 46 57 44 54"
        stroke="#0ea5e9"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* tail inner dark fill */}
      <path
        d="M44 38 C52 38 56 42 54 50 C52 56 46 57 44 54"
        stroke="#1e293b"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Front-left leg ── */}
      <path
        d="M24 38 C20 40 17 38 15 41"
        stroke="#0ea5e9" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      {/* toes */}
      <path d="M15 41 C13 40 12 42 11 41" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M15 41 C14 43 13 44 12 44" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M15 41 C16 43 16 45 15 45" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {/* ── Front-right leg ── */}
      <path
        d="M40 38 C44 40 47 38 49 41"
        stroke="#0ea5e9" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      <path d="M49 41 C51 40 52 42 53 41" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M49 41 C50 43 51 44 52 44" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M49 41 C48 43 48 45 49 45" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {/* ── Hind-left leg ── */}
      <path
        d="M22 42 C18 46 16 46 14 50"
        stroke="#0ea5e9" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      <path d="M14 50 C12 49 11 51 10 50" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M14 50 C13 52 12 53 11 53" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M14 50 C15 52 15 54 14 54" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {/* ── Hind-right leg ── */}
      <path
        d="M42 42 C46 46 48 46 50 50"
        stroke="#0ea5e9" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      <path d="M50 50 C52 49 53 51 54 50" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M50 50 C51 52 52 53 53 53" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M50 50 C49 52 49 54 50 54" stroke="#0ea5e9" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {/* ── Dorsal ridge spots (amber — fire salamander markings) ── */}
      <ellipse cx="32" cy="30" rx="2.2" ry="1.4" fill="#f59e0b" opacity="0.9" />
      <ellipse cx="27" cy="33" rx="1.8" ry="1.1" fill="#f59e0b" opacity="0.85" />
      <ellipse cx="37" cy="33" rx="1.8" ry="1.1" fill="#f59e0b" opacity="0.85" />
      <ellipse cx="32" cy="37" rx="2" ry="1.2" fill="#f59e0b" opacity="0.8" />

      {/* ── Head spot ── */}
      <ellipse cx="32" cy="19" rx="2.5" ry="1.5" fill="#f59e0b" opacity="0.9" />
    </svg>
  );
}
