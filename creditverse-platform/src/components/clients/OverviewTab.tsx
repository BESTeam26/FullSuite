import { useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  TrendingUp,
  Trophy,
  Wallet,
  Users2,
  UserCheck,
  Bell,
  ArrowUpRight,
  Target,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import ScorePotentialCard from "@/components/clients/ScorePotentialCard";
import NextBestActionCard from "@/components/clients/NextBestActionCard";
import BureauRadarCharts from "@/components/clients/BureauRadarCharts";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import {
  scoreHistory,
  bureaus,
  checklist,
  results,
  notifications,
  scoreBand,
  DeltaPill,
  ScoreGauge,
} from "@/components/clients/overview-data";

const iconMap = {
  Trophy,
  CheckCircle2,
  Wallet,
  TrendingUp,
  Users2,
  UserCheck,
} as const;

const OverviewTab = () => {
  const { items } = useClientWorkspace();
  const progress = Math.round(
    (checklist.filter((c) => c.done).length / checklist.length) * 100,
  );

  const classifiedItems = useMemo(() => items, [items]);

  const totalGain =
    bureaus.reduce((s, b) => s + (b.score - b.first), 0) / bureaus.length;
  const roundGain =
    bureaus.reduce((s, b) => s + (b.score - b.prev), 0) / bureaus.length;

  return (
    <div className="space-y-6">
      {/* Hero score summary */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-emerald-500/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Credit score progress
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              Strong upward movement across all bureaus
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <TrendingUp className="h-4 w-4 text-status-success" />
                <div>
                  <p className="text-lg font-bold leading-none text-status-success">
                    +{Math.round(totalGain)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    since first import
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2">
                <ArrowUpRight className="h-4 w-4 text-sky-600" />
                <div>
                  <p className="text-lg font-bold leading-none text-sky-600">
                    +{Math.round(roundGain)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    this round
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-bold leading-none">740</p>
                  <p className="text-[11px] text-muted-foreground">
                    target goal
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bureau gauge cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {bureaus.map((b) => {
            const band = scoreBand(b.score);
            const roundDelta = b.score - b.prev;
            const totalDelta = b.score - b.first;
            return (
              <div
                key={b.key}
                className="relative rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {b.label}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${band.tone}`}
                  >
                    {band.label}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-center">
                  <ScoreGauge
                    score={b.score}
                    color={b.color}
                    gradient={b.gradient}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <DeltaPill value={roundDelta} label="this round" />
                  <DeltaPill value={totalDelta} label="total" tone="total" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Score trend chart with annotations */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Score journey by round</h2>
            <p className="text-xs text-muted-foreground">
              Tracked across every credit pull since intake · intake → round 5
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {bureaus.map((b) => (
              <div key={b.key} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={scoreHistory}
              margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
            >
              <defs>
                {bureaus.map((b) => (
                  <linearGradient
                    key={b.key}
                    id={`fill-${b.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={b.color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={b.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={["dataMin - 20", "dataMax + 20"]}
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
              />
              <ReferenceLine
                y={740}
                stroke="#10b981"
                strokeDasharray="6 4"
                label={{
                  value: "Target 740",
                  fontSize: 10,
                  fill: "#10b981",
                  position: "insideTopRight",
                }}
              />
              {bureaus.map((b) => (
                <Area
                  key={b.key}
                  type="monotone"
                  dataKey={b.key}
                  name={b.label}
                  stroke={b.color}
                  strokeWidth={2.5}
                  fill={`url(#fill-${b.key})`}
                  dot={{ r: 3, strokeWidth: 0, fill: b.color }}
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    stroke: "#fff",
                    fill: b.color,
                  }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* FICO Score Potential Analysis — smart logic, human-verified */}
      <ScorePotentialCard items={classifiedItems} />

      {/* Next Best Actions — prioritized repair-vs-build checklist */}
      <NextBestActionCard items={classifiedItems} />

      {/* Per-bureau factor radar charts */}
      <BureauRadarCharts />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Client checklist</h2>
            <span className="text-xs font-semibold text-status-success">
              {progress}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-emerald"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ul className="mt-4 space-y-2.5">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-sm">
                {c.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
                ) : c.warn ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={
                    c.done ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="font-semibold">Latest & total results</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {results.map((r) => {
              const Icon = iconMap[r.icon as keyof typeof iconMap];
              return (
                <div
                  key={r.label}
                  className="rounded-xl border border-border bg-muted/30 p-4"
                >
                  <Icon className="h-4 w-4 text-status-success" />
                  <p className="mt-2 text-xl font-bold">{r.value}</p>
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-status-success" />
            <h2 className="text-sm font-semibold">Notifications</h2>
          </div>
          <ul className="mt-3 space-y-3">
            {notifications.map((n) => {
              const Icon = iconMap[n.icon as keyof typeof iconMap] ?? Bell;
              return (
                <li key={n.text} className="flex items-start gap-2.5 text-sm">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div>
                    <p>{n.text}</p>
                    <p className="text-xs text-muted-foreground">{n.time}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Agent & affiliate</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-emerald text-xs font-semibold text-white">
              DG
            </div>
            <div>
              <p className="text-sm font-medium">Dee Gallardo</p>
              <p className="text-xs text-muted-foreground">Assigned agent</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              JC
            </div>
            <div>
              <p className="text-sm font-medium">Jensen Cedacero</p>
              <p className="text-xs text-muted-foreground">
                Referring affiliate
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Round snapshot</h2>
          <div className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current round</span>
              <span className="font-semibold">Round 5</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Items disputed</span>
              <span className="font-semibold">43 total</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Deletions</span>
              <span className="font-semibold text-status-success">32</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">On-going</span>
              <span className="font-semibold">4</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
