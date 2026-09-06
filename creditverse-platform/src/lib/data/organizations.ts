/**
 * Organizations data layer — Supabase ⇄ domain `Organization`.
 *
 * All reads go through RLS: agency staff see every org, org members see their
 * own, external users see orgs they hold a membership in.
 */
import type { WorkspaceViewSettings } from "@/lib/fulfillment/workspace-views";
import { format, parseISO } from "date-fns";
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums, Json, Tables } from "@/lib/supabase/database.types";
import {
  PRODUCT_LABELS,
  type Business,
  type ExternalUser,
  type OrgUser,
  type Organization,
  type ProductEntitlement,
  type ProductKey,
} from "@/lib/bes-domain";

const PRODUCT_KEYS: ProductKey[] = [
  "creditOps",
  "fundingOps",
  "diyCredit",
  "oi",
  "crm",
  "workspaces",
  "talentOps",
];

type OrgRow = Tables<"organizations"> & {
  businesses: Tables<"businesses">[];
  product_entitlements: Tables<"product_entitlements">[];
};

/**
 * Organizations with the two nested sets the interface actually renders.
 *
 * `businesses` feeds the organization revenue roll-up and the dashboard's
 * business count; `product_entitlements` gates every module. Both are small
 * and needed on ordinary navigation.
 *
 * Membership rosters are deliberately absent. `org_memberships(*, profiles(…))`
 * and `external_memberships(*, profiles(…))` were joined here and mapped onto
 * `Organization.orgUsers` / `.externalUsers`, but **no screen reads either
 * field** — they were 11kb of the 14.6kb payload, fetched on every route, for
 * nothing (rule 14: fetch only what the current view needs). When a roster
 * screen is built it should query memberships for the one organization being
 * viewed, not join every roster onto every list read.
 */
const ORG_SELECT = `
  *,
  businesses(*),
  product_entitlements(*)
`;

type Branding = NonNullable<Organization["branding"]>;

const asBranding = (j: Json): Branding =>
  j && typeof j === "object" && !Array.isArray(j) ? (j as Branding) : {};

const asWorkspaceViews = (j: Json): WorkspaceViewSettings =>
  j && typeof j === "object" && !Array.isArray(j)
    ? (j as WorkspaceViewSettings)
    : {};

const fmtDate = (d: string) => {
  try {
    return format(parseISO(d), "MMM d, yyyy");
  } catch {
    return d;
  }
};

