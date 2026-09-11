/**
 * Partners — the organizations and outsourcing groups a division works for.
 *
 * Both divisions previously hardcoded their partner list in
 * `creditops-partners.ts` / `fundingops-partners.ts`. Those constants carry
 * invented scope ids, so a client created through the interface would be
 * attached to a partner that does not exist in the database — the intake form
 * simply could not produce a valid record. It was invisible because the seeded
 * rows already had real ids.
 *
 * One source, both divisions (rule 2): partners are `organizations` plus
 * `outsourcing_groups`, read once and shared.
 */

import { requireSupabase } from "@/lib/supabase/client";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import {
  besMayFulfil,
  type FulfillmentEngagement,
  type FulfillmentService,
} from "@/lib/data/fulfillment-engagements";
import type { Organization } from "@/lib/bes-domain";

/** Which BES service a division's partner tree is asking about. */
const SERVICE_FOR: Record<PartnerProduct, FulfillmentService> = {
  creditOps: "creditops",
  fundingOps: "fundingops",
};

/**
 * Which product a partner is entitled to, so a division shows only its own.
 * An organization with no entitlement row for a product is not that division's
 * partner — default deny (rule 1).
 */
export type PartnerProduct = "creditOps" | "fundingOps";

export interface GroupRow {
  id: string;
  name: string;
  partner_name: string;
  contact_email: string;
  contract_ref: string | null;
  status: string;
  /** Set when the partner has been archived. Archived is not deleted: they
   *  stay on BES Partners with all their history, and leave the operating
   *  lists (Dee, 2026-09-11). */
  archived_at: string | null;
}

const asStatus = (s: string): OpsPartner["status"] =>
  s === "Paused"
    ? "Paused"
    : s === "Pending Onboarding" || s === "Onboarding"
      ? "Onboarding"
      : "Active";

/** The outsourcing groups BES works for. One bounded read, no per-group lookup. */
export async function fetchOutsourcingGroups(): Promise<GroupRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("outsourcing_groups")
    .select("id,name,partner_name,contact_email,contract_ref,status,archived_at")
    .eq("is_fixture", false)
    .order("name");
  if (error) throw error;
  return (data ?? []) as GroupRow[];
}

/**
 * Build one division's partner tree from data the caller already holds.
 *
 * Pure: no I/O. This used to fetch organizations and engagements itself, which
 * meant the ops routes read `organizations` twice (once here, once in the
 * agency context) and `fulfillment_engagements` twice (once here, once through
 * `useFulfillment`) under different cache keys — four requests for two answers.
 * Taking the inputs as arguments lets `usePartners` compose the canonical
 * cached queries instead of opening a second path to the same tables (rule 2,
 * rule 14).
 */
/**
 * The Partner view of ONE organization for a product — the shape both division
 * workspaces take. Used by the BES tree (through `buildPartners`) and by an
 * organization's own CreditOps / FundingOps page, so the two surfaces describe
 * the same organization identically (rule 2).
 */
export function partnerForOrganization(
  product: PartnerProduct,
  o: Organization,
  engagements: FulfillmentEngagement[],
): OpsPartner {
  return {
    id: `org-${o.id}`,
    name: o.name,
    /* "Managed" means BES is actually engaged to fulfil THIS service for
       them — read from the engagement, not from the old subscriber boolean,
       which could not distinguish CreditOps fulfilment from FundingOps
       (rule 16). Each division names its own direct-customer bucket, so the
       shared source emits that division's label and the trees need no
       translation. */
    group: besMayFulfil(engagements, o.id, SERVICE_FOR[product])
      ? product === "fundingOps"
        ? "fundingops_users"
        : "managed"
      : product === "fundingOps"
        ? "fundingops_users"
        : "creditops_users",
    scopeId: o.id,
    mode: "saas_pulled",
    contactName: o.principal.name,
    contactEmail: o.principal.email,
    status: asStatus(o.status),
  };
}

export function buildPartners(
  product: PartnerProduct,
  organizations: Organization[],
  groups: GroupRow[],
  engagements: FulfillmentEngagement[],
): OpsPartner[] {
  const managed: OpsPartner[] = organizations
    .filter((o) => o.entitlements.some((e) => e.key === product && e.enabled))
    .map((o) => partnerForOrganization(product, o, engagements));

  /**
   * A partner belongs to a division's ACTIVE list only while BES holds a live
   * engagement to perform that division's service for them (Dee, 2026-09-11).
   *
   * This used to append EVERY partner to BOTH trees unconditionally, while the
   * organizations above it were filtered by entitlement. So a partner who
   * bought nothing but a GHL build sat in the CreditOps queue, and pausing a
   * CreditOps engagement changed nothing anybody could see.
   *
   * `besMayFulfil` is the in-memory twin of the database's `bes_may_fulfil()`,
   * and "live" already means what Dee decided it means: active, started, and
   * not yet ended. So paused, completed, ended and dated-out all drop out of
   * the operating list here through the SAME definition the database
   * authorizes with — not a second rule that could disagree with it.
   *
   * Nothing is deleted or hidden anywhere else. The canonical partner, its
   * clients, projects, documents, assignments, billing and activity all stay
   * exactly where they are, on BES Partners; only the operating queue narrows.
   * Re-activating the engagement puts the partner back with no record remade.
   */
  const outsourced: OpsPartner[] = groups
    .filter((g) => !g.archived_at && besMayFulfil(engagements, g.id, SERVICE_FOR[product]))
    .map((g) => ({
    id: `grp-${g.id}`,
    name: g.name,
    group: "outsourcing",
    scopeId: g.id,
    mode: "outsourcing_only",
    contactName: g.partner_name,
    contactEmail: g.contact_email,
    contractRef: g.contract_ref ?? undefined,
    status: asStatus(g.status),
  }));

  return [...managed, ...outsourced];
}
