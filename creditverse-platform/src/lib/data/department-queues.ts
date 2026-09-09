/**
 * "Available in my queues" — open, UNASSIGNED department rows the person is
 * authorized to work (separation step 4). Bounded, RLS-scoped: only clients the
 * person can already see come back; the department filter is applied from the
 * resolved role access (configured or default), never from a title.
 */
import { requireSupabase } from "@/lib/supabase/client";
import { isOpenDepartmentStatus } from "@/lib/fulfillment/department-domain";
import { isOpenFundingStatus } from "@/lib/fulfillment/funding-department-domain";
import type { MyDepartmentFile } from "@/lib/data/my-department-files";

export async function fetchOpenUnassignedDepartmentRows(organizationId: string | null): Promise<MyDepartmentFile[]> {
  const sb = requireSupabase();
  let credit = sb
    .from("client_department_statuses")
    /* Real clients only: the RLS-matrix fixtures live in the same tables so the
       suite stays honest, but a queue offering [TEST] people as workable files
       buries the real work (rule 12). */
    .select("client_id, department, status, updated_at, client:fulfillment_clients!inner(name, organization_id, lifecycle, is_fixture)")
    .eq("client.is_fixture", false)
    .is("assignee_id", null)
    .limit(200);
  let funding = sb
    .from("funding_department_statuses")
    .select("client_id, department, status, updated_at, client:funding_clients!inner(name, organization_id, lifecycle, is_fixture), file:funding_files(purpose)")
    .eq("client.is_fixture", false)
    .is("assignee_id", null)
    .limit(200);
  if (organizationId) {
    credit = credit.eq("client.organization_id", organizationId);
    funding = funding.eq("client.organization_id", organizationId);
  }
  const [c, f] = await Promise.all([credit, funding]);
  if (c.error) throw c.error;
  if (f.error) throw f.error;
  const out: MyDepartmentFile[] = [];
  for (const r of c.data ?? []) {
    const cl = r.client as unknown as { name: string; organization_id: string | null; lifecycle: string | null } | null;
    if (!cl || (cl.lifecycle && cl.lifecycle !== "active") || !isOpenDepartmentStatus(r.status)) continue;
    out.push({ key: `qc:${r.client_id}:${r.department}`, division: "CreditOps", clientId: r.client_id, clientName: cl.name, organizationId: cl.organization_id, department: r.department, status: r.status, updatedAt: r.updated_at });
  }
  for (const r of f.data ?? []) {
    const cl = r.client as unknown as { name: string; organization_id: string | null; lifecycle: string | null } | null;
    const fl = r.file as unknown as { purpose: string } | null;
    if (!cl || (cl.lifecycle && cl.lifecycle !== "active") || !isOpenFundingStatus(r.status)) continue;
    out.push({ key: `qf:${r.client_id}:${r.department}:${fl?.purpose ?? ""}`, division: "FundingOps", clientId: r.client_id, clientName: cl.name, organizationId: cl.organization_id, department: r.department, status: r.status, updatedAt: r.updated_at, filePurpose: fl?.purpose });
  }
  return out.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}
