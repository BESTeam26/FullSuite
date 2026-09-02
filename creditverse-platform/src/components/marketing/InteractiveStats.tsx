import { useEffect, useRef, useState } from "react";

/** Animated count-up that triggers when scrolled into view */
export const useCountUp = (target: number, duration = 1600) => {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(Math.round(target * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);

  return { value, ref };
};

export const AnimatedStat = ({
  value,
  prefix = "",
  suffix = "",
  label,
  light = false,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  light?: boolean;
}) => {
  const { value: v, ref } = useCountUp(value);
  return (
    <div className="text-center">
      <span
        ref={ref}
        className={`block text-3xl font-black tracking-tight md:text-4xl ${
          light ? "text-amber-400" : "text-foreground"
        }`}
      >
        {prefix}
        {v.toLocaleString()}
        {suffix}
      </span>
      <p
        className={`mt-1 text-sm ${light ? "text-slate-300" : "text-muted-foreground"}`}
      >
        {label}
      </p>
    </div>
  );
};

/** Animated horizontal bar that fills on scroll */
export const AnimatedBar = ({
  label,
  value,
  max,
  color = "bg-gradient-gold",
  delay = 0,
  light = false,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  delay?: number;
  light?: boolean;
}) => {
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const pct = Math.min((value / max) * 100, 100);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setTimeout(() => setWidth(pct), delay);
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [pct, delay]);

  return (
    <div ref={ref}>
      <div className="flex items-center justify-between text-sm">
        <span
          className={`font-medium ${light ? "text-white" : "text-foreground"}`}
        >
          {label}
        </span>
        <span className={light ? "text-slate-300" : "text-muted-foreground"}>
          {value}%
        </span>
      </div>
      <div
        className={`mt-1.5 h-2.5 overflow-hidden rounded-full ${
          light ? "bg-white/15" : "bg-muted"
        }`}
      >
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${color}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
};

/** Animated circular gauge */
export const AnimatedGauge = ({
  value,
  max = 100,
  label,
  sublabel,
  size = 120,
  color = "#EBAA15",
}: {
  value: number;
  max?: number;
  label: string;
  sublabel?: string;
  size?: number;
  color?: string;
}) => {
  const [pct, setPct] = useState(0);
  const ref = useRef<SVGSVGElement>(null);
  const target = Math.min((value / max) * 100, 100);
  const radius = (size - 14) / 2;
  const circ = 2 * Math.PI * radius;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setTimeout(() => setPct(target), 200);
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return (
    <div className="flex w-full max-w-[168px] flex-col items-center">
      {/* Chart container: fixed dimensions, value centered inside via absolute
          positioning scoped only to this container (never affects layout below). */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg ref={ref} width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - (circ * pct) / 100}
            style={{ transition: "stroke-dashoffset 1.4s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black text-foreground">{value}</span>
        </div>
      </div>

      {/* Label area: flows naturally below the donut, reserved height,
          wraps to a max of 2 lines instead of climbing into the chart. */}
      <div className="mt-4 flex min-h-[2.75rem] w-full flex-col items-center justify-start text-center">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {label}
        </p>
        {sublabel && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
};
