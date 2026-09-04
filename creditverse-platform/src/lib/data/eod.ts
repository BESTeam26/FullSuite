/**
 * EOD data layer — Supabase ⇄ the End of Day screen.
 *
 * Totals are NOT stored and NOT read from here. `eod_submissions` holds only
 * the employee's shift context; the numbers come from `production_logs` and are
 * derived at read time by `deriveEodTotals` (rule 1 of the engine, and rule 9:
 * the calculation has one home).
 *
 * That is why this file returns production logs shaped for the engine rather
 * than pre-summed figures — a stored total can drift from the rows it claims to
 * summarise, and then nobody knows which one is true.
 */

import { requireSupabase } from "@/lib/supabase/client";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import type {
  DivisionId,
  EodSubmission,
  ProductionLog,
} from "@/lib/eod-production-engine";

type EodRow = Tables<"eod_submissions">;
type ProductionRow = Tables<"production_logs"> & {
  employee: { full_name: string | null; email: string } | null;
  organizations: { name: string } | null;
};

const DIVISIONS: DivisionId[] = [
  "creditops",
  "fundingops",
  "bes-crm",
  "talentops",
  "general",
];

/**
 * `production_logs.service` is the canonical dimension; the engine's
 * `DivisionId` predates it and spells BES CRM with a hyphen. Unknown values
 * fall into `general` rather than breaking the tally.
 */
export const asDivision = (service: string): DivisionId => {
  const v = service === "bes_crm" ? "bes-crm" : service;
  return (DIVISIONS as string[]).includes(v) ? (v as DivisionId) : "general";
};

/* ------------------------------------------------------------------ */
/* Production logs — the source of every EOD number                    */
/* ------------------------------------------------------------------ */

/**
 * One bounded request: the logs for one employee on one date, with the names
 * the screen needs embedded rather than fetched per row (rule 14: no N+1).
 *
 * Voided logs are fetched too — `deriveEodTotals` excludes them, and the screen
 * still needs to show that they exist. Filtering them out here would hide a
 * correction from the person who has to explain it.
 */
export async function fetchProductionLogs(
  employeeId: string,
  workDate: string,
): Promise<ProductionLog[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("production_logs")
    .select(
      "*, employee:profiles!production_logs_employee_id_fkey(full_name, email), organizations(name)",
    )
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .order("completed_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as ProductionRow[]).map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee?.full_name?.trim() || r.employee?.email || "—",
    partnerId: r.organization_id ?? undefined,
    partnerName: r.organizations?.name ?? undefined,
    divisionId: asDivision(r.service),
    departmentId: r.department_key ?? undefined,
    clientId: r.client_id ?? undefined,
    fundingDealId: r.funding_deal_id ?? undefined,
    workItemId: r.work_item_id ?? undefined,
    productionUnitType: r.production_unit_type,
    productionUnitQuantity: r.production_unit_quantity,
    actions: (r.actions ?? []).join(", "),
    workDate: r.work_date,
    completedAt: r.completed_at,
    isVoided: r.is_voided,
    voidReason: r.void_reason ?? undefined,
  }));
}

/* ------------------------------------------------------------------ */
/* The submission — context only                                       */
/* ------------------------------------------------------------------ */

/** The context fields, with the derived-metric slots left for the caller. */
export type EodContext = Pick<
  EodSubmission,
  | "id"
  | "employeeId"
  | "employeeName"
  | "workDate"
  | "submittedAt"
  | "state"
  | "unfinishedWork"
  | "blockers"
  | "escalations"
  | "additionalNotes"
  | "nextWorkdayPriority"
>;

const mapEod = (r: EodRow, employeeName: string): EodContext => ({
  id: r.id,
  employeeId: r.employee_id,
  employeeName,
  workDate: r.work_date,
  submittedAt: r.submitted_at ?? undefined,
  state: r.state,
  unfinishedWork: r.unfinished_work ?? undefined,
  blockers: r.blockers ?? undefined,
  escalations: r.escalations ?? undefined,
  additionalNotes: r.additional_notes ?? undefined,
  nextWorkdayPriority: r.next_workday_priority ?? undefined,
});

export async function fetchEod(
  employeeId: string,
  workDate: string,
  employeeName: string,
): Promise<EodContext | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("eod_submissions")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw error;
  return data ? mapEod(data, employeeName) : null;
}

export interface SaveEodInput {
  agencyId: string;
  employeeId: string;
  workDate: string;
  unfinishedWork?: string;
  blockers?: string;
  escalations?: string;
  additionalNotes?: string;
  nextWorkdayPriority?: string;
  /** Omit to leave the state alone; pass 'submitted' to file it. */
  state?: Enums<"eod_state">;
}

/**
 * Create or update today's EOD in ONE round trip.
 *
 * Upsert on the (employee, date) unique index rather than select-then-write:
 * the read-modify-write shape is a lost update, and it is exactly the bug that
 * had to be fixed in organization branding (rule 14).
 */
export async function saveEod(input: SaveEodInput): Promise<string> {
  const sb = requireSupabase();
  const submitting = input.state === "submitted";
  const { data, error } = await sb
    .from("eod_submissions")
    .upsert(
      {
        agency_id: input.agencyId,
        employee_id: input.employeeId,
        work_date: input.workDate,
        unfinished_work: input.unfinishedWork ?? null,
        blockers: input.blockers ?? null,
        escalations: input.escalations ?? null,
        additional_notes: input.additionalNotes ?? null,
        next_workday_priority: input.nextWorkdayPriority ?? null,
        ...(input.state ? { state: input.state } : {}),
        ...(submitting ? { submitted_at: new Date().toISOString() } : {}),
      },
      { onConflict: "employee_id,work_date" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
