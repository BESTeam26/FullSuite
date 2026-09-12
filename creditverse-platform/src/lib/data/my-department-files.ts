/**
 * "What do I personally need to do right now?" — the department files assigned
 * to the signed-in person (separation step 4). Two bounded, RLS-scoped queries
 * (CreditOps and FundingOps department rows with assignee = me), shaped for
 * the My Work page. Rows come back only for clients the person can already
 * see; the assignee filter narrows, never widens.
 *
 * ── WHY CREDITOPS READS A VIEW AND FUNDINGOPS DOES NOT ─────────────────────
 *
 * Dee, 2026-09-11: "Waiting clients should not inflate active assigned
 * workload… The active processor should be released." Open is not the same as
 * actionable: a round in the post is open for thirty days and nobody can touch
 * it. `creditops_my_work` applies `creditops_status_is_actionable` — the SAME
 * predicate the automatic assignment engine counts workload with — so the
 * number an agent sees here is the number the engine used when deciding
 * whether they were busy. A second copy of that rule in TypeScript would
 * drift, and the drift would show up as an agent being handed work the system
 * thought they had room for.
 *
 * FundingOps has no routing engine yet, so it keeps the open/closed rule it
 * has always used. When it gets one, it gets the same treatment rather than a
 * second definition here.
 */
import { requireSupabase } from "@/lib/supabase/client";
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
      .from("creditops_my_work")
      .select("client_id, client_name, organization_id, department, work_status, updated_at")
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
  /* No filtering here: the view has already applied lifecycle, archived,
     actionable and partner-owned. Re-checking in TypeScript is how the two
     rules start to disagree. */
  for (const r of credit.data ?? []) {
    out.push({ key: `c:${r.client_id}:${r.department}`, division: "CreditOps", clientId: r.client_id, clientName: r.client_name, organizationId: r.organization_id, department: r.department, status: r.work_status, updatedAt: r.updated_at });
  }
  for (const r of funding.data ?? []) {
    const c = r.client as unknown as { name: string; organization_id: string | null; lifecycle: string | null } | null;
    const f = r.file as unknown as { purpose: string } | null;
    if (!c || (c.lifecycle && c.lifecycle !== "active") || !isOpenFundingStatus(r.status)) continue;
    out.push({ key: `f:${r.client_id}:${r.department}:${f?.purpose ?? ""}`, division: "FundingOps", clientId: r.client_id, clientName: c.name, organizationId: c.organization_id, department: r.department, status: r.status, updatedAt: r.updated_at, filePurpose: f?.purpose });
  }
  return out.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}
