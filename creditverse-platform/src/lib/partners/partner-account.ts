/**
 * What a BES Partner is, and what can be worked out about one.
 *
 * ── THE CANONICAL DEFINITION (Dee, 2026-09-07) ─────────────────────────────
 *
 *   A BES PARTNER is a company or person with whom BES has a commercial
 *   service relationship.
 *
 * The partner is the ACCOUNT. Anything BES sells them is a SERVICE ENGAGEMENT
 * underneath it. Someone who bought one GHL build and nothing else is a
 * partner. So is an hourly TalentOps arrangement, a monthly retainer, a CRM
 * subscription, and a CreditOps company with five hundred end clients.
 *
 * Every narrower reading is wrong, and this module exists so the narrow
 * reading cannot creep back in through a helper. In particular:
 *
 *   • a partner does NOT need CreditOps, FundingOps, end clients, or a tenant
 *   • LIFECYCLE describes the relationship; STATUS describes one service
 *   • a completed build does not archive the partner
 *   • a cancelled service does not cancel the relationship
 *   • health is a recorded human judgement, never inferred from money
 *
 * Nothing here touches the database or React. It is the rules, so they can be
 * tested (rule 9) and so no screen re-derives them differently (rule 5).
 */

/* ── Lifecycle: the relationship ──────────────────────────────────────── */

export const PARTNER_LIFECYCLES = [
  "new", "onboarding", "active", "on_hold", "suspended", "archived",
] as const;
export type PartnerLifecycle = (typeof PARTNER_LIFECYCLES)[number];

export const LIFECYCLE_LABEL: Record<PartnerLifecycle, string> = {
  new: "New",
  onboarding: "Onboarding",
  active: "Active",
  on_hold: "On hold",
  suspended: "Suspended",
  archived: "Archived",
};

export const LIFECYCLE_TONE: Record<PartnerLifecycle, string> = {
  new: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  onboarding: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  on_hold: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  suspended: "border-amber-600/40 bg-amber-600/10 text-amber-900",
  archived: "border-border bg-muted text-muted-foreground",
};

/** A partner BES is currently in business with. Nothing to do with services. */
export function relationshipIsOpen(lifecycle: PartnerLifecycle): boolean {
  return lifecycle === "new" || lifecycle === "onboarding" || lifecycle === "active";
}

/* ── Health: a judgement somebody made ────────────────────────────────── */

export const PARTNER_HEALTHS = ["happy", "neutral", "concerned", "at_risk"] as const;
export type PartnerHealth = (typeof PARTNER_HEALTHS)[number];

export const HEALTH_LABEL: Record<PartnerHealth, string> = {
  happy: "Happy / satisfied",
  neutral: "Neutral / okay",
  concerned: "Concerned / needs attention",
  at_risk: "Unhappy / at risk",
};

export const HEALTH_TONE: Record<PartnerHealth, string> = {
  happy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  neutral: "border-border bg-muted text-foreground",
  concerned: "border-orange-500/40 bg-orange-500/10 text-orange-800",
  at_risk: "border-red-500/40 bg-red-500/10 text-red-800",
};

/**
 * Whether this partner belongs in the Attention Center.
 *
 * Deliberately a function of the RECORDED judgement alone. Revenue and client
 * count do not decide whether a relationship is in trouble — a quiet, paying
 * partner can be about to leave, and a noisy one can be perfectly happy.
 */
export function healthNeedsAttention(health: PartnerHealth | null): boolean {
  return health === "concerned" || health === "at_risk";
}

/* ── Service engagements ──────────────────────────────────────────────── */

export const SERVICE_STATUSES = [
  "pending", "onboarding", "active", "paused", "completed", "cancelled", "ended",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  pending: "Pending",
  onboarding: "Onboarding",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  ended: "Ended",
};

export const SERVICE_STATUS_TONE: Record<ServiceStatus, string> = {
  pending: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  onboarding: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  paused: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  completed: "border-slate-400/40 bg-slate-500/10 text-slate-700",
  cancelled: "border-border bg-muted text-muted-foreground",
  ended: "border-border bg-muted text-muted-foreground",
};

/** Running now. `pending` is not: it is agreed, not started. */
export function serviceIsLive(status: ServiceStatus): boolean {
  return status === "active" || status === "onboarding";
}

/** Over, but it happened. Kept, counted separately, never deleted. */
export function serviceIsHistorical(status: ServiceStatus): boolean {
  return status === "completed" || status === "cancelled" || status === "ended";
}

export interface ServiceLine {
  id: string;
  name: string;
  serviceType: string | null;
  status: ServiceStatus;
}

export interface ServiceRollup {
  live: number;
  pending: number;
  historical: number;
  /** Service type codes running now — what this partner actually buys today. */
  liveTypes: string[];
}

export function rollUpServices(services: ServiceLine[]): ServiceRollup {
  const liveTypes = new Set<string>();
  let live = 0, pending = 0, historical = 0;
  for (const s of services) {
    if (serviceIsLive(s.status)) {
      live += 1;
      if (s.serviceType) liveTypes.add(s.serviceType);
    } else if (s.status === "pending") pending += 1;
    else if (serviceIsHistorical(s.status)) historical += 1;
  }
  return { live, pending, historical, liveTypes: [...liveTypes].sort() };
}

