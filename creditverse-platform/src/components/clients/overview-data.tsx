import { ArrowUpRight, Minus } from "lucide-react";

export const scoreHistory = [
  { date: "Intake", equifax: 588, experian: 601, transunion: 590, round: 0 },
  { date: "Round 1", equifax: 602, experian: 615, transunion: 599, round: 1 },
  { date: "Round 2", equifax: 615, experian: 628, transunion: 606, round: 2 },
  { date: "Round 3", equifax: 631, experian: 641, transunion: 614, round: 3 },
  { date: "Round 4", equifax: 642, experian: 651, transunion: 624, round: 4 },
  { date: "Round 5", equifax: 654, experian: 660, transunion: 635, round: 5 },
];

export const bureaus = [
  {
    key: "equifax" as const,
    label: "Equifax",
    score: 654,
    prev: 642,
    first: 588,
    color: "#ef4444",
    gradient: "from-red-500 to-rose-400",
  },
  {
    key: "experian" as const,
    label: "Experian",
    score: 660,
    prev: 651,
    first: 601,
    color: "#3b82f6",
    gradient: "from-blue-500 to-sky-400",
  },
  {
    key: "transunion" as const,
    label: "TransUnion",
    score: 635,
    prev: 624,
    first: 590,
    color: "#10b981",
    gradient: "from-emerald-500 to-green-400",
  },
];

export const checklist = [
  { label: "Complete all client information", done: true },
  { label: "Assign agent & sales person", done: true },
  { label: "Activate client portal access", done: true },
  { label: "Initiate onboarding campaign", done: true },
  { label: "Setup billing information", done: false, warn: true },
  { label: "Import credit report", done: true },
  { label: "Complete Round 1 disputes", done: true },
  { label: "Build Round 2 letters", done: false },
];

export const results = [
  { label: "Deletions this round", value: "3", icon: "Trophy" as const },
  { label: "Corrections", value: "2", icon: "CheckCircle2" as const },
  { label: "Balance removed", value: "$6,240", icon: "Wallet" as const },
  { label: "Avg. score change", value: "+65", icon: "TrendingUp" as const },
];

export const notifications = [
  {
    text: "Agreement signed",
    time: "4 days ago",
    icon: "CheckCircle2" as const,
  },
  { text: "New client signup", time: "4 days ago", icon: "Users2" as const },
  {
    text: "Lead manually added",
    time: "4 days ago",
    icon: "UserCheck" as const,
  },
];

export const scoreBand = (score: number) => {
  if (score >= 740) return { label: "Excellent", tone: "text-status-success" };
  if (score >= 670) return { label: "Good", tone: "text-sky-600" };
  if (score >= 580) return { label: "Fair", tone: "text-status-warning" };
  return { label: "Poor", tone: "text-status-danger" };
};

export const DeltaPill = ({
  value,
  label,
  tone = "round",
}: {
  value: number;
  label: string;
  tone?: "round" | "total";
}) => {
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <Minus className="h-3 w-3" /> {label}
      </span>
    );
  const positive = value > 0;
  const cls =
    tone === "total"
      ? positive
        ? "bg-emerald-500/15 text-status-success"
        : "bg-red-500/15 text-status-danger"
      : positive
        ? "bg-sky-500/15 text-sky-600"
        : "bg-red-500/15 text-status-danger";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      <ArrowUpRight className={`h-3 w-3 ${positive ? "" : "rotate-90"}`} />
      {positive ? "+" : ""}
      {value} {label}
    </span>
  );
};

export const ScoreGauge = ({
  score,
  color,
}: {
  score: number;
  color: string;
  gradient?: string;
}) => {
  const pct = Math.min(100, Math.max(0, ((score - 300) / (850 - 300)) * 100));
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="9"
        />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tracking-tight">{score}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          / 850
        </span>
      </div>
    </div>
  );
};
