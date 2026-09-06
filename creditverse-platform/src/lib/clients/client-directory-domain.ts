/**
 * The client directory — who the organization's customers are.
 *
 * Dee, 2026-09-06: "All Clients answers *who are all of our customers?*
 * CreditOps → Cases answers *who are we currently doing credit repair work
 * for?*  Those are different operational questions."
 *
 * So this module knows nothing about rounds, letters, stages or deals. It
 * reads the canonical `clients` record and the *existence and state* of each
 * service relationship hanging off it, and nothing more. The work itself stays
 * inside the engine that owns it.
 *
 *      CLIENT ── CreditOps  ─ credit case
 *             ├─ FundingOps ─ business ─ funding file ─ deals
 *             └─ DIY Credit ─ enrolment
 *
 * One identity. Many service relationships. Many operational records.
 * Never Client = Credit Client, never Client = Funding Client, never
 * Client = Deal.
 */

export const SERVICE_KEYS = ["creditops", "fundingops", "diy"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  creditops: "CreditOps",
  fundingops: "FundingOps",
  diy: "DIY Credit",
};

/** How a service relationship stands, said the same way for all three. */
export type ServiceState = "active" | "paused" | "archived" | "not-enrolled";

export const SERVICE_STATE_LABELS: Record<ServiceState, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Not active",
  "not-enrolled": "Not enrolled",
};

export interface ClientService {
  service: ServiceKey;
  state: ServiceState;
  /** The engine's own record id — a credit case, a funding client, or null. */
  recordId: string | null;
  /** One short line of context. Never the work itself. */
  detail: string;
  /** Where "Open in …" goes, or null when there is nothing to open yet. */
  href: string | null;
}

export interface ClientBusinessSummary {
  id: string;
  name: string;
  fundingFileCount: number;
}

export interface ClientDirectoryRow {
  id: string;
  publicId: string;
  name: string;
  email: string;
  phone: string | null;
  status: "active" | "paused" | "archived";
  services: ClientService[];
  businesses: ClientBusinessSummary[];
  /** Distinct people assigned across the services, already de-duplicated. */
  assigned: string[];
  lastActivity: string | null;
  createdAt: string;
  needsReview: boolean;
}

/* ─── Deriving service links ──────────────────────────────────────────────── */

/**
 * `lifecycle` on both engine tables is the same enum, so one reading serves
 * both. A row that exists but is archived is still a relationship — it says
 * "we did credit repair for them once", which is different from never having.
 */
export function lifecycleToServiceState(lifecycle: string | null | undefined): ServiceState {
  switch (lifecycle) {
    case "active":
      return "active";
    case "paused":
    case "on_hold":
      return "paused";
    case null:
    case undefined:
      return "not-enrolled";
    default:
      return "archived";
  }
}

export interface ServiceSources {
  creditCase?: { id: string; lifecycle: string | null; round: string | null } | null;
  fundingClient?: {
    id: string;
    lifecycle: string | null;
    businessCount: number;
    fundingFileCount: number;
  } | null;
  diy?: { stage: string | null; roundNumber: number | null } | null;
}

/** Human-readable without pretending to be the work: counts and stage names. */
export function deriveServices(sources: ServiceSources): ClientService[] {
  const services: ClientService[] = [];

  const credit = sources.creditCase;
  services.push({
    service: "creditops",
    state: credit ? lifecycleToServiceState(credit.lifecycle) : "not-enrolled",
    recordId: credit?.id ?? null,
    detail: credit ? (credit.round ? `Round ${credit.round}` : "No round yet") : "Not enrolled",
    href: credit ? `/app/creditops/cases/${credit.id}` : null,
  });

  const funding = sources.fundingClient;
  services.push({
    service: "fundingops",
    state: funding ? lifecycleToServiceState(funding.lifecycle) : "not-enrolled",
    recordId: funding?.id ?? null,
    detail: funding
      ? `${funding.businessCount} business${funding.businessCount === 1 ? "" : "es"} · ${funding.fundingFileCount} funding file${funding.fundingFileCount === 1 ? "" : "s"}`
      : "Not enrolled",
    href: funding ? `/app/funding-clients/${funding.id}` : null,
  });

  const diy = sources.diy;
  services.push({
    service: "diy",
    state: diy ? "active" : "not-enrolled",
    recordId: null,
    detail: diy
      ? `${diy.stage ?? "Enrolled"}${diy.roundNumber ? ` · round ${diy.roundNumber}` : ""}`
      : "Not enrolled",
    href: diy ? "/app/diy" : null,
  });

  return services;
}

/** The services this client actually has, in the order they are displayed. */
export function enrolledServices(row: Pick<ClientDirectoryRow, "services">): ClientService[] {
  return row.services.filter((s) => s.state !== "not-enrolled");
}

/* ─── Filtering and sorting ───────────────────────────────────────────────── */

export type ClientStatusFilter = "active" | "all" | "inactive";
export type BusinessFilter = "any" | "with" | "without";

export interface ClientDirectoryFilters {
  q: string;
  /** Any-of. Empty means every client, whatever they are subscribed to. */
  services: ServiceKey[];
  status: ClientStatusFilter;
  /** A person's display name, matched exactly against the assignment list. */
  assigned: string | null;
  business: BusinessFilter;
  needsReviewOnly: boolean;
}

export const EMPTY_FILTERS: ClientDirectoryFilters = {
  q: "",
  services: [],
  status: "active",
  assigned: null,
  business: "any",
  needsReviewOnly: false,
};

export function matchesFilters(row: ClientDirectoryRow, f: ClientDirectoryFilters): boolean {
  if (f.status === "active" && row.status !== "active") return false;
  if (f.status === "inactive" && row.status === "active") return false;
  if (f.needsReviewOnly && !row.needsReview) return false;

  if (f.services.length > 0) {
    const held = new Set(enrolledServices(row).map((s) => s.service));
    if (!f.services.some((s) => held.has(s))) return false;
  }

  if (f.business === "with" && row.businesses.length === 0) return false;
  if (f.business === "without" && row.businesses.length > 0) return false;

  if (f.assigned && !row.assigned.includes(f.assigned)) return false;

  const q = f.q.trim().toLowerCase();
  if (q) {
    /* Searched fields are identity only — the question this page answers is
       "who", so matching a dispute reason here would be a category error. */
    const haystack = [row.name, row.email, row.phone ?? "", row.publicId, ...row.businesses.map((b) => b.name)]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export type ClientSortKey = "name" | "lastActivity" | "createdAt";

export function sortRows(
  rows: ClientDirectoryRow[],
  key: ClientSortKey,
  direction: "asc" | "desc",
): ClientDirectoryRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * a.name.localeCompare(b.name);
    /* A client with no activity sorts last in either direction rather than
       being treated as the oldest possible date. */
    const av = key === "lastActivity" ? a.lastActivity : a.createdAt;
    const bv = key === "lastActivity" ? b.lastActivity : b.createdAt;
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return sign * (Date.parse(av) - Date.parse(bv));
  });
}

/** Every assignee currently on screen, for the "Assigned" filter's options. */
export function assigneeOptions(rows: ClientDirectoryRow[]): string[] {
  return [...new Set(rows.flatMap((r) => r.assigned))].sort((a, b) => a.localeCompare(b));
}
