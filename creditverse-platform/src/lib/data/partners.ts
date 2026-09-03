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

/**
 * Which product a partner is entitled to, so a division shows only its own.
 * An organization with no entitlement row for a product is not that division's
 * partner — default deny (rule 1).
 */
export type PartnerProduct = "creditOps" | "fundingOps";

interface OrgRow {
  id: string;
  name: string;
  principal_name: string;
  principal_email: string;
  status: string;
  is_fulfillment_subscriber: boolean;
  product_entitlements: { product: string; enabled: boolean }[] | null;
}

interface GroupRow {
  id: string;
  name: string;
  partner_name: string;
  contact_email: string;
  contract_ref: string | null;
  status: string;
}

const asStatus = (s: string): OpsPartner["status"] =>
  s === "Paused"
    ? "Paused"
    : s === "Pending Onboarding" || s === "Onboarding"
      ? "Onboarding"
      : "Active";

/**
 * Every partner for one division, in ONE pair of requests rather than a lookup
 * per partner (rule 14). Entitlements ride along with the organization row.
 */
export async function fetchPartners(
  product: PartnerProduct,
): Promise<OpsPartner[]> {
  const sb = requireSupabase();
  const [orgs, groups] = await Promise.all([
    sb
      .from("organizations")
      .select(
        "id,name,principal_name,principal_email,status,is_fulfillment_subscriber,product_entitlements(product,enabled)",
      )
      .order("name"),
    sb
      .from("outsourcing_groups")
      .select("id,name,partner_name,contact_email,contract_ref,status")
      .order("name"),
  ]);
  if (orgs.error) throw orgs.error;
  if (groups.error) throw groups.error;

  const managed: OpsPartner[] = ((orgs.data ?? []) as unknown as OrgRow[])
    .filter((o) =>
      (o.product_entitlements ?? []).some(
        (e) => e.product === product && e.enabled,
      ),
    )
    .map((o) => ({
      id: `org-${o.id}`,
      name: o.name,
      // A subscriber's records sync from their own workspace; everyone else is
      // managed by BES directly. Same distinction both divisions already draw.
      // Each division names its own "direct customer" bucket; the shared
      // source emits that division's label so the trees need no translation.
      group: o.is_fulfillment_subscriber
        ? product === "fundingOps"
          ? "fundingops_users"
          : "managed"
        : product === "fundingOps"
          ? "fundingops_users"
          : "creditops_users",
      scopeId: o.id,
      mode: "saas_pulled",
      contactName: o.principal_name,
      contactEmail: o.principal_email,
      status: asStatus(o.status),
    }));

  const outsourced: OpsPartner[] = ((groups.data ?? []) as GroupRow[]).map(
    (g) => ({
      id: `grp-${g.id}`,
      name: g.name,
      group: "outsourcing",
      scopeId: g.id,
      mode: "outsourcing_only",
      contactName: g.partner_name,
      contactEmail: g.contact_email,
      contractRef: g.contract_ref ?? undefined,
      status: asStatus(g.status),
    }),
  );

  return [...managed, ...outsourced];
}
