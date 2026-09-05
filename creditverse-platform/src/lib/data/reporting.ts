/**
 * Reports page signals — bounded, RLS-scoped rows the month-series engine
 * buckets. Letters and funding rows are the canonical records (engine-derived
 * outcomes only; manual outcomes for outside-CRM clients arrive with the
 * reporting milestone's `client_round_outcomes`). Production rows are BES
 * staff-scoped by policy: organization users receive none and see no agent
 * ranking.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface LetterSignal { clientId: string; status: string; createdAt: string; mailedAt: string | null; respondedAt: string | null }
export interface FundedSignal { gross: number; fundedAt: string }
export interface SubmissionSignal { lender: string; status: string; submittedAt: string | null }
export interface ProductionSignal { employeeId: string; employeeName: string; units: number; workDate: string; department: string | null }
export interface ReportingSignals { letters: LetterSignal[]; funded: FundedSignal[]; submissions: SubmissionSignal[]; production: ProductionSignal[] }

export async function fetchReportingSignals(sinceIso: string): Promise<ReportingSignals> {
  const sb = requireSupabase();
  const [letters, funded, deals, production] = await Promise.all([
    sb.from("dispute_letters").select("client_id, status, created_at, mailed_at, responded_at").gte("created_at", sinceIso).limit(5000),
    sb.from("funded_deals").select("gross_funded, funded_at").gte("funded_at", sinceIso).limit(5000),
    sb.from("funding_deals").select("lender, status, submitted_at").neq("status", "Draft").gte("created_at", sinceIso).limit(5000),
    sb.from("production_logs").select("employee_id, production_unit_quantity, work_date, department, is_voided, employee:profiles!employee_id(full_name, email)").eq("is_voided", false).gte("work_date", sinceIso.slice(0, 10)).limit(10000),
  ]);
  for (const r of [letters, funded, deals, production]) if (r.error) throw r.error;
  return {
    letters: (letters.data ?? []).map((l) => ({ clientId: l.client_id, status: l.status, createdAt: l.created_at, mailedAt: l.mailed_at, respondedAt: l.responded_at })),
    funded: (funded.data ?? []).map((f) => ({ gross: Number(f.gross_funded), fundedAt: f.funded_at })),
    submissions: (deals.data ?? []).map((d) => ({ lender: d.lender, status: d.status, submittedAt: d.submitted_at })),
    production: (production.data ?? []).map((p) => {
      const e = p.employee as { full_name: string | null; email: string } | null;
      return { employeeId: p.employee_id, employeeName: e ? e.full_name?.trim() || e.email : "Team member", units: Number(p.production_unit_quantity), workDate: p.work_date, department: p.department };
    }),
  };
}
