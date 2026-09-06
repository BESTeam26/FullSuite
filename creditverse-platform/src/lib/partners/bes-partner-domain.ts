/**
 * BES Partners — the companies BES actively serves.
 *
 * Dee's doctrine, 2026-09-06: *"AGENCY HQ 'Clients' should NOT mean end
 * consumers. At BES Agency HQ, use BES PARTNERS. At the Organization level,
 * use CLIENTS. Never mix these concepts again."*
 *
 *   ORGANIZATION  a company that subscribes to BES software
 *   BES PARTNER   a company BES actually does work for
 *   CLIENT        that organization's own end customer
 *
 * A subscription alone does not make a partner. What makes a partner is a
 * `fulfillment_engagements` row — which is also the thing `bes_may_fulfil()`
 * checks inside RLS, so this screen and the database are reading the same
 * fact. There is no second table and no new permission concept.
 *
 * Two shapes of partner exist and both belong here (rule 16):
 *
 *   model 2  an organization that ALSO bought fulfillment
 *   model 3  an outsourcing group with no BES SaaS tenant at all
 *
 * Model 3 is why a partner is not a subclass of an organization.
 */

import {
  isEngagementLive,
  type FulfillmentEngagement,
  type FulfillmentService,
} from "@/lib/data/fulfillment-engagements";

export const SERVICE_LABEL: Record<FulfillmentService, string> = {
  creditops: "CreditOps",
  fundingops: "FundingOps",
  bes_crm: "BES CRM",
  talentops: "TalentOps",
};

/** How BES reaches this partner's records. Not a status — a shape. */
export type PartnerRelationship = "saas_and_fulfillment" | "outsourcing_only";

export const RELATIONSHIP_LABEL: Record<PartnerRelationship, string> = {
  saas_and_fulfillment: "SaaS + BES fulfillment",
  outsourcing_only: "Outsourcing — no SaaS tenant",
};

export interface PartnerService {
  service: FulfillmentService;
  status: string;
  live: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  /** The BES team narrowed to this engagement, if one is named. */
  authorizedTeam?: string;
}

export interface BesPartner {
  /** The engagement scope id — an organization id or an outsourcing group id. */
  scopeId: string;
  name: string;
  relationship: PartnerRelationship;
  /** Present only for model 2, so HQ can open the organization behind it. */
  organizationId?: string;
  organizationPublicId?: string;
  contactName: string;
  contactEmail: string;
  contractRef?: string;
  /** Every engagement, live or not. History is part of the relationship. */
  services: PartnerService[];
  liveServices: FulfillmentService[];
  status: string;
}

export interface OrganizationInput {
  id: string;
  publicId: string;
  name: string;
  status: string;
  principal: { name: string; email: string };
}

export interface OutsourcingGroupInput {
  id: string;
  name: string;
  partner_name: string;
  contact_email: string;
  contract_ref: string | null;
  status: string;
}

const toService = (e: FulfillmentEngagement, today?: string): PartnerService => ({
  service: e.service,
  status: e.status,
  live: isEngagementLive(e, today),
  effectiveFrom: e.effectiveFrom,
  effectiveTo: e.effectiveTo,
  authorizedTeam: e.authorizedTeam,
});

/**
 * Compose the partner list from what already exists.
 *
 * An organization appears ONLY when it has at least one engagement. That is
 * the whole point: BES has many SaaS customers it does no operational work
 * for, and listing them here would say BES serves companies it does not
 * (rule 16's critical access rule, stated as a screen).
 *
 * An outsourcing group always appears — it exists for no other reason than
 * to be served — even before its first engagement is recorded, because that
 * gap is a data-entry problem HQ needs to see rather than a company to hide.
 */
export function buildBesPartners(
  organizations: OrganizationInput[],
  groups: OutsourcingGroupInput[],
  engagements: FulfillmentEngagement[],
  today?: string,
): BesPartner[] {
  const byScope = new Map<string, FulfillmentEngagement[]>();
  for (const e of engagements) {
    const list = byScope.get(e.scopeId) ?? [];
    list.push(e);
    byScope.set(e.scopeId, list);
  }

  const fromOrganizations: BesPartner[] = organizations
    .filter((o) => (byScope.get(o.id) ?? []).length > 0)
    .map((o) => {
      const services = (byScope.get(o.id) ?? []).map((e) => toService(e, today));
      return {
        scopeId: o.id,
        name: o.name,
        relationship: "saas_and_fulfillment" as const,
        organizationId: o.id,
        organizationPublicId: o.publicId,
        contactName: o.principal.name,
        contactEmail: o.principal.email,
        services,
        liveServices: services.filter((s) => s.live).map((s) => s.service),
        status: o.status,
      };
    });

  const fromGroups: BesPartner[] = groups.map((g) => {
    const services = (byScope.get(g.id) ?? []).map((e) => toService(e, today));
    return {
      scopeId: g.id,
      name: g.name,
      relationship: "outsourcing_only" as const,
      contactName: g.partner_name,
      contactEmail: g.contact_email,
      contractRef: g.contract_ref ?? undefined,
      services,
      liveServices: services.filter((s) => s.live).map((s) => s.service),
      status: g.status,
    };
  });

  return [...fromOrganizations, ...fromGroups].sort((a, b) => a.name.localeCompare(b.name));
}

export type PartnerFilter = "live" | "all" | "dormant";

/** Dormant: a partner we have served, or contracted to, with nothing live now. */
export function filterPartners(
  partners: BesPartner[],
  filter: PartnerFilter,
  q: string,
): BesPartner[] {
  const needle = q.trim().toLowerCase();
  return partners.filter((p) => {
    if (filter === "live" && p.liveServices.length === 0) return false;
    if (filter === "dormant" && p.liveServices.length > 0) return false;
    if (!needle) return true;
    return [p.name, p.contactName, p.contactEmail, p.contractRef ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

/** How many partners hold a live engagement for each service. */
export function serviceTotals(partners: BesPartner[]): Record<FulfillmentService, number> {
  const totals: Record<FulfillmentService, number> = {
    creditops: 0,
    fundingops: 0,
    bes_crm: 0,
    talentops: 0,
  };
  for (const p of partners) for (const s of p.liveServices) totals[s] += 1;
  return totals;
}
