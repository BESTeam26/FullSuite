/**
 * Shared Managed-Operations client domain.
 *
 * CreditOps and FundingOps are two divisions of the same fulfillment business.
 * They intake clients the same way, group them the same way, and enforce the
 * same identity rule — only the operational vocabulary differs (dispute rounds
 * and items vs funding files and amounts).
 *
 * This module owns everything the two divisions genuinely share. It previously
 * existed as two byte-identical copies in `fulfillment-client-domain.ts` and
 * `fundingops-domain.ts`, which meant a fix to the duplicate-client rule had to
 * be made twice or the divisions would silently diverge (rules 2 and 13).
 *
 * Division-specific values — status vocabularies, mode LABELS, provenance —
 * deliberately stay in the division modules. "SaaS-Pulled" in CreditOps reads
 * as "SaaS Synced" in FundingOps, and that difference is intentional.
 */

/* ------------------------------------------------------------------ */
/* Intake mode — the two ways work reaches a division                  */
/* ------------------------------------------------------------------ */

/**
 * MODE 1 — saas_pulled: the client runs on the BES system; their record and
 *   status sync from actions inside their organization.
 * MODE 2 — outsourcing_only: the client has their own external system; BES
 *   keeps a manual list under an outsourcing group and updates it by hand.
 */
export type OpsIntakeMode = "saas_pulled" | "outsourcing_only";

/* ------------------------------------------------------------------ */
/* Outsourcing group — groups outsourcing-only clients by contract     */
/* ------------------------------------------------------------------ */

export interface OutsourcingGroup {
  id: string;
  name: string;
  /** The external company / partner sending the work. */
  partnerName: string;
  contactEmail: string;
  contractRef?: string;
  clientCount: number;
  /**
   * Lifecycle. `Suspended` stops portal access without touching a record;
   * `Archived` drops the partner out of active views and keeps every trace of
   * them. Neither is a delete — a partner with history is never destroyed.
   */
  status: "Active" | "Paused" | "Onboarding" | "Suspended" | "Archived";
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Partner — a company whose work a division fulfils                   */
/*                                                                     */
/* Both divisions describe partners identically; only the group and    */
/* mode vocabularies differ, which each division narrows.              */
/* ------------------------------------------------------------------ */

export interface OpsPartner {
  id: string;
  name: string;
  /** Division-specific grouping, e.g. managed / outsourcing / users. */
  group: string;
  /** Organization id, or outsourcing group id for outsourced partners. */
  scopeId: string;
  /** Division-specific operational mode. */
  mode: string;
  contactName?: string;
  contactEmail?: string;
  /** Contract reference for outsourcing partners. */
  contractRef?: string;
  /** The live engagement this row represents, and where it is filed. Set for
   *  live records; absent on the demo fixtures, which have no engagements. */
  engagementId?: string;
  operationalCategoryId?: string | null;
  /** `manual` once BES has deliberately moved it (0304). */
  categorySource?: "auto" | "manual";
  /**
   * Lifecycle. `Suspended` stops portal access without touching a record;
   * `Archived` drops the partner out of active views and keeps every trace of
   * them. Neither is a delete — a partner with history is never destroyed.
   */
  status: "Active" | "Paused" | "Onboarding" | "Suspended" | "Archived";
}

/* ------------------------------------------------------------------ */
/* The client record shared by every division                          */
/* ------------------------------------------------------------------ */

/**
 * Fields every managed-operations client has, whichever division works it.
 *
 * `status` is a plain string here because each division owns its own status
 * vocabulary; division interfaces narrow it to their own union type.
 */
/**
 * The canonical order for partner names in a navigation folder: A → Z.
 *
 * Dee, 2026-09-11: *"Inside EACH folder, Partner names should always be
 * alphabetized… Do not preserve manual row order for Partners… Do not add a
 * separate manual sort control."*
 *
 * Case-insensitive and accent-insensitive, so "bearwithUs" files where a
 * reader expects it rather than after every capitalised name — the default
 * `localeCompare` on raw strings does not guarantee that across locales.
 * Numbers inside names sort naturally ("Round 2" before "Round 10").
 *
 * The tie-break is the canonical id, never the created date: two partners can
 * share a name AND a creation second, and an unstable sort makes rows jump
 * between renders. The id is unique by construction.
 *
 * It is a comparator rather than a sorted list because the ordering has to
 * hold after a drag, a category change, a rename, a new partner and a
 * reactivation — and the only way to guarantee that is to sort at the point
 * of render from whatever the data currently says, not to maintain an order.
 */
const PARTNER_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

export function comparePartnersByName(
  a: { name: string; id: string },
  b: { name: string; id: string },
): number {
  const byName = PARTNER_COLLATOR.compare(a.name.trim(), b.name.trim());
  return byName !== 0 ? byName : a.id.localeCompare(b.id);
}

/**
 * Who a file is assigned to, passed as an identity rather than a label.
 *
 * `id` is the profile row that is actually written; `name` is what the
 * interface showed and what the activity entry reads back. `id: null` is the
 * honest "Unassigned" — an absence, not a person called Unassigned.
 */
export interface AssignedPerson {
  id: string | null;
  name: string;
}

export interface OpsClient {
  id: string;
  /** Display name of the end client. */
  name: string;
  email: string;
  phone?: string;