export function mapOrgRow(row: OrgRow, pinnedIds: Set<string>): Organization {
  const enabled = new Map(
    row.product_entitlements.map((e) => [e.product, e.enabled]),
  );
  const entitlements: ProductEntitlement[] = PRODUCT_KEYS.map((key) => ({
    key,
    label: PRODUCT_LABELS[key],
    enabled: enabled.get(key) ?? false,
  }));
  const businesses: Business[] = row.businesses.map((b) => ({
    id: b.id,
    name: b.name,
    legalName: b.legal_name ?? undefined,
    ein: b.ein_last4 ? `••-•••${b.ein_last4}` : undefined,
    industry: b.industry ?? undefined,
    timeInBusinessMonths: b.time_in_business_months ?? undefined,
    monthlyRevenue: b.monthly_revenue ?? undefined,
  }));
  // Rosters are not selected — see ORG_SELECT. The fields stay on the domain
  // type so the shape is stable for the screen that will eventually load them.
  const orgUsers: OrgUser[] = [];
  const externalUsers: ExternalUser[] = [];
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    publicId: row.public_id,
    principal: { name: row.principal_name, email: row.principal_email },
    address: row.address ?? undefined,
    status: row.status,
    joinedDate: fmtDate(row.joined_at),
    entitlements,
    // The column is dead (no policy reads it); agency-context derives this
    // from live fulfillment engagements. Kept false here so the raw row can
    // never claim access on its own.
    isFulfillmentSubscriber: false,
    businesses,
    orgUsers,
    externalUsers,
    branding: asBranding(row.branding),
    workspaceViews: asWorkspaceViews(row.workspace_views),
    isPinned: pinnedIds.has(row.id),
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Save the person's Home layout. One column, whole value, no read-modify-write:
 * the list IS the setting, so replacing it cannot lose another field's edit.
 * `null` restores the default layout.
 */
export async function updateDashboardCards(
  userId: string,
  cards: string[] | null,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("user_preferences")
    .upsert({ user_id: userId, dashboard_cards: cards as Json }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function fetchUserPreferences(userId: string) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (
    data ?? {
      user_id: userId,
      pinned_org_ids: [],
      recent_org_ids: [],
      dashboard_cards: null,
      updated_at: "",
    }
  );
}

/**
 * Organizations for this user, with their pinned ones marked.
 *
 * The preferences row is read alongside because pinning lives on it. The Home
 * layout reads the same row through `useUserPreferences`, so a session makes
 * two reads of one small row — both in parallel, neither blocking the other.
 * Collapsing them would mean moving pinning out of this query and applying it
 * in the provider, which is more moving parts than the saving is worth; it is
 * noted here so the next reader knows it was considered, not missed.
 */
export async function fetchOrganizations(userId: string): Promise<Organization[]> {
  const sb = requireSupabase();
  const [{ data, error }, prefs] = await Promise.all([
    sb.from("organizations").select(ORG_SELECT).order("name"),
    fetchUserPreferences(userId),
  ]);
  if (error) throw error;
  const pinned = new Set(prefs.pinned_org_ids);
  return ((data ?? []) as unknown as OrgRow[]).map((r) => mapOrgRow(r, pinned));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface CreateOrganizationInput {
  agencyId: string;
  name: string;
  code: string;
  principalName: string;
  principalEmail: string;
  address?: string;
  status: Enums<"org_status">;
  entitlements: Partial<Record<ProductKey, boolean>>;
  branding?: Branding;
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("organizations")
    .insert({
      agency_id: input.agencyId,
      name: input.name,
      code: input.code,
      principal_name: input.principalName,
      principal_email: input.principalEmail,
      address: input.address ?? null,
      status: input.status,
      branding: (input.branding ?? {}) as Json,
    })
    .select("id")
    .single();
  if (error) throw error;

  const rows = PRODUCT_KEYS.map((product) => ({
    organization_id: data.id,
    product,
    enabled: input.entitlements[product] ?? false,
  }));
  const { error: entErr } = await sb.from("product_entitlements").insert(rows);
  if (entErr) throw entErr;

  await sb.rpc("log_audit", {
    p_action: "organization.created",
    p_entity_type: "organization",
    p_entity_id: data.id,
    p_org: data.id,
    p_after: { name: input.name, code: input.code } as Json,
  });
  return data.id;
}

export async function updateOrganization(
  id: string,
  patch: Partial<
    Pick<
      Tables<"organizations">,
      | "name"
      | "status"
      | "address"
      | "principal_name"
      | "principal_email"
    >
  >,
) {
  const sb = requireSupabase();
  const { error } = await sb.from("organizations").update(patch).eq("id", id);
  if (error) throw error;
  await sb.rpc("log_audit", {
    p_action: "organization.updated",
    p_entity_type: "organization",
    p_entity_id: id,
    p_org: id,
    p_after: patch as Json,
  });
}

/**
 * Merge a branding patch in ONE round trip.
 *
 * This used to read the row, merge in JavaScript, then write it back. Besides
 * the extra round trip (rule 14), that is a lost update: two people editing
 * different branding fields at once both read the old row, and the second write
 * silently discards the first. The merge now happens inside a single UPDATE,
 * under the row's own lock, and records an audit entry.
 */
export async function updateOrganizationBranding(
  id: string,
  branding: Partial<Branding>,
): Promise<Branding> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("merge_organization_branding", {
    p_org: id,
    p_patch: branding as Json,
  });
  if (error) throw error;
  return asBranding(data);
}

/**
 * Hide or show workspace views for an organization. The database function
 * checks authorization (agency manager or organization owner/admin), rejects
 * hiding the dashboard or the record list, merges, and writes the audit row.
 */
export async function updateOrganizationWorkspaceViews(
  id: string,
  patch: Partial<WorkspaceViewSettings>,
): Promise<WorkspaceViewSettings> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("merge_organization_workspace_views", {
    p_org: id,
    p_patch: patch as Json,
  });
  if (error) throw error;
  return asWorkspaceViews(data);
}

export async function setEntitlement(
  orgId: string,
  product: ProductKey,
  enabled: boolean,
) {
  const sb = requireSupabase();
  const { error } = await sb
    .from("product_entitlements")
    .upsert(
      { organization_id: orgId, product, enabled },
      { onConflict: "organization_id,product" },
    );
  if (error) throw error;
  await sb.rpc("log_audit", {
    p_action: enabled ? "entitlement.enabled" : "entitlement.disabled",
    p_entity_type: "product_entitlement",
    p_entity_id: `${orgId}:${product}`,
    p_org: orgId,
    p_after: { product, enabled } as Json,
  });
}

export async function togglePinnedOrg(userId: string, orgId: string) {
  const sb = requireSupabase();
  const prefs = await fetchUserPreferences(userId);
  const pinned = prefs.pinned_org_ids.includes(orgId)
    ? prefs.pinned_org_ids.filter((id) => id !== orgId)
    : [...prefs.pinned_org_ids, orgId];
  const { error } = await sb.from("user_preferences").upsert({
    user_id: userId,
    pinned_org_ids: pinned,
    recent_org_ids: prefs.recent_org_ids,
  });
  if (error) throw error;
}

export async function pushRecentOrg(userId: string, orgId: string) {
  const sb = requireSupabase();
  const prefs = await fetchUserPreferences(userId);
  const recent = [
    orgId,
    ...prefs.recent_org_ids.filter((id) => id !== orgId),
  ].slice(0, 5);
  await sb.from("user_preferences").upsert({
    user_id: userId,
    pinned_org_ids: prefs.pinned_org_ids,
    recent_org_ids: recent,
  });
}

/** Fetch the caller's agency id (first membership). */
export async function fetchMyAgencyId(userId: string): Promise<string | null> {
  const sb = requireSupabase();
  const { data } = await sb
    .from("agency_memberships")
    .select("agency_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.agency_id ?? null;
}
