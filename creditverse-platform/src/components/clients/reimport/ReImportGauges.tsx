import type { Bureau } from "@/lib/credit-classification";

export interface BureauScore {
  bureau: Bureau;
  score: number;
  prevScore: number;
  date: string;
}

export function ScoreGauge({ data }: { data: BureauScore }) {
  const change = data.score - data.prevScore;
  const isPositive = change >= 0;
  const pct = ((data.score - 300) / 550) * 100;
  const color = isPositive ? "#10b981" : change === 0 ? "#94a3b8" : "#ef4444";
  const label =
    data.bureau === "EQ"
      ? "Equifax"
      : data.bureau === "EX"
        ? "Experian"
        : "TransUnion";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-center text-sm font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <div className="relative mx-auto mt-3 h-28 w-40">
        <svg viewBox="0 0 160 100" className="h-full w-full">
          <path
            d="M 20 85 A 60 60 0 0 1 140 85"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 20 85 A 60 60 0 0 1 140 85"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 188} 188`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
          <p className="text-3xl font-bold">{data.score}</p>
          <p className="text-[10px] text-muted-foreground">{data.date}</p>
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>300</span>
        <span>850</span>
      </div>
      <div className="mt-1 text-center">
        <span
          className={`text-lg font-bold ${isPositive ? "text-status-success" : "text-status-danger"}`}
        >
          {isPositive ? "+" : ""}
          {change}
        </span>
        <p className="text-xs text-muted-foreground">
          Prev Score: {data.prevScore}
        </p>
      </div>
    </div>
  );
}
