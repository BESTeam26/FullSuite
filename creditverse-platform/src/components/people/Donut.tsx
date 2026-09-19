/**
 * A ring of segments with a figure in the middle — the Overview's attendance
 * and EOD compliance cards. Pure SVG: no chart library for two rings.
 */
export interface DonutSegment { label: string; value: number; className: string }

export function Donut({ segments, centre, caption, size = 120 }: {
  segments: DonutSegment[];
  centre: string;
  caption: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 42, stroke = 12, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${centre} ${caption}`}>
      <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted" strokeWidth={stroke} />
      {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
        const len = (s.value / total) * c;
        const el = (
          <circle key={s.label} cx="50" cy="50" r={r} fill="none" strokeWidth={stroke}
            className={s.className} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
            transform="rotate(-90 50 50)" />
        );
        offset += len;
        return el;
      })}
      <text x="50" y="48" textAnchor="middle" className="fill-foreground text-[15px] font-extrabold">{centre}</text>
      <text x="50" y="61" textAnchor="middle" className="fill-muted-foreground text-[7px] font-semibold">{caption}</text>
    </svg>
  );
}