  /** Which intake mode this client arrived through. */
  mode: OpsIntakeMode;

  /* ---- Mode 1: SaaS-pulled ---- */
  /** The organization whose tenant this client lives in. Unset for mode 2. */
  organizationId?: string;
  organizationName?: string;
  /** Whether status is auto-synced from the CRM (mode 1 only). */
  autoSync: boolean;

  /* ---- Mode 2: Outsourcing-only ---- */
  /** The outsourcing group this client belongs to. Unset for mode 1. */
  outsourcingGroupId?: string;
  outsourcingGroupName?: string;

  /* ---- Shared operational fields ---- */
  status: string;
  /** BES agent assigned to this client's work. */
  assignedAgent?: string;
  /** ...and their id, so a picker can select them rather than match a name. */
  assignedAgentId?: string | null;
  /** Owning team — stable id, never a name. Set at intake or by a supervisor. */
  teamId?: string;
  slaHoursRemaining?: number;
  /** When the current round was actually processed. A fact, not a promise. */
  processedOn?: string | null;
  /** When the next update is due. `daysToUpdate` is derived from it, never
      stored — a stored count is wrong by tomorrow. */
  dueAt?: string | null;
  lastActivity: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Mode predicates                                                     */
/* ------------------------------------------------------------------ */

export const isSaasPulled = (c: OpsClient): boolean => c.mode === "saas_pulled";

export const isOutsourcingOnly = (c: OpsClient): boolean =>
  c.mode === "outsourcing_only";

/**
 * SaaS-pulled status is derived from CRM actions; outsourcing-only status is
 * maintained by hand. A manual change to a synced client is an override, and
 * the UI flags it as one.
 */
export const isStatusAutoSynced = (c: OpsClient): boolean =>
  c.mode === "saas_pulled" && c.autoSync;

/* ------------------------------------------------------------------ */
/* Grouping                                                            */
/*                                                                     */
/* SaaS-pulled clients group by their organization; outsourcing-only   */
/* clients group by their outsourcing group. One rule, both divisions. */
/* ------------------------------------------------------------------ */

export const clientGroupKey = (c: OpsClient): string =>
  c.mode === "saas_pulled"
    ? (c.organizationId ?? "unassigned")
    : (c.outsourcingGroupId ?? "unassigned");

export const clientGroupLabel = (c: OpsClient): string =>
  c.mode === "saas_pulled"
    ? (c.organizationName ?? "Unassigned Org")
    : (c.outsourcingGroupName ?? "Unassigned Group");

/* ------------------------------------------------------------------ */
/* Identity: ONE EMAIL = ONE FILE PER PARTNER                          */
/*                                                                     */
/* 1. The same email may exist on at most ONE record inside a given    */
/*    partner's list. A second add to the SAME partner is a hard block */
/*    — the record already exists and must not be duplicated.          */
/*                                                                     */
/* 2. The same person MAY legitimately appear on a DIFFERENT partner's */
/*    list (they cancelled with one company and enrolled with another, */
/*    or are shopping both). Allowed, but the agent is warned and must */
/*    confirm, so it is never a silent data-entry mistake.             */
/*                                                                     */
/* Centralized so every intake surface — the add-client modal, CSV     */
/* import, a future API — enforces exactly the same rule.              */
/* ------------------------------------------------------------------ */

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export interface ClientConflictResult<T extends OpsClient = OpsClient> {
  /** Same email already exists in the SAME partner scope → hard block. */
  sameScopeDuplicate?: T;
  /** Same email exists in one or more OTHER partner scopes → warn + confirm. */
  crossScopeMatches: T[];
}

/**
 * Check a candidate email against existing clients for a given scope.
 * `scopeId` is the partner's scope key (organizationId or outsourcingGroupId).
 */
export const checkClientConflict = <T extends OpsClient>(
  email: string,
  scopeId: string,
  allClients: T[],
): ClientConflictResult<T> => {
  const normalized = normalizeEmail(email);
  if (!normalized) return { crossScopeMatches: [] };
  const matches = allClients.filter(
    (c) => normalizeEmail(c.email) === normalized,
  );
  return {
    sameScopeDuplicate: matches.find((c) => clientGroupKey(c) === scopeId),
    crossScopeMatches: matches.filter((c) => clientGroupKey(c) !== scopeId),
  };
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * Abbreviated money for dense operational tables and stat cards: $1.2M, $45K,
 * $500. Deliberately not Intl.NumberFormat — full currency strings are too wide
 * for the deal and client grids these figures appear in.
 */
export const formatCurrency = (amount: number): string => {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
};
