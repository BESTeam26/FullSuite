import { useState, type ReactNode, type ElementType } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Shared helpers for managed-service division pages                     */
/* ------------------------------------------------------------------ */

export interface DivisionStat {
  label: string;
  value: string | number;
  icon?: ElementType;
  trend?: string;
}

export interface DivisionTab {
  id: string;
  label: string;
  icon?: ElementType;
  render: () => ReactNode;
}

export const StatCard = ({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon?: ElementType;
  trend?: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
    </div>
    <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
    {trend && (
      <p
        className={cn(
          "mt-0.5 text-xs font-medium",
          trend.startsWith("-") ? "text-status-danger" : "text-status-success",
        )}
      >
        {trend}
      </p>
    )}
  </div>
);

export const DivisionTable = ({
  columns,
  rows,
  activeRow,
}: {
  columns: string[];
  rows: (string | number | ReactNode)[][];
  /** Index of the row a deep link points at; highlighted, still readable. */
  activeRow?: number;
}) => (
  <div className="overflow-x-auto rounded-xl border border-border">
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          {columns.map((col) => (
            <th
              key={col}
              className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap"
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row, i) => (
          <tr
            key={i}
            aria-current={activeRow === i ? "true" : undefined}
            className={cn(
              "transition-colors hover:bg-muted/30",
              activeRow === i && "bg-primary/5 shadow-[inset_3px_0_0_0_hsl(var(--primary))]",
            )}
          >
            {row.map((cell, j) => (
              <td
                key={j}
                className="px-4 py-2.5 text-foreground whitespace-nowrap"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ContentCard = ({
  title,
  children,
  action,
}: {
  /** ReactNode so a card can carry an icon or a count beside its name. */
  title: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <div className="rounded-xl border border-border bg-card p-5">
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {action}
    </div>
    {children}
  </div>
);

export const EmptyTab = ({ label }: { label: string }) => (
  <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
    <div className="rounded-xl border border-dashed border-border px-10 py-12">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Configure this section in Agency Settings.
      </p>
    </div>
  </div>
);

export const StatusPill = ({ status }: { status: string }) => {
  const tone: Record<string, string> = {
    Active: "bg-emerald-500/10 text-status-success border-emerald-500/30",
    Healthy: "bg-emerald-500/10 text-status-success border-emerald-500/30",
    Processing: "bg-blue-500/10 text-status-info border-blue-500/30",
    "Ready for QA": "bg-amber-500/10 text-status-warning border-amber-500/30",
    Queued: "bg-slate-500/10 text-muted-foreground border-slate-500/30",
    Completed: "bg-emerald-500/10 text-status-success border-emerald-500/30",
    Blocked: "bg-red-500/10 text-status-danger border-red-500/30",
    Attention: "bg-red-500/10 text-status-danger border-red-500/30",
    "At Risk": "bg-red-500/10 text-status-danger border-red-500/30",
    "Pending Onboarding":
      "bg-amber-500/10 text-status-warning border-amber-500/30",
    Funded: "bg-emerald-500/10 text-status-success border-emerald-500/30",
    Submitted: "bg-blue-500/10 text-status-info border-blue-500/30",
    Offer: "bg-purple-500/10 text-status-accent border-purple-500/30",
    Review: "bg-amber-500/10 text-status-warning border-amber-500/30",
    Draft: "bg-slate-500/10 text-muted-foreground border-slate-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* DivisionLayout — shared shell for all 4 managed-service divisions     */
/* ------------------------------------------------------------------ */

export const DivisionLayout = ({
  title,
  description,
  icon: Icon,
  stats,
  tabs,
}: {
  title: string;
  description: string;
  icon: ElementType;
  stats: DivisionStat[];
  tabs: DivisionTab[];
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const tab = tabs[activeIdx];

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-br from-card to-muted/20 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-6 py-2 backdrop-blur">
        {tabs.map((t, i) => {
          const active = i === activeIdx;
          return (
            <button
              key={t.id}
              onClick={() => setActiveIdx(i)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.icon && <t.icon className="h-3.5 w-3.5" />}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        <div className="mx-auto max-w-6xl">{tab.render()}</div>
      </div>
    </div>
  );
};
