/**
 * Shared building blocks for the division tree sidebars.
 *
 * CreditOps and FundingOps present different trees — CreditOps stops at the
 * Partner, FundingOps drills Partner → Client → Deal — so their tree bodies are
 * deliberately NOT shared; forcing one component would be a worse abstraction
 * than the duplication (rule 13).
 *
 * What they genuinely share is the chrome: the collapsible folder and the
 * Management section. Those live here.
 *
 * The space HEADER used to live here too. It moved to `ModuleRail`, which owns
 * the whole shell — widths, the collapse toggle, the remembered preference and
 * the mobile drawer — so that no module can grow its own collapse behaviour
 * (Dee, 2026-09-07 §1).
 */

import type { ElementType, ReactNode } from "react";
import { ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Collapsible folder                                                  */
/* ------------------------------------------------------------------ */

export const OpsTreeFolder = ({
  label,
  icon: Icon = FolderOpen,
  accent = "text-muted-foreground",
  count,
  /** Rendered instead of the plain count, e.g. the Management "ALL" pill. */
  countBadge,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon?: ElementType;
  accent?: string;
  count?: number;
  countBadge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <div>
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 font-semibold text-foreground hover:bg-muted"
    >
      <div className="flex items-center gap-2">
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className={cn("h-3.5 w-3.5", accent)} />
        <span className="text-xs">{label}</span>
      </div>
      {countBadge ?? (
        <span className="text-[10px] font-semibold text-muted-foreground">
          {count}
        </span>
      )}
    </button>
    {open && (
      <div className="ml-4 mt-1 space-y-1 border-l border-border pl-2">
        {children}
      </div>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Navigation items and groups                                         */
/*                                                                     */
/* The second pane's own vocabulary, replacing the single MANAGEMENT   */
/* folder that used to hold every cross-partner view. Dee, 2026-09-11: */
/* the pane keeps its hierarchy, but what sits in it follows the       */
/* person — the shared workspace, then their department queues, then   */
/* the partner folders, then management tooling.                       */
/* ------------------------------------------------------------------ */

export interface ManagementView {
  id: string;
  label: string;
  icon: ElementType;
}

/** One destination in the pane. */
export const OpsTreeNavItem = ({
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  label: string;
  icon: ElementType;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    onClick={onSelect}
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-primary/10 font-bold text-primary"
        : "text-foreground hover:bg-muted/60",
    )}
  >
    <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
    <span className="truncate">{label}</span>
  </button>
);

/** A labelled band of destinations — MY DEPARTMENT, MANAGEMENT. */
export const OpsTreeGroup = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="pt-2">
    <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <div className="space-y-0.5">{children}</div>
  </div>
);

/**
 * The single collapsible MANAGEMENT folder holding every cross-partner view.
 *
 * CreditOps no longer uses this: its pane is grouped per person by
 * `creditOpsNavForPerson` (Dee's consolidation, 2026-09-11). FundingOps still
 * does, and is deliberately untouched — that brief was about CreditOps, and
 * changing FundingOps navigation on the way past would be scope Dee did not
 * ask for. It moves when FundingOps gets the same treatment.
 */
export const OpsTreeManagementSection = ({
  views,
  open,
  onToggle,
  isActive,
  onSelect,
  icon: Icon,
}: {
  views: readonly ManagementView[];
  open: boolean;
  onToggle: () => void;
  isActive: (viewId: string) => boolean;
  onSelect: (viewId: string) => void;
  icon: ElementType;
}) => (
  <div>
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 font-semibold text-foreground hover:bg-muted"
    >
      <div className="flex items-center gap-2">
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs">MANAGEMENT</span>
      </div>
      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
        ALL
      </span>
    </button>
    {open && (
      <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2">
        {views.map((v) => (
          <OpsTreeNavItem
            key={v.id}
            label={v.label}
            icon={v.icon}
            active={isActive(v.id)}
            onSelect={() => onSelect(v.id)}
          />
        ))}
      </div>
    )}
  </div>
);
