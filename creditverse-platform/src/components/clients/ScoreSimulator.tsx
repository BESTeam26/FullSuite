// Score Simulator — toggle hypothetical actions and watch the estimate index
// recompute live. Hardcoded smart logic, not a guarantee.

import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCcw,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import { ChartLegend } from "@/components/charts/ChartLegend";
import {
  analyzeScorePotential,
  type ScorePotentialResult,
} from "@/lib/score-potential";
import {
  defaultSimActions,
  simulate,
  type SimAction,
} from "@/lib/score-simulator";

const factorLabels: Record<string, string> = {
  payment: "Payment",
  utilization: "Utilization",
  history: "History",
  mix: "Mix",
  inquiries: "Inquiries",
};

const ScoreSimulator = () => {
  const { items, scores, reportSource } = useClientWorkspace();
  const BUREAU_KEY: Record<string, string> = { EQ: "equifax", EX: "experian", TU: "transunion" };
  const reportedFor = (bureau: string) =>
    scores.find((sc) => sc.key === BUREAU_KEY[bureau] && sc.score > 0);
  const baseline = useMemo<ScorePotentialResult>(
    () => analyzeScorePotential(items),
    [items],
  );
  const [actions, setActions] = useState<SimAction[]>(() =>
    defaultSimActions(items),
  );

  const result = useMemo(
    () => simulate(items, actions, baseline),
    [items, actions, baseline],
  );

  const toggle = (id: string) =>
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    );

  const reset = () =>
    setActions((prev) => prev.map((a) => ({ ...a, enabled: false })));

  const delta = result.delta;
  const radarData = [
    "payment",
    "utilization",
    "history",
    "mix",
    "inquiries",
  ].map((key) => {
    const base = baseline.bureaus[0].factors.find((f) => f.key === key)!;
    const sim = result.analysis.bureaus[0].factors.find((f) => f.key === key)!;
    return {
      factor: factorLabels[key],
      Current: base.current,
      Simulated: sim.current,
    };
  });

  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaTone =
    delta > 0
      ? "text-status-success"
      : delta < 0
        ? "text-status-danger"
        : "text-muted-foreground";

  /* No report, no analysis: an empty item list is not a profile, and the
     engine's output for it would be a number about nobody (rule 12). */
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        <p className="font-semibold">No credit report to analyse.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {reportSource === "none"
            ? "Import this client's credit report first; the factor analysis and what-if guide run only on their own report."
            : "Nothing to analyse yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-blue-500/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-status-info" />
              <h2 className="font-semibold">Score Simulator</h2>
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-info">
                What-if
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Toggle hypothetical actions and watch the factor analysis
              recompute. The index is an internal estimate built from FICO's
              published factor weights — not a FICO score, not a prediction,
              not a guarantee.
            </p>
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/30"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>

        {/* Live ceiling readout */}
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Baseline estimate index
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {baseline.averageCeiling}
            </p>
            <p className="text-[11px] text-muted-foreground">current profile</p>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Simulated estimate index
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-status-info">
              {result.analysis.averageCeiling}
            </p>
            <p className="text-[11px] text-muted-foreground">
              with selected actions
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Estimated change
            </p>
            <p
              className={`mt-1 flex items-center gap-1.5 text-3xl font-bold tracking-tight ${deltaTone}`}
            >
              <DeltaIcon className="h-6 w-6" />
              {delta > 0 ? "+" : ""}
              {delta}
            </p>
            <p className="text-[11px] text-muted-foreground">
              points vs baseline
            </p>
          </div>
        </div>

        {/* Per-bureau simulated scores */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {result.analysis.bureaus.map((b, i) => (
            <div
              key={b.bureau}
              className="rounded-lg border border-border bg-muted/30 p-3 text-center"
            >
              <p className="text-[11px] font-medium text-muted-foreground">
                {b.label}
              </p>
              {reportedFor(b.bureau) ? (
                <p className="text-lg font-bold text-foreground">
                  {reportedFor(b.bureau)!.score}
                  <span className="block text-[10px] font-medium text-muted-foreground">reported score</span>
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">no reported score on file</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                index {b.currentEstimate} → {b.ceilingEstimate}
              </p>
              <p className="text-[10px] text-status-success">
                +{b.ceilingEstimate - baseline.bureaus[i].ceilingEstimate}{" "}
                index
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Action toggles */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-status-info" /> Hypothetical
            actions
          </h3>
          <div className="mt-4 space-y-2.5">
            {actions.map((a) => (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  a.enabled
                    ? "border-blue-500/40 bg-blue-500/5"
                    : "border-border bg-card hover:bg-muted/30"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                    a.enabled
                      ? "border-blue-500 bg-blue-500 text-white"
                      : "border-border"
                  }`}
                >
                  {a.enabled && (
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M3 8l3 3 7-7" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.detail}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Radar comparison */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-status-info" /> Factor
            impact comparison
          </h3>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="factor"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                />
                <Radar
                  name="Current"
                  dataKey="Current"
                  stroke="#64748b"
                  fill="#64748b"
                  fillOpacity={0.15}
                />
                <Radar
                  name="Simulated"
                  dataKey="Simulated"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
                <ChartLegend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
        <p>{baseline.disclaimer}</p>
      </div>
    </div>
  );
};

export default ScoreSimulator;
