/**
 * The atmosphere on the sign-in brand panel.
 *
 * Three soft clouds of BES gold and green, heavily blurred, drifting on
 * different periods so they never resolve into a visible loop. Over the
 * darkened artwork they read as light moving through smoke — the panel is
 * alive before anybody touches it, which is what a spotlight alone could not
 * do (Dee, 2026-09-11).
 *
 * Restraint is the whole design here. This sits beside a password field, so
 * the periods are 34-52 seconds and the opacities are in the teens: at any
 * given glance nothing appears to be moving, and only somebody who rests on
 * the page notices it has changed. Anything faster would be a distraction
 * where people are trying to type.
 *
 * Cheap by construction: transform and opacity only, so each cloud is its own
 * composited layer and nothing ever relayouts. `prefers-reduced-motion` stops
 * all three — the panel is complete standing still.
 */

interface Cloud {
  className: string;
  style: React.CSSProperties;
}

/** Positioned in percentages so the clouds scale with the panel. */
const CLOUDS: Cloud[] = [
  {
    className: "bes-smoke-a",
    style: {
      top: "-18%",
      left: "-20%",
      width: "78%",
      height: "68%",
      background: "radial-gradient(circle, hsl(var(--gold) / 0.30) 0%, transparent 68%)",
    },
  },
  {
    className: "bes-smoke-b",
    style: {
      bottom: "-24%",
      right: "-18%",
      width: "82%",
      height: "72%",
      background: "radial-gradient(circle, hsl(var(--green-bright) / 0.26) 0%, transparent 66%)",
    },
  },
  {
    className: "bes-smoke-c",
    style: {
      top: "26%",
      left: "18%",
      width: "66%",
      height: "60%",
      background: "radial-gradient(circle, hsl(var(--gold-glow) / 0.20) 0%, transparent 70%)",
    },
  },
];

export function BrandPanelSmoke() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {CLOUDS.map((c) => (
        <div
          key={c.className}
          className={`absolute rounded-full blur-3xl ${c.className}`}
          style={c.style}
        />
      ))}
    </div>
  );
}
