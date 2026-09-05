/**
 * "What do I personally need to do right now?" — the department files assigned
 * to the signed-in person (separation step 4). Two bounded, RLS-scoped queries
 * (CreditOps and FundingOps department rows with assignee = me, still open),
 * shaped for the My Work page. Rows come back only for clients the person can
 * already see; the assignee filter narrows, never widens.
 */
import { requireSupabase } from "@/lib/supabase/client";
import { isOpenDepartmentStatus } from "@/lib/fulfillment/department-domain";
import { isOpenFundingStatus } from "@/lib/fulfillment/funding-department-domain";

export interface MyDepartmentFile {
  key: string;
  division: "CreditOps" | "FundingOps";
  clientId: string;
  clientName: string;
  organizationId: string | null;
  department: string;
  status: string;
  updatedAt: string;
  /** Funding only: the file the row belongs to. */
  filePurpose?: string;
}

export async function fetchMyDepartmentFiles(userId: string): Promise<MyDepartmentFile[]> {
  const sb = requireSupabase();
  const [credit, funding] = await Promise.all([
    sb
      .from("client_department_statuses")
      .select("client_id, department, status, updated_at, client:fulfillment_clients(name, organization_id, lifecycle)")
      .eq("assignee_id", userId)
      .limit(200),
    sb
      .from("funding_department_statuses")
      .select("client_id, department, status, updated_at, client:funding_clients(name, organization_id, lifecycle), file:funding_files(purpose)")
      .eq("assignee_id", userId)
      .limit(200),
  ]);
  if (credit.error) throw credit.error;
  if (funding.error) throw funding.error;

  const out: MyDepartmentFile[] = [];
  for (const r of credit.data ?? []) {
    const c = r.client as unknown as { name: string; organization_id: string | null; lifecycle: string | null } | null;
    if (!c || (c.lifecycle && c.lifecycle !== "active") || !isOpenDepartmentStatus(r.status)) continue;
    out.push({ key: `c:${r.client_id}:${r.department}`, division: "CreditOps", clientId: r.client_id, clientName: c.name, organizationId: c.organization_id, department: r.department, status: r.status, updatedAt: r.updated_at });
  }
  for (const r of funding.data ?? []) {
    const c = r.client as unknown as { name: string; organization_id: string | null; lifecycle: string | null } | null;
    const f = r.file as unknown as { purpose: string } | null;
    if (!c || (c.lifecycle && c.lifecycle !== "active") || !isOpenFundingStatus(r.status)) continue;
    out.push({ key: `f:${r.client_id}:${r.department}:${f?.purpose ?? ""}`, division: "FundingOps", clientId: r.client_id, clientName: c.name, organizationId: c.organization_id, department: r.department, status: r.status, updatedAt: r.updated_at, filePurpose: f?.purpose });
  }
  return out.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}
