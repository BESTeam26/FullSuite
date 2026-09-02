import { useMemo, useState } from "react";
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
    tone: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  BUILD: {
    icon: Building2,
    label: "BUILD FIRST",
    tone: "text-blue-600",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  BALANCED: {
    icon: Scale,
    label: "BALANCED APPROACH",
    tone: "text-emerald-600",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
} as const;

const factorStatusTone: Record<string, string> = {
  excellent: "text-emerald-600 bg-emerald-500/10",
  good: "text-sky-600 bg-sky-500/10",
  fair: "text-amber-600 bg-amber-500/10",
  poor: "text-red-600 bg-red-500/10",
};

const ScorePotentialCard = ({ items }: { items: ClassifiedItem[] }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeBureau, setActiveBureau] = useState<"EQ" | "EX" | "TU">("EQ");

  const analysis = useMemo(() => analyzeScorePotential(items), [items]);
  const active = analysis.bureaus.find((b) => b.bureau === activeBureau)!;
  const lever = leverConfig[analysis.assessment.primaryLever];
  const LeverIcon = lever.icon;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-blue-500/5 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold">FICO Score Potential Analysis</h2>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
              Smart Logic
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Hardcoded FICO factor weights · estimates the realistic ceiling &
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
            Estimated Current
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {analysis.averageCurrent}
          </p>
          <p className="text-[11px] text-muted-foreground">3-bureau average</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Achievable Ceiling
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-emerald-600">
            {analysis.averageCeiling}
          </p>
          <p className="text-[11px] text-muted-foreground">
            if inaccuracies corrected & utilization optimized
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Potential Gain
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-sky-600">
            +{analysis.averageGap}
          </p>
          <p className="text-[11px] text-muted-foreground">points headroom</p>
        </div>
      </div>

      {/* Bureau toggle */}
      <div className="mt-5 flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/30 p-1">
        {analysis.bureaus.map((b) => (
          <button
            key={b.bureau}
            onClick={() => setActiveBureau(b.bureau)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeBureau === b.bureau
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {b.label}
            <span className="ml-2 text-xs text-muted-foreground">
              {b.currentEstimate} → {b.ceilingEstimate}
            </span>
          </button>
        ))}
      </div>

      {/* Factor breakdown for active bureau */}
      <div className="mt-4 space-y-3">
        {active.factors.map((f) => (
          <div
            key={f.key}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {Math.round(f.weight * 100)}%
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${factorStatusTone[f.status]}`}
              >
                {f.status}
              </span>
            </div>

            {/* Dual bar: current vs ceiling */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] font-medium text-muted-foreground">
                  Current
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-500 shadow-sm transition-all duration-500"
                    style={{ width: `${Math.max(5, f.current)}%` }}
                  />
                </div>
                <span className="w-14 text-right text-xs font-bold text-blue-600 dark:text-blue-400">
                  +{f.currentPoints} pts
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] font-medium text-muted-foreground">
                  Ceiling
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 shadow-sm transition-all duration-500"
                    style={{ width: `${Math.max(5, f.ceiling)}%` }}
                  />
                </div>
                <span className="w-14 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  +{f.ceilingPoints} pts
                </span>
              </div>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {f.note}
            </p>
          </div>
        ))}
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
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span className="flex-1">
          Human verification required — this is smart analysis, not a guarantee
          or recommendation.
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
