/**
 * Shared helpers for the FundingOps Main Client List: status pills, mode
 * badges, avatars, column definitions, and per-user view preferences.
 *
 * Mirrors client-list-helpers.tsx but uses the funding-domain statuses and
 * columns (openFiles / totalRequested instead of round / openItems).
 */

import { cn } from "@/lib/utils";
import { RefreshCw, Hand } from "lucide-react";
import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import { FUNDING_STATUS_TONE } from "@/lib/fulfillment/fundingops-domain";

/* Status pill */
export const FundingStatusPill = ({ status }: { status: string }) => (
  <span
    className={cn(
      "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
      FUNDING_STATUS_TONE[status] ??
        "bg-muted text-muted-foreground border-border",
    )}
  >
    {status}
  </span>
);

export const FundingModeBadge = ({ client }: { client: FundingClient }) =>
  client.mode === "saas_pulled" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
      <RefreshCw className="h-2.5 w-2.5" /> SaaS-Pulled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
      <Hand className="h-2.5 w-2.5" /> Outsourcing
    </span>
  );

export const FundingAvatar = ({
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
export type FundingColId =
  | "client"
  | "email"
  | "phone"
  | "mode"
  | "status"
  | "agent"
  | "openFiles"
  | "requested"
  | "sla"
  | "lastActivity";

export interface FundingColDef {
  id: FundingColId;
  label: string;
  defaultOn: boolean;
  minWidth: number;
  defaultWidth: number;
  sortable: boolean;
}

export const FUNDING_COLUMN_DEFS: FundingColDef[] = [
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
    id: "openFiles",
    label: "Open Files",
    defaultOn: true,
    minWidth: 70,
    defaultWidth: 80,
    sortable: true,
  },
  {
    id: "requested",
    label: "Requested",
    defaultOn: true,
    minWidth: 80,
    defaultWidth: 90,
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

export const FUNDING_STATUS_OPTIONS = [
  "All Statuses",
  "Onboarding",
  "Readiness Review",
  "Document Review",
  "Lender Matching",
  "Submitted",
  "Stipulations",
  "Offer Received",
  "Funded",
  "Declined",
  "Withdrawn",
  "Archived",
];

export const FUNDING_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const FUNDING_PHONE_RE = /^[\d\s()+-]{7,}$/;

/* Per-user view preferences */
const PREF_KEY = "fundingops-clientlist-prefs";

export interface FundingViewPrefs {
  visibleCols: FundingColId[];
  colWidths: Record<string, number>;
  sortField: FundingColId;
  sortDir: "asc" | "desc";
  view: "list" | "grid";
}

export const defaultFundingPrefs: FundingViewPrefs = {
  visibleCols: FUNDING_COLUMN_DEFS.filter((c) => c.defaultOn).map((c) => c.id),
  colWidths: Object.fromEntries(
    FUNDING_COLUMN_DEFS.map((c) => [c.id, c.defaultWidth]),
  ),
  sortField: "client",
  sortDir: "asc",
  view: "list",
};

export function loadFundingPrefs(): FundingViewPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { ...defaultFundingPrefs, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultFundingPrefs;
}

export function saveFundingPrefs(p: FundingViewPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
