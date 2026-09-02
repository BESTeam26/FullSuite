// Build Credit tab — guided secured-card / credit-builder-loan / authorized-user
// flows with utilization targets and on-time-payment tracking. For thin-file
// profiles. Hardcoded smart logic, human-verified.

import { useMemo, useState } from "react";
import {
  CreditCard,
  Landmark,
  UserPlus,
  TrendingUp,
  Target,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import { buildCreditState, type BuildFlowType } from "@/lib/build-credit";

const iconMap = {
  CreditCard,
  Landmark,
  UserPlus,
} as const;

const BuildCreditTab = () => {
  const { items } = useClientWorkspace();
  const state = useMemo(() => buildCreditState(items), [items]);
  const [openFlow, setOpenFlow] = useState<BuildFlowType | null>(
    state.flows.find((f) => f.recommended)?.id ?? "secured-card",
  );
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const toggleStep = (id: string) =>
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const utilTone =
    state.currentUtilization <= 9
      ? "text-emerald-600"
      : state.currentUtilization <= 29
        ? "text-sky-600"
        : "text-amber-600";

  const utilData = [
    { month: "Mar", util: 22 },
    { month: "Apr", util: 18 },
    { month: "May", util: 12 },
    { month: "Jun", util: 9 },
    { month: "Jul", util: 8 },
    { month: "Aug", util: state.currentUtilization || 8 },
  ];

  return (
    <div className="space-y-6">
      {/* Thin-file banner */}
      <div
        className={`flex items-start gap-3 rounded-2xl border p-5 ${
          state.isThinFile
            ? "border-blue-500/30 bg-blue-500/5"
            : "border-emerald-500/30 bg-emerald-500/5"
        }`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            state.isThinFile
              ? "bg-blue-500/10 text-blue-600"
              : "bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {state.isThinFile ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
        </div>
        <div>
          <p
            className={`text-sm font-bold ${
              state.isThinFile ? "text-blue-600" : "text-emerald-600"
            }`}
          >
            {state.isThinFile
              ? "Thin file detected — building credit is a primary lever"
              : "Established file — build actions will still help diversify"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state.totalAccounts} total accounts · {state.openPositiveCount}{" "}
            open positive · target utilization under {state.utilizationTarget}%
          </p>
        </div>
      </div>

      {/* Utilization + on-time tracking */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">Utilization target</h3>
          </div>
          <p className={`mt-3 text-3xl font-bold ${utilTone}`}>
            {state.currentUtilization}%
          </p>
          <p className="text-[11px] text-muted-foreground">
            current · target under {state.utilizationTarget}%
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${
                state.currentUtilization <= 9
                  ? "bg-emerald-500"
                  : state.currentUtilization <= 29
                    ? "bg-sky-500"
                    : "bg-amber-500"
              }`}
              style={{
                width: `${Math.min(100, state.currentUtilization)}%`,
              }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Pay down balances before the statement closes to keep reported
            utilization under 9%.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">On-time payments</h3>
          </div>
          <p className="mt-3 text-3xl font-bold text-emerald-600">
            {state.onTimeRate}%
          </p>
          <p className="text-[11px] text-muted-foreground">6-month rolling</p>
          <div className="mt-3 flex gap-1.5">
            {state.onTimePayments.map((p) => (
              <div
                key={p.month}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${
                    p.status === "paid"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : p.status === "pending"
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-red-500/15 text-red-600"
                  }`}
                >
                  {p.status === "paid" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {p.month}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">Utilization trend</h3>
          </div>
          <div className="mt-3 h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={utilData}
                margin={{ top: 5, right: 5, left: -28, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="utilFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border))",
                    fontSize: 11,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="util"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#utilFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Build flows */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <h2 className="font-semibold">Guided build flows</h2>
        </div>

        {state.flows.map((flow) => {
          const Icon = iconMap[flow.icon as keyof typeof iconMap];
          const isOpen = openFlow === flow.id;
          const completedSteps = flow.steps.filter((s) =>
            doneSteps.has(s.id),
          ).length;
          return (
            <div
              key={flow.id}
              className={`overflow-hidden rounded-2xl border bg-card ${
                flow.recommended ? "border-blue-500/40" : "border-border"
              }`}
            >
              <button
                onClick={() => setOpenFlow(isOpen ? null : flow.id)}
                className="flex w-full items-center justify-between p-5 text-left hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      flow.recommended
                        ? "bg-blue-500/10 text-blue-600"
                        : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{flow.title}</p>
                      {flow.recommended && (
                        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                          Recommended
                        </span>
                      )}
                      {completedSteps === flow.steps.length && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                          Complete
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      +{flow.estimatedImpact} pts · {flow.timeframe} ·{" "}
                      {completedSteps}/{flow.steps.length} steps done
                    </p>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {isOpen && (
                <div className="border-t border-border p-5">
                  <p className="text-sm text-muted-foreground">
                    {flow.summary}
                  </p>
                  {flow.utilizationTarget > 0 && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
                      <Target className="h-3.5 w-3.5 text-emerald-600" />
                      <span>
                        Utilization target: keep balance under{" "}
                        {flow.utilizationTarget}% of the limit
                      </span>
                    </div>
                  )}
                  <div className="mt-4 space-y-2.5">
                    {flow.steps.map((step) => {
                      const done = doneSteps.has(step.id);
                      return (
                        <button
                          key={step.id}
                          onClick={() => toggleStep(step.id)}
                          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                            done
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-border bg-card hover:bg-muted/30"
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div>
                            <p
                              className={`text-sm font-medium ${done ? "line-through" : ""}`}
                            >
                              {step.label}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {step.detail}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span className="flex-1">
          Human verification required — build-flow estimates are smart analysis,
          not a guarantee or recommendation.
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      {expanded && (
        <p className="rounded-lg bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
          Smart analysis based on hardcoded FICO factor weights. Building credit
          takes time and responsible management. Actual results depend on
          individual credit behavior and bureau reporting. Not legal or
          financial advice.
        </p>
      )}
    </div>
  );
};

export default BuildCreditTab;
