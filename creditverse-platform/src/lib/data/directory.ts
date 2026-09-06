/**
 * The company directory and the organization's own departments — the People
 * and Departments modules of the Organization Hub. One call each; the
 * database decides what a colleague may see (no birth year, and a birthday
 * only when its owner allowed it).
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { OrgRoleKey } from "@/lib/fulfillment/role-access-defaults";

export interface DirectoryPerson {
  membershipId: string;
  userId: string;
  name: string;
  preferredName: string | null;
  email: string;
  jobTitle: string | null;
  platformRole: OrgRoleKey;
  departmentId: string | null;
  departmentName: string | null;
  phone: string | null;
  avatarPath: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  since: string;
}

export async function fetchOrganizationDirectory(organizationId: string): Promise<DirectoryPerson[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("organization_directory", { p_org: organizationId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    membershipId: r.membership_id as string,
    userId: r.user_id as string,
    name: r.name as string,
    preferredName: (r.preferred_name as string | null) ?? null,
    email: r.email as string,
    jobTitle: (r.job_title as string | null) ?? null,
    platformRole: r.platform_role as OrgRoleKey,
    departmentId: (r.department_id as string | null) ?? null,
    departmentName: (r.department_name as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    avatarPath: (r.avatar_path as string | null) ?? null,
    birthMonth: r.birth_month === null ? null : Number(r.birth_month),
    birthDay: r.birth_day === null ? null : Number(r.birth_day),
    since: r.since as string,
  }));
}

export interface OrganizationDepartment {
  id: string;
  name: string;
  description: string | null;
  leadUserId: string | null;
  sort: number;
}

export async function fetchOrganizationDepartments(organizationId: string): Promise<OrganizationDepartment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("organization_departments")
    .select("id, name, description, lead_user_id, sort")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("sort")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.id, name: d.name, description: d.description, leadUserId: d.lead_user_id, sort: d.sort }));
}

export interface SaveDepartmentInput {
  id: string | null;
  organizationId: string;
  name: string;
  description: string | null;
  leadUserId: string | null;
  sort: number;
}

export async function saveOrganizationDepartment(input: SaveDepartmentInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("save_organization_department", {
    p_id: input.id ?? undefined,
    p_org: input.organizationId,
    p_name: input.name.trim(),
    p_description: input.description?.trim() ?? "",
    p_lead: input.leadUserId ?? undefined,
    p_sort: input.sort,
  });
  if (error) throw error;
  return data as string;
}

export async function archiveOrganizationDepartment(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("archive_organization_department", { p_id: id });
  if (error) throw error;
}

export async function setMemberDepartment(membershipId: string, departmentId: string | null, jobTitle?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_member_department", {
    p_membership: membershipId,
    p_department: departmentId ?? undefined,
    p_job_title: jobTitle ?? undefined,
  });
  if (error) throw error;
}