/**
 * What a partner's lifecycle would be if nobody had recorded one.
 *
 * A SUGGESTION for the interface to offer, never an automatic write. Dee's
 * rule: cancelling one service does not cancel the relationship, and only a
 * person decides a relationship is over. Returns null when the services say
 * nothing that should change anyone's mind.
 */
export function suggestedLifecycle(
  current: PartnerLifecycle,
  roll: ServiceRollup,
): { lifecycle: PartnerLifecycle; because: string } | null {
  if (current === "suspended" || current === "archived") return null;
  if (roll.live > 0 && current !== "active") {
    return { lifecycle: "active", because: `${roll.live} service${roll.live === 1 ? "" : "s"} running` };
  }
  if (roll.live === 0 && roll.pending === 0 && roll.historical > 0 && current === "active") {
    return {
      lifecycle: "on_hold",
      because: "every service has ended — archive only when the relationship really is over",
    };
  }
  return null;
}

/* ── Derived facts ────────────────────────────────────────────────────── */

/**
 * Whole days since the relationship started. Derived, never stored: ClickUp
 * kept this as a formula field and a stored copy would be wrong by tomorrow.
 * Both dates are read as plain calendar days, so a timezone cannot shift the
 * answer by one.
 */
export function daysActive(startedOn: string | null, today: string): number | null {
  if (!startedOn) return null;
  const start = Date.parse(`${startedOn.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round((now - start) / 86_400_000));
}

export function formatDaysActive(days: number | null): string {
  if (days === null) return "Start date not recorded";
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  return `${Math.floor(days / 365.25)} years`;
}

/**
 * How many end clients this partner has, and how confident we are.
 *
 * A partner may legitimately have none — a build client has no clients BES
 * manages. So zero canonical rows is a real answer, not a missing one. The
 * legacy figure typed into a spreadsheet is reported ALONGSIDE, labelled as
 * what it is, and never silently substituted for a count of real records.
 */
export type ClientVolume =
  | { kind: "canonical"; count: number; legacy: string | null }
  | { kind: "legacy_only"; text: string }
  | { kind: "unknown" };

export function clientVolume(
  canonicalCount: number | null,
  legacyText: string | null,
  legacyCount: number | null,
): ClientVolume {
  const legacy = legacyText ?? (legacyCount === null ? null : String(legacyCount));
  if (canonicalCount !== null && canonicalCount > 0) return { kind: "canonical", count: canonicalCount, legacy };
  if (legacy) return { kind: "legacy_only", text: legacy };
  if (canonicalCount !== null) return { kind: "canonical", count: canonicalCount, legacy: null };
  return { kind: "unknown" };
}

/* ── Money, rolled up from the service lines ──────────────────────────── */

export interface BillingLine {
  serviceId: string;
  billingModel: string | null;
  rateCents: number | null;
  expectedMonthlyCents: number | null;
  mrrCents: number | null;
  billingStatus: string | null;
}

export interface FinancialRollup {
  /** Recurring revenue expected in a normal month, from LIVE lines only. */
  monthlyRecurringCents: number;
  /** Non-recurring value agreed on live lines — builds, fixed projects. */
  oneTimeCents: number;
  /** Live lines that carry no financial terms at all. */
  unpriced: number;
  overdue: number;
  invoicePending: number;
}

const RECURRING_MODELS = new Set([
  "RECURRING_WEEKLY", "RECURRING_BIWEEKLY", "RECURRING_MONTHLY",
  "RETAINER", "PER_CLIENT", "PER_ROUND", "PER_AGENT",
]);

/**
 * Partner-level money is DERIVED from the service lines, never stored on the
 * partner. The spreadsheet this replaces put one MRR figure beside the company
 * name, so a partner with three services had one number that matched none of
 * them.
 *
 * Only live lines count. A cancelled retainer contributes nothing to what BES
 * expects this month, and a completed build is not recurring revenue.
 */
export function rollUpFinancials(
  services: ServiceLine[],
  billing: Record<string, BillingLine | undefined>,
): FinancialRollup {
  let monthlyRecurringCents = 0, oneTimeCents = 0, unpriced = 0, overdue = 0, invoicePending = 0;
  for (const s of services) {
    if (!serviceIsLive(s.status)) continue;
    const b = billing[s.id];
    if (!b) { unpriced += 1; continue; }
    if (b.billingStatus === "overdue") overdue += 1;
    if (b.billingStatus === "invoice_pending") invoicePending += 1;

    const recurring = b.billingModel ? RECURRING_MODELS.has(b.billingModel) : false;
    const monthly = b.mrrCents ?? b.expectedMonthlyCents;
    if (recurring && monthly !== null && monthly !== undefined) monthlyRecurringCents += monthly;
    else if (!recurring && b.rateCents !== null && b.rateCents !== undefined) oneTimeCents += b.rateCents;
    else if (monthly === null && b.rateCents === null) unpriced += 1;
  }
  return { monthlyRecurringCents, oneTimeCents, unpriced, overdue, invoicePending };
}
