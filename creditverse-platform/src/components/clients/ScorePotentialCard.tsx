import { useMemo, useState } from "react";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import {
  TrendingUp,
  Wrench,
  Building2,
  Scale,
  Info,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import { analyzeScorePotential } from "@/lib/score-potential";
import type { ClassifiedItem } from "@/lib/credit-classification";

const leverConfig = {
  REPAIR: {
    icon: Wrench,
    label: "REPAIR FIRST",
    tone: "text-status-warning",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  BUILD: {
    icon: Building2,
    label: "BUILD FIRST",
    tone: "text-status-info",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  BALANCED: {
    icon: Scale,
    label: "BALANCED APPROACH",
    tone: "text-status-success",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
} as const;

const factorStatusTone: Record<string, string> = {
  excellent: "text-status-success bg-emerald-500/10",
  good: "text-sky-600 bg-sky-500/10",
  fair: "text-status-warning bg-amber-500/10",
  poor: "text-status-danger bg-red-500/10",
};

const BUREAU_KEY: Record<"EQ" | "EX" | "TU", "equifax" | "experian" | "transunion"> = {
  EQ: "equifax",
  EX: "experian",
  TU: "transunion",
};

/**
 * Three bureau columns side by side — never a toggle. Each column shows the
 * bureau's REPORTED score when a report states one, then the engine's internal
 * estimate index (current → achievable) and its factor breakdown. The index is
 * built from FICO's published factor weights; it is not a FICO score.
 */
const ScorePotentialCard = ({ items }: { items: ClassifiedItem[] }) => {
  const [expanded, setExpanded] = useState(false);
  const { scores } = useClientWorkspace();
  const reportedFor = (bureau: "EQ" | "EX" | "TU") =>
    scores.find((sc) => sc.key === BUREAU_KEY[bureau] && sc.score > 0)?.score ?? null;

  const analysis = useMemo(() => analyzeScorePotential(items), [items]);
  const lever = leverConfig[analysis.assessment.primaryLever];
  const LeverIcon = lever.icon;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-blue-500/5 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-status-info" />
            <h2 className="font-semibold">Score Potential Analysis</h2>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-info">
              Smart Logic
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Deterministic analysis on this report using FICO's published factor
            weights · an internal estimate index, not a FICO score · shows the
            repair-vs-build lever
          </p>
        </div>
      </div>

      {/* Primary lever banner */}
      <div
        className={`mt-4 flex items-start gap-3 rounded-xl border ${lever.border} ${lever.bg} p-4`}
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${lever.bg} ${lever.tone}`}
        >
          <LeverIcon className="h-5 w-5" />
        </div>
        <div>
          <p className={`text-sm font-bold ${lever.tone}`}>{lever.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {analysis.assessment.leverReason}
          </p>
        </div>
      </div>

      {/* Average summary */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Estimate index · current
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {analysis.averageCurrent}
          </p>
          <p className="text-[11px] text-muted-foreground">3-bureau average of the index — not a score</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Estimate index · achievable
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-status-success">
            {analysis.averageCeiling}
          </p>
          <p className="text-[11px] text-muted-foreground">
            if inaccuracies corrected & utilization optimized
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Index headroom
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-sky-600">
            +{analysis.averageGap}
          </p>
          <p className="text-[11px] text-muted-foreground">index points, not score points</p>
        </div>
      </div>

      {/* Three bureaus side by side — one column each, all factors visible */}
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {analysis.bureaus.map((b) => {
          const reported = reportedFor(b.bureau);
          return (
            <div key={b.bureau} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
                <div>
                  <p className="text-sm font-bold text-foreground">{b.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    index {b.currentEstimate} → {b.ceilingEstimate}
                  </p>
                </div>
                <div className="text-right">
                  {reported !== null ? (
                    <>
                      <p className="text-xl font-black text-foreground">{reported}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">reported score</p>
                    </>
                  ) : (
                    <p className="max-w-[7rem] text-[10px] text-muted-foreground">no reported score on file</p>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {b.factors.map((f) => (
                  <div key={f.key} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-foreground">{f.label}</span>
                        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                          {Math.round(f.weight * 100)}%
                        </span>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${factorStatusTone[f.status]}`}>
                        {f.status}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-12 text-[10px] font-medium text-muted-foreground">Current</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.max(5, f.current)}%` }} />
                        </div>
                        <span className="w-12 text-right text-[11px] font-bold text-status-info">+{f.currentPoints}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-12 text-[10px] font-medium text-muted-foreground">Ceiling</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.max(5, f.ceiling)}%` }} />
                        </div>
                        <span className="w-12 text-right text-[11px] font-bold text-status-success">+{f.ceilingPoints}</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{f.note}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Profile snapshot */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Open positive",
            value: analysis.assessment.openPositiveCount,
          },
          { label: "Derogatory", value: analysis.assessment.derogatoryCount },
          { label: "Total accounts", value: analysis.assessment.totalAccounts },
          {
            label: "Oldest acct",
            value: `${analysis.assessment.oldestAccountYears.toFixed(1)}y`,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-border bg-muted/30 p-3"
          >
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Human verification + disclaimer */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="mt-4 flex w-full items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-status-success" />
        <span className="flex-1">
          Human verification required — an internal estimate index built from
          published factor weights; not a FICO score, not a guarantee, not a
          recommendation.
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{analysis.disclaimer}</p>
        </div>
      )}
    </div>
  );
};

export default ScorePotentialCard;
