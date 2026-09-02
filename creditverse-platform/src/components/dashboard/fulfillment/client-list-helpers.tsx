/**
 * Shared helpers for the Main Client List: status pills, mode badges, avatars,
 * column definitions, and per-user view preferences.
 */

import { cn } from "@/lib/utils";
import { RefreshCw, Hand } from "lucide-react";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";

/* Status pill */
const FULFILLMENT_STATUS_TONE: Record<string, string> = {
  Onboarding: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "Ready for Processing": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "In Processing": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "Ready for QA": "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "In Dispute": "bg-purple-500/10 text-purple-700 border-purple-500/30",
  "Awaiting Response": "bg-slate-500/10 text-slate-700 border-slate-500/30",
  "Monitoring Issue": "bg-red-500/10 text-red-700 border-red-500/30",
  Completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  Attention: "bg-red-500/10 text-red-700 border-red-500/30",
};

export const FulfillmentStatusPill = ({ status }: { status: string }) => (
  <span
    className={cn(
      "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
      FULFILLMENT_STATUS_TONE[status] ??
        "bg-muted text-muted-foreground border-border",
    )}
  >
    {status}
  </span>
);

export const ModeBadge = ({ client }: { client: FulfillmentClient }) =>
  client.mode === "saas_pulled" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
      <RefreshCw className="h-2.5 w-2.5" /> SaaS-Pulled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
      <Hand className="h-2.5 w-2.5" /> Outsourcing
    </span>
  );

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

/* Column definitions */
export type ColId =
  | "client"
  | "email"
  | "phone"
  | "mode"
  | "round"
  | "status"
  | "agent"
  | "openItems"
  | "sla"
  | "lastActivity";

export interface ColDef {
  id: ColId;
  label: string;
  defaultOn: boolean;
  minWidth: number;
  defaultWidth: number;
  sortable: boolean;
}

export const COLUMN_DEFS: ColDef[] = [
  {
    id: "client",
    label: "Client",
    defaultOn: true,
    minWidth: 160,
    defaultWidth: 200,
    sortable: true,
  },
  {
    id: "email",
    label: "Email",
    defaultOn: true,
    minWidth: 140,
    defaultWidth: 180,
    sortable: true,
  },
  {
    id: "phone",
    label: "Phone",
    defaultOn: false,
    minWidth: 110,
    defaultWidth: 130,
    sortable: false,
  },
  {
    id: "mode",
    label: "Mode / Source",
    defaultOn: true,
    minWidth: 110,
    defaultWidth: 120,
    sortable: false,
  },
  {
    id: "round",
    label: "Round",
    defaultOn: true,
    minWidth: 80,
    defaultWidth: 90,
    sortable: true,
  },
  {
    id: "status",
    label: "Status",
    defaultOn: true,
    minWidth: 130,
    defaultWidth: 150,
    sortable: true,
  },
  {
    id: "agent",
    label: "Assigned Agent",
    defaultOn: true,
    minWidth: 120,
    defaultWidth: 140,
    sortable: true,
  },
  {
    id: "openItems",
    label: "Open Items",
    defaultOn: true,
    minWidth: 70,
    defaultWidth: 80,
    sortable: true,
  },
  {
    id: "sla",
    label: "SLA",
    defaultOn: true,
    minWidth: 60,
    defaultWidth: 70,
    sortable: true,
  },
  {
    id: "lastActivity",
    label: "Last Activity",
    defaultOn: false,
    minWidth: 100,
    defaultWidth: 120,
    sortable: true,
  },
];

export const ALL_STATUS_OPTIONS = [
  "Onboarding",
  "Ready for Processing",
  "In Processing",
  "Ready for QA",
  "In Dispute",
  "Awaiting Response",
  "Monitoring Issue",
  "Attention",
  "Completed",
];

export const STATUS_OPTIONS = ["All Statuses", ...ALL_STATUS_OPTIONS];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[\d\s()+-]{7,}$/;

/* Per-user view preferences */
const PREF_KEY = "creditops-clientlist-prefs";

export interface ViewPrefs {
  visibleCols: ColId[];
  colWidths: Record<string, number>;
  sortField: ColId;
  sortDir: "asc" | "desc";
  view: "list" | "grid";
}

export const defaultPrefs: ViewPrefs = {
  visibleCols: COLUMN_DEFS.filter((c) => c.defaultOn).map((c) => c.id),
  colWidths: Object.fromEntries(COLUMN_DEFS.map((c) => [c.id, c.defaultWidth])),
  sortField: "client",
  sortDir: "asc",
  view: "list",
};

export function loadPrefs(): ViewPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { ...defaultPrefs, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultPrefs;
}

export function savePrefs(p: ViewPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
