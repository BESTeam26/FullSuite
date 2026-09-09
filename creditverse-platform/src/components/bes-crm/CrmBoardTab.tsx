import { AlertTriangle, CalendarDays, Flag } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import {
  attentionSummary,
  HEALTH_LABEL,
  healthNeedsUs,
  JOURNEY_LABEL,
  JOURNEY_STAGES,
  journeyIndex,
  type JourneyStage,
  type ProjectHealth,
} from "@/lib/crm/crm-domain";
import type { CrmProjectRow } from "@/lib/data/crm-projects";
import { cn } from "@/lib/utils";

/**
 * Every project on one board — the screen a lead reads first.
 *
 * Each row answers three questions without being opened: where is it
 * (journey), is it fine (health, and if not, why), and how far along
 * (progress). All three arrive computed from `crm_project_board`, so this
 * component contains no judgement — a row cannot say "on track" here and
 * "blocked" in a report, because both read the same function.
 */
export const CrmBoardTab = ({
  projects,
  onOpen,
}: {
  projects: CrmProjectRow[];
  onOpen: (id: string) => void;
}) => (
  <ul className="space-y-2">
    {projects.map((p) => {
      const attention = attentionSummary({
        blocked: p.blocked,
        waitingClient: p.waitingClient,
        inQa: p.inQa,
        overdue: p.overdue,
      });
      return (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(p.id)}
            className={cn(
              "w-full rounded-xl border border-border bg-card p-4 text-left transition-colors",
              "hover:border-primary/40 hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{p.name}</span>
                  <HealthPill health={p.health} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.partnerName}
                  {p.leadName ? <> · led by {p.leadName}</> : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                {p.targetGoLive && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> Go-live {formatDate(p.targetGoLive)}
                  </span>
                )}
                {p.nextMilestone && (
                  <span className="flex items-center gap-1">
                    <Flag className="h-3.5 w-3.5" /> Next: {p.nextMilestone}
                  </span>
                )}
              </div>
            </div>

            <JourneyRail stage={p.journey} className="mt-3" />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <ProgressBar percent={p.progress} className="max-w-56 flex-1" />
              {attention ? (
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    p.blocked > 0 || p.overdue > 0
                      ? "font-medium text-status-warning"
                      : "text-muted-foreground",
                  )}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {attention}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Nothing needs attention</span>
              )}
            </div>
          </button>
        </li>
      );
    })}
  </ul>
);

export const HealthPill = ({ health }: { health: ProjectHealth }) => (
  <span
    className={cn(
      "rounded-full border px-2 py-0.5 text-[10px] font-medium",
      healthNeedsUs(health)
        ? "border-amber-500/30 bg-amber-500/10 text-status-warning"
        : health === "on_track" || health === "support"
          ? "border-emerald-500/30 bg-emerald-500/10 text-status-success"
          : "border-border bg-muted text-muted-foreground",
    )}
  >
    {HEALTH_LABEL[health] ?? health}
  </span>
);

/**
 * The journey as a rail of stages, the current one named.
 *
 * Text plus position, not colour alone — the difference between "building"
 * and "testing" must survive a monochrome print and a colour-blind reader.
 */
export const JourneyRail = ({
  stage,
  className,
}: {
  stage: JourneyStage;
  className?: string;
}) => {
  const at = journeyIndex(stage);
  return (
    <div className={className}>
      <div className="flex items-center gap-1" aria-hidden="true">
        {JOURNEY_STAGES.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < at ? "bg-primary/50" : i === at ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] font-medium text-foreground">
        {JOURNEY_LABEL[stage] ?? stage}
      </p>
    </div>
  );
};

export const ProgressBar = ({
  percent,
  className,
}: {
  percent: number | null;
  className?: string;
}) => (
  <div className={cn("flex items-center gap-2", className)}>
    <div
      className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={percent ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-gold transition-[width] duration-300"
        style={{ width: `${percent ?? 0}%` }}
      />
    </div>
    <span className="w-9 shrink-0 text-right text-xs font-medium text-foreground">
      {percent === null ? "—" : `${percent}%`}
    </span>
  </div>
);
