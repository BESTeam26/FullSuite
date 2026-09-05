/**
 * Organization role access — reads the configured rows (RLS: members of the
 * organization, BES managers) and writes only through the audited functions.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { OpsProduct, OrgRoleKey, RoleAccess } from "@/lib/fulfillment/role-access-defaults";

export const roleAccessKey = (role: OrgRoleKey, product: OpsProduct) => `${role}:${product}`;

export async function fetchOrganizationRoleAccess(organizationId: string): Promise<Record<string, RoleAccess>> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("organization_role_access")
    .select("role, product, departments, views, can_log_work, can_edit_progress, can_access_management")
    .eq("organization_id", organizationId);
  if (error) throw error;
  const out: Record<string, RoleAccess> = {};
  for (const r of data ?? []) {
    out[roleAccessKey(r.role, r.product as OpsProduct)] = {
      departments: r.departments,
      views: r.views,
      canLogWork: r.can_log_work,
      canEditProgress: r.can_edit_progress,
      canAccessManagement: r.can_access_management,
    };
  }
  return out;
}

export async function setOrganizationRoleAccess(input: {
  organizationId: string;
  role: OrgRoleKey;
  product: OpsProduct;
  access: RoleAccess;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_organization_role_access", {
    p_org: input.organizationId,
    p_role: input.role,
    p_product: input.product,
    p_departments: input.access.departments,
    p_views: input.access.views,
    p_can_log_work: input.access.canLogWork,
    p_can_edit_progress: input.access.canEditProgress,
    p_can_access_management: input.access.canAccessManagement,
  });
  if (error) throw error;
}

export async function resetOrganizationRoleAccess(input: {
  organizationId: string;
  role: OrgRoleKey;
  product: OpsProduct;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("reset_organization_role_access", {
    p_org: input.organizationId,
    p_role: input.role,
    p_product: input.product,
  });
  if (error) throw error;
}
