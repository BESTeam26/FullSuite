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
/* Management section                                                  */
/* ------------------------------------------------------------------ */

export interface ManagementView {
  id: string;
  label: string;
  icon: ElementType;
}

/**
 * Cross-partner views. Rendered only for management roles — agents are scoped
 * to their Partner workspace and never see aggregate views (rule 3).
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
        {views.map((v) => {
          const Item = v.icon;
          const active = isActive(v.id);
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary/10 font-bold text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Item className="h-3 w-3" />
              <span>{v.label}</span>
            </button>
          );
        })}
      </div>
    )}
  </div>
);
