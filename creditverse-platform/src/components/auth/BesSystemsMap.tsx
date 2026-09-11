/**
 * The BES platform, drawn as what it actually is: one core, four connected
 * operating modules.
 *
 * It sits behind the sign-in page's brand panel and is the one thing on that
 * page no other company could use. Deliberately quiet — thin gold connectors,
 * low-contrast node cards, a grid you notice second — because it is the
 * backdrop to a password field, not a diagram anybody came to read.
 *
 * It is also the only place the four module names appear on this page — a
 * second list beside it would say the same words twice — so it is a labelled
 * `img` rather than decoration, and a screen reader hears them once.
 *
 * The travelling highlights on the connectors are what make it read as a
 * system rather than a logo arrangement. They are a stroke-dash animation
 * (`.bes-connector-flow` in index.css) which stops under
 * `prefers-reduced-motion` — the map is complete and legible without them.
 */

/** Centre points in the viewBox. Cards are drawn around these. */
const MODULES = [
  { label: "CreditOps", x: 104, y: 92 },
  { label: "FundingOps", x: 416, y: 92 },
  { label: "BES CRM", x: 104, y: 328 },
  { label: "TalentOps", x: 416, y: 328 },
] as const;

const CORE = { x: 260, y: 210 };
const CARD = { w: 116, h: 32 };

export function BesSystemsMap({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 420"
      className={className}
      role="img"
      aria-label="The BES platform: CreditOps, FundingOps, BES CRM and TalentOps, connected to one core."
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="bes-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity="0.28" />
          <stop offset="70%" stopColor="hsl(var(--gold))" stopOpacity="0.05" />
          <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity="0" />
        </radialGradient>
        <pattern id="bes-grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path
            d="M 26 0 L 0 0 0 26"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            strokeOpacity="0.07"
          />
        </pattern>
      </defs>

      <rect width="520" height="420" fill="url(#bes-grid)" />
      <circle cx={CORE.x} cy={CORE.y} r="150" fill="url(#bes-core-glow)" />

      {/* Connectors, drawn before the cards so the cards sit over them. */}
      {MODULES.map((m) => {
        const d = `M ${CORE.x} ${CORE.y} L ${m.x} ${m.y}`;
        return (
          <g key={`line-${m.label}`}>
            <path d={d} stroke="hsl(var(--gold))" strokeOpacity="0.22" strokeWidth="1" fill="none" />
            <path
              d={d}
              className="bes-connector-flow"
              stroke="hsl(var(--gold))"
              strokeOpacity="0.55"
              strokeWidth="1.25"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        );
      })}

      {/* The core. */}
      <circle cx={CORE.x} cy={CORE.y} r="46" fill="hsl(var(--charcoal-deep))" fillOpacity="0.9" />
      <circle cx={CORE.x} cy={CORE.y} r="46" stroke="hsl(var(--gold))" strokeOpacity="0.5" strokeWidth="1" fill="none" />
      <circle cx={CORE.x} cy={CORE.y} r="58" stroke="hsl(var(--gold))" strokeOpacity="0.16" strokeWidth="1" fill="none" />
      <text
        x={CORE.x}
        y={CORE.y + 6}
        textAnchor="middle"
        fill="hsl(var(--gold))"
        fontSize="19"
        fontWeight="700"
        letterSpacing="2.5"
      >
        BES
      </text>

      {/* The modules. */}
      {MODULES.map((m) => (
        <g key={m.label}>
          <rect
            x={m.x - CARD.w / 2}
            y={m.y - CARD.h / 2}
            width={CARD.w}
            height={CARD.h}
            rx="10"
            fill="hsl(var(--charcoal-deep))"
            fillOpacity="0.85"
            stroke="currentColor"
            strokeOpacity="0.14"
            strokeWidth="1"
          />
          <circle cx={m.x - CARD.w / 2 + 16} cy={m.y} r="2.5" fill="hsl(var(--gold))" fillOpacity="0.85" />
          <text
            x={m.x - CARD.w / 2 + 27}
            y={m.y + 4}
            fill="currentColor"
            fillOpacity="0.62"
            fontSize="11.5"
            fontWeight="500"
          >
            {m.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
