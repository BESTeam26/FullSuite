// Next Best Action card — prioritized repair-vs-build checklist with estimated
// point impact. Hardcoded smart logic, human-verified, not a recommendation.

import { useMemo, useState } from "react";
import {
  Zap,
  Wrench,
  Building2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { buildNextBestActions } from "@/lib/next-best-actions";
import type { ClassifiedItem } from "@/lib/credit-classification";

const categoryConfig = {
  REPAIR: {
    icon: Wrench,
    label: "Repair",
    tone: "text-status-warning",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  BUILD: {
    icon: Building2,
    label: "Build",
    tone: "text-status-info",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  MAINTAIN: {
    icon: ShieldCheck,
    label: "Maintain",
    tone: "text-status-success",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
} as const;

const timeframeTone: Record<string, string> = {
  Immediate: "bg-emerald-500/10 text-status-success",
  "1-2 cycles": "bg-sky-500/10 text-sky-600",
  "3-6 months": "bg-amber-500/10 text-status-warning",
  "Long-term": "bg-muted text-muted-foreground",
};

const NextBestActionCard = ({ items }: { items: ClassifiedItem[] }) => {
  const [expanded, setExpanded] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const { actions, analysis } = useMemo(
    () => buildNextBestActions(items),
    [items],
  );

  const toggle = (id: string) =>
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalImpact = actions
    .filter((a) => !doneIds.has(a.id))
    .reduce((s, a) => s + a.impact, 0);
  const completedImpact = actions
    .filter((a) => doneIds.has(a.id))
    .reduce((s, a) => s + a.impact, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-emerald-500/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-status-success" />
            <h2 className="font-semibold">Next Best Actions</h2>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-success">
              Smart Logic
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Prioritized repair-vs-build checklist with estimated point impact —
            smart analysis, not a guarantee.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-status-success">
            +{totalImpact}
          </p>
          <p className="text-[11px] text-muted-foreground">
            potential pts remaining
          </p>
        </div>
      </div>

      {/* Lever summary */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {(["REPAIR", "BUILD", "MAINTAIN"] as const).map((cat) => {
          const cfg = categoryConfig[cat];
          const Icon = cfg.icon;
          const count = actions.filter((a) => a.category === cat).length;
          const catImpact = actions
            .filter((a) => a.category === cat && !doneIds.has(a.id))
            .reduce((s, a) => s + a.impact, 0);
          return (
            <div
              key={cat}
              className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${cfg.tone}`} />
                <span className={`text-xs font-semibold ${cfg.tone}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="mt-1 text-lg font-bold">{count}</p>
              <p className="text-[10px] text-muted-foreground">
                +{catImpact} pts
              </p>
            </div>
          );
        })}
      </div>

      {/* Action checklist */}
      <div className="mt-4 space-y-2.5">
        {actions.map((action) => {
          const cfg = categoryConfig[action.category];
          const Icon = cfg.icon;
          const done = doneIds.has(action.id);
          return (
            <button
              key={action.id}
              onClick={() => toggle(action.id)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                done
                  ? "border-emerald-500/30 bg-emerald-500/5 opacity-60"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg} ${cfg.tone}`}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={`text-sm font-medium ${done ? "line-through" : ""}`}
                  >
                    {action.title}
                  </p>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-status-success">
                      +{action.impact} pts
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${timeframeTone[action.timeframe]}`}
                    >
                      <Clock className="mr-1 inline h-2.5 w-2.5" />
                      {action.timeframe}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {action.detail}
                </p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {action.factor}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {completedImpact > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
          <span className="text-muted-foreground">
            {doneIds.size} action(s) marked complete · +{completedImpact} pts
            accounted for
          </span>
        </div>
      )}

      {/* Disclaimer */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="mt-4 flex w-full items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-status-success" />
        <span className="flex-1">
          Human verification required — estimates are smart analysis, not a
          guarantee or recommendation.
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      {expanded && (
        <p className="mt-2 rounded-lg bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {analysis.disclaimer}
        </p>
      )}
    </div>
  );
};

export default NextBestActionCard;
