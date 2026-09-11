/**
 * Fulfillment engagements — what BES was hired to do, for whom, and when.
 *
 * This is the authorization concept that replaced
 * `organizations.is_fulfillment_subscriber`. A boolean could say "BES fulfils
 * for this company"; it could not say which service, from when, or for a
 * partner who has no BES SaaS tenant at all (rule 16, model 3).
 *
 * The database is the enforcement layer — `bes_may_fulfil()` runs inside RLS
 * and nothing here can widen it. What this file provides is the same answer
 * to the INTERFACE, so screens can hide what a fulfillment relationship does
 * not cover instead of rendering an empty panel.
 */

import { requireSupabase } from "@/lib/supabase/client";
import type { Enums, Tables } from "@/lib/supabase/database.types";

export type FulfillmentService = Enums<"fulfillment_service">;
export type EngagementStatus = Enums<"engagement_status">;
type Row = Tables<"fulfillment_engagements">;

export interface FulfillmentEngagement {
  id: string;
  /** Set for a BES SaaS customer (model 2); null for an outsourcing partner. */
  organizationId?: string;
  /** Set for a partner with no BES SaaS tenant (model 3). */
  outsourcingGroupId?: string;
  /** The partner key, whichever side identifies them. */
  scopeId: string;
  service: FulfillmentService;
  status: EngagementStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  authorizedTeam?: string;
  /** Where this engagement is filed inside its module (0301). Null until the
   *  module has a category catalogue. */
  operationalCategoryId?: string;
  /** `auto` follows the service relationship; `manual` is an override BES made
   *  deliberately, which the derivation must never overwrite (0303/0304). */
  categorySource?: "auto" | "manual";
}

const mapRow = (r: Row): FulfillmentEngagement => ({
  id: r.id,
  organizationId: r.organization_id ?? undefined,
  outsourcingGroupId: r.outsourcing_group_id ?? undefined,
  scopeId: (r.organization_id ?? r.outsourcing_group_id)!,
  service: r.service,
  status: r.status,
  effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to ?? undefined,
  authorizedTeam: r.authorized_team ?? undefined,
  operationalCategoryId: r.operational_category_id ?? undefined,
  categorySource: (r.category_source as "auto" | "manual" | null) ?? undefined,
});

/**
 * Every engagement the caller may see, in ONE request.
 *
 * Deliberately unfiltered by partner: the set is small (one row per partner per
 * service) and the interface asks about it constantly — a query per partner or
 * per screen would be the N+1 rule 14 forbids. Fetch once, answer in memory.
 */
export async function fetchFulfillmentEngagements(): Promise<
  FulfillmentEngagement[]
> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_engagements")
    .select("*")
    .order("service");
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Live today: active, started, and not yet ended. Mirrors `engagement_is_live`. */
export function isEngagementLive(
  e: FulfillmentEngagement,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  return (
    e.status === "active" &&
    e.effectiveFrom <= today &&
    (!e.effectiveTo || e.effectiveTo >= today)
  );
}

/**
 * May BES work this partner's records for this service?
 *
 * The in-memory twin of the database function, for interface decisions only.
 * Default deny: an unknown partner or a missing engagement is `false`.
 */
export function besMayFulfil(
  engagements: FulfillmentEngagement[],
  scopeId: string | undefined,
  service: FulfillmentService,
  today?: string,
): boolean {
  if (!scopeId) return false;
  return engagements.some(
    (e) =>
      e.scopeId === scopeId &&
      e.service === service &&
      isEngagementLive(e, today),
  );
}

/** Which services BES is engaged to perform for a partner, live today. */
export function servicesFor(
  engagements: FulfillmentEngagement[],
  scopeId: string | undefined,
  today?: string,
): FulfillmentService[] {
  if (!scopeId) return [];
  return engagements
    .filter((e) => e.scopeId === scopeId && isEngagementLive(e, today))
    .map((e) => e.service);
}

/**
 * The live engagement itself, not merely whether one exists.
 *
 * `besMayFulfil` answers the authorization question; this answers the
 * operational one — which row is BES working under right now, so the interface
 * can read its category and move it. The schema does not forbid two rows for
 * one partner and service, so the choice is made deterministically (latest
 * start, then id) rather than left to row order.
 */
export function liveEngagementFor(
  engagements: FulfillmentEngagement[],
  scopeId: string | undefined,
  service: FulfillmentService,
  today?: string,
): FulfillmentEngagement | undefined {
  if (!scopeId) return undefined;
  return engagements
    .filter((e) => e.scopeId === scopeId && e.service === service && isEngagementLive(e, today))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || a.id.localeCompare(b.id))[0];
}
