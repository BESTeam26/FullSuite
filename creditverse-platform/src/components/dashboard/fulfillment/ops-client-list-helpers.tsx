/**
 * Shared client-list building blocks for every Managed Operations division.
 *
 * CreditOps and FundingOps render the same list UI over different records:
 * same avatars, same mode badges, same column mechanics, same saved view
 * preferences. Only the status vocabulary and a couple of division-specific
 * columns differ.
 *
 * Each division composes its own column order from the shared column defs and
 * binds its own status tones, rather than copying the whole module (rule 13).
 */

import { cn } from "@/lib/utils";
import { RefreshCw, Hand } from "lucide-react";
import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";

/* ------------------------------------------------------------------ */
/* Status pill                                                         */
/* ------------------------------------------------------------------ */

export type StatusToneMap = Record<string, string>;

/**
 * Renders a status chip using the calling division's tone map. Unknown
 * statuses fall back to a neutral chip rather than rendering unstyled.
 */
export const StatusPill = ({
  status,
  tones,
}: {
  status: string;
  tones: StatusToneMap;
}) => (
  <span
    className={cn(
      "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
      tones[status] ?? "bg-muted text-muted-foreground border-border",
    )}
  >
    {status}
  </span>
);

/* ------------------------------------------------------------------ */
/* Intake mode badge                                                   */
/* ------------------------------------------------------------------ */

export const ModeBadge = ({ client }: { client: OpsClient }) =>
  client.mode === "saas_pulled" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
      <RefreshCw className="h-2.5 w-2.5" /> SaaS-Pulled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
      <Hand className="h-2.5 w-2.5" /> Outsourcing
    </span>
  );

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

export const Avatar = ({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "md";
}) => {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const dims = size === "md" ? "h-8 w-8 text-xs" : "h-6 w-6 text-[10px]";
  return (
    <div
      title={`${name} · Agent`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary",
        dims,
      )}
    >
      {initials}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Column definitions                                                  */
/*                                                                     */
/* Generic over the division's column-id union so each division keeps  */
/* exact typing while sharing the shape and the common columns.        */
/* ------------------------------------------------------------------ */

export interface ColDef<Id extends string = string> {
  id: Id;
  label: string;
  defaultOn: boolean;
  minWidth: number;
  defaultWidth: number;
  sortable: boolean;
}

/** Columns every division's client list shows, in their usual order. */
export const CLIENT_COL: ColDef<"client"> = {
  id: "client",
  label: "Client",
  defaultOn: true,
  minWidth: 160,
  defaultWidth: 200,
  sortable: true,
};
export const EMAIL_COL: ColDef<"email"> = {
  id: "email",
  label: "Email",
  defaultOn: true,
  minWidth: 140,
  defaultWidth: 180,
  sortable: true,
};
export const PHONE_COL: ColDef<"phone"> = {
  id: "phone",
  label: "Phone",
  defaultOn: false,
  minWidth: 110,
  defaultWidth: 130,
  sortable: false,
};
export const MODE_COL: ColDef<"mode"> = {
  id: "mode",
  label: "Mode / Source",
  defaultOn: true,
  minWidth: 110,
  defaultWidth: 120,
  sortable: false,
};
export const STATUS_COL: ColDef<"status"> = {
  id: "status",
  label: "Status",
  defaultOn: true,
  minWidth: 130,
  defaultWidth: 150,
  sortable: true,
};
export const AGENT_COL: ColDef<"agent"> = {
  id: "agent",
  label: "Assigned Agent",
  defaultOn: true,
  minWidth: 120,
  defaultWidth: 140,
  sortable: true,
};
export const SLA_COL: ColDef<"sla"> = {
  id: "sla",
  label: "SLA",
  defaultOn: true,
  minWidth: 60,
  defaultWidth: 70,
  sortable: true,
};
export const LAST_ACTIVITY_COL: ColDef<"lastActivity"> = {
  id: "lastActivity",
  label: "Last Activity",
  defaultOn: false,
  minWidth: 100,
  defaultWidth: 120,
  sortable: true,
};

/** Shape used by the narrow numeric columns each division adds. */
export const countColumn = <Id extends string>(
  id: Id,
  label: string,
): ColDef<Id> => ({
  id,
  label,
  defaultOn: true,
  minWidth: 70,
  defaultWidth: 80,
  sortable: true,
});

/** Shape used by the narrow round / amount columns each division adds. */
export const compactColumn = <Id extends string>(
  id: Id,
  label: string,
): ColDef<Id> => ({
  id,
  label,
  defaultOn: true,
  minWidth: 80,
  defaultWidth: 90,
  sortable: true,
});

/* ------------------------------------------------------------------ */
/* Inline-edit validation                                              */
/* ------------------------------------------------------------------ */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[\d\s()+-]{7,}$/;

/* ------------------------------------------------------------------ */
/* Per-user view preferences                                           */
/*                                                                     */
/* Column visibility, widths, sort and list/grid choice persist per     */
/* browser. Each division stores under its own key so the two lists     */
/* keep independent layouts.                                            */
/* ------------------------------------------------------------------ */

export interface ViewPrefs<Id extends string = string> {
  visibleCols: Id[];
  colWidths: Record<string, number>;
  sortField: Id;
  sortDir: "asc" | "desc";
  view: "list" | "grid";
}

export interface ViewPrefsStore<Id extends string> {
  defaults: ViewPrefs<Id>;
  load: () => ViewPrefs<Id>;
  save: (p: ViewPrefs<Id>) => void;
}

/**
 * Build a persisted view-preference store for one division's client list.
 * Storage failures are non-fatal — a user with storage disabled simply gets
 * the default layout every time rather than a broken list.
 */
export function createViewPrefsStore<Id extends string>(
  storageKey: string,
  columns: ColDef<Id>[],
  sortField: Id,
): ViewPrefsStore<Id> {
  const defaults: ViewPrefs<Id> = {
    visibleCols: columns.filter((c) => c.defaultOn).map((c) => c.id),
    colWidths: Object.fromEntries(columns.map((c) => [c.id, c.defaultWidth])),
    sortField,
    sortDir: "asc",
    view: "list",
  };

  return {
    defaults,
    load() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return { ...defaults, ...JSON.parse(raw) };
      } catch {
        /* storage unavailable — fall back to defaults */
      }
      return defaults;
    },
    save(p) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(p));
      } catch {
        /* storage unavailable — preferences simply do not persist */
      }
    },
  };
}
