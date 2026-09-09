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
import { useClientReports } from "@/lib/data/use-credit-reports";
import { formatDate } from "@/lib/format-date";
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

/* Presentation for each bureau. The NUMBERS never come from here. */
const BUREAU_META: Record<string, { color: string; gradient: string }> = {
  equifax: { color: "#ef4444", gradient: "from-red-500 to-rose-400" },
  experian: { color: "#3b82f6", gradient: "from-blue-500 to-sky-400" },
  transunion: { color: "#10b981", gradient: "from-emerald-500 to-green-400" },
};

const OverviewTab = () => {
  /* Three worlds, told apart by `reportSource` (rule 12):
       "sample" — demo mode; the bundled sample renders exactly as before.
       "none"   — a LIVE client with nothing imported. The page banner
                  promises "nothing on this profile is estimated without it",
                  so this tab shows real facts and honest emptiness — never
                  the sample scores, gains, checklists or agents.
       "live"   — the client's own imported reports, and only them. */
  const { items, scores, reportSource, clientId, disputeCount, deletionCount } =
    useClientWorkspace();
  const demo = reportSource === "sample";
  const noReport = reportSource === "none";
  /* Same query key the workspace context already used — a cache read. */
  const { reports } = useClientReports(demo ? null : clientId);

  const progress = Math.round(
    (checklist.filter((c) => c.done).length / checklist.length) * 100,
  );

  const classifiedItems = useMemo(() => items, [items]);

  const shownBureaus = useMemo(
    () =>
      scores.map((b) => ({
        ...b,
        color: BUREAU_META[b.key]?.color ?? "#64748b",
        gradient: BUREAU_META[b.key]?.gradient ?? "from-slate-500 to-slate-400",
      })),
    [scores],
  );
  const totalGain = shownBureaus.length
    ? shownBureaus.reduce((sum, b) => sum + (b.score - b.first), 0) / shownBureaus.length
    : 0;
  const roundGain = shownBureaus.length
    ? shownBureaus.reduce((sum, b) => sum + (b.score - b.prev), 0) / shownBureaus.length
    : 0;

  /* The journey is every real pull, oldest first. It needs two points to be a
     journey; before that the chart section says so instead of drawing one. */
  const journey = useMemo(() => {
    if (demo) return scoreHistory;
    const byBureau = (r: (typeof reports)[number], bureau: "EQ" | "EX" | "TU") =>
      r.scores.find((sc) => sc.bureau === bureau)?.score ?? null;
    return [...reports]
      .reverse()
      .map((r) => ({
        date: formatDate(r.pulledAt),
        equifax: byBureau(r, "EQ"),
        experian: byBureau(r, "EX"),
        transunion: byBureau(r, "TU"),
      }));
  }, [demo, reports]);

  if (noReport) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <TrendingUp className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            No credit report imported yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Scores, the journey chart and the analysis all come from this
            client&apos;s own imported reports. Import the first one from
            Import &amp; Analysis — nothing here is estimated before that.
          </p>
        </div>
        <LiveRoundSnapshot disputeCount={disputeCount} deletionCount={deletionCount} />
      </div>
    );
  }

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
          {shownBureaus.map((b) => {
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
              {demo
                ? "Tracked across every credit pull since intake · intake → round 5"
                : `Every real pull we hold for this client · ${journey.length} import${journey.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {shownBureaus.map((b) => (
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
        {!demo && journey.length < 2 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            The journey appears after the second import — one pull is a starting point, not a trend.
          </p>
        ) : (
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={journey}
              margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
            >
              <defs>
                {shownBureaus.map((b) => (
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
              {shownBureaus.map((b) => (
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
        )}
      </div>

      {/* FICO Score Potential Analysis — smart logic, human-verified */}
      <ScorePotentialCard items={classifiedItems} />

      {/* Next Best Actions — prioritized repair-vs-build checklist */}
      <NextBestActionCard items={classifiedItems} />

      {/* Per-bureau factor radar charts — the factor analysis behind them is
          the bundled sample's; a live client's factors are not derived yet, so
          in live mode the card would be an invented comparison (rule 12). */}
      {demo && <BureauRadarCharts />}

      {!demo && (
        <LiveRoundSnapshot disputeCount={disputeCount} deletionCount={deletionCount} />
      )}

      {demo && (
      <>
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
      </>
      )}
    </div>
  );
};

/**
 * The live snapshot: the workspace's own derived facts and nothing else.
 * No invented agent, affiliate or totals — and no round, deliberately: the
 * page header already states the client's true round from the client record,
 * and the workspace context's round is a letter-building default, not that
 * fact. One truth, shown once.
 */
const LiveRoundSnapshot = ({
  disputeCount,
  deletionCount,
}: {
  disputeCount: number;
  deletionCount: number;
}) => (
  <div className="rounded-2xl border border-border bg-card p-5">
    <h2 className="text-sm font-semibold">Dispute snapshot</h2>
    <div className="mt-3 grid gap-2.5 text-sm sm:grid-cols-2">
      <div className="flex items-center justify-between sm:block">
        <span className="text-muted-foreground">Items in dispute</span>
        <p className="font-semibold">{disputeCount}</p>
      </div>
      <div className="flex items-center justify-between sm:block">
        <span className="text-muted-foreground">Deletions confirmed</span>
        <p className="font-semibold text-status-success">{deletionCount}</p>
      </div>
    </div>
  </div>
);

export default OverviewTab;
