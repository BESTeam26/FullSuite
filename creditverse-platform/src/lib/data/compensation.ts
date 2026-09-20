/**
 * Compensation arrangements — reading and writing both sides of the money.
 *
 * Two sides, two doors. The worker's rate comes back on the arrangement row
 * itself; BES's cost, the managing partner and the margin come back only from
 * `payslips_internal`, which the database gates on compensation.bes_cost.view.
 * So a caller without that capability gets `null` for the internal figures
 * rather than a refusal — the screen simply has less on it, and no UI check
 * is load-bearing (rule 1).
 */
import { requireSupabase } from "@/lib/supabase/client";

export type ArrangementType = "direct_bes" | "managing_partner";
export type CompensationBasis = "hourly" | "daily" | "monthly" | "per_cutoff";
export type FinancialScope = "agent_only" | "bes_only" | "both";

export interface CompensationArrangement {
  id: string;
  userId: string;
  arrangementType: ArrangementType;
  basis: CompensationBasis;
  /** What the worker earns. */
  agentRateCents: number;
  /** What BES pays for them. Null when the caller may not see internal cost. */
  besCostCents: number | null;
  /** BES cost minus the worker's rate. Null with the cost. */
  marginCents: number | null;
  /** Only set by the roster query. */
  personName?: string | null;
  managingPartnerId: string | null;
  managingPartnerName: string | null;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
}

const ARRANGEMENT_SELECT =
  "id, user_id, arrangement_type, compensation_basis, agent_rate_cents, " +
  "managing_partner_id, currency, effective_from, effective_to, reason, " +
  "partner:profiles!compensation_arrangements_managing_partner_id_fkey(full_name)";

/**
 * Two requests, issued together.
 *
 * The worker's rate comes off the table; BES's cost comes from
 * `compensation_arrangements_internal`, which the database opens only to
 * `compensation.bes_cost.view` or to the managing partner being paid. Neither
 * request depends on the other's answer (rule 14), and the internal one
 * simply returns nothing when the caller may not see cost — so `besCostCents`
 * is null rather than the read failing.
 */
async function withCost(
  rows: Record<string, unknown>[],
  costs: Map<string, { bes: number; margin: number }>,
): Promise<CompensationArrangement[]> {
  return rows.map((r) => {
    const partner = r.partner as { full_name?: string | null } | null;
    const cost = costs.get(r.id as string);
    return {
      id: r.id as string,
      userId: r.user_id as string,
      arrangementType: r.arrangement_type as ArrangementType,
      basis: r.compensation_basis as CompensationBasis,
      agentRateCents: Number(r.agent_rate_cents ?? 0),
      besCostCents: cost ? cost.bes : null,
      marginCents: cost ? cost.margin : null,
      managingPartnerId: (r.managing_partner_id as string) ?? null,
      managingPartnerName: partner?.full_name ?? null,
      currency: r.currency as string,
      effectiveFrom: r.effective_from as string,
      effectiveTo: (r.effective_to as string) ?? null,
      reason: (r.reason as string) ?? null,
    };
  });
}

const costMap = (rows: unknown): Map<string, { bes: number; margin: number }> => {
  const m = new Map<string, { bes: number; margin: number }>();
  for (const r of (rows ?? []) as Record<string, unknown>[]) {
    m.set(r.id as string, { bes: Number(r.bes_cost_cents ?? 0), margin: Number(r.margin_cents ?? 0) });
  }
  return m;
};

/** Every arrangement a person has held, newest first. */
export async function fetchArrangements(userId: string): Promise<CompensationArrangement[]> {
  const sb = requireSupabase();
  const [main, internal] = await Promise.all([
    sb.from("compensation_arrangements").select(ARRANGEMENT_SELECT)
      .eq("user_id", userId).order("effective_from", { ascending: false }),
    sb.from("compensation_arrangements_internal")
      .select("id, bes_cost_cents, margin_cents").eq("user_id", userId),
  ]);
  if (main.error) throw main.error;
  return withCost(
    (main.data ?? []) as unknown as Record<string, unknown>[],
    costMap(internal.data),
  );
}

/** Everyone's CURRENT arrangement, for the pay roster. */
export async function fetchArrangementRoster(): Promise<CompensationArrangement[]> {
  const sb = requireSupabase();
  const [main, internal] = await Promise.all([
    sb.from("compensation_arrangements")
      .select(`${ARRANGEMENT_SELECT}, person:profiles!compensation_arrangements_user_id_fkey(full_name, email)`)
      .is("effective_to", null),
    sb.from("compensation_arrangements_internal")
      .select("id, bes_cost_cents, margin_cents").is("effective_to", null),
  ]);
  if (main.error) throw main.error;
  const rows = (main.data ?? []) as unknown as Record<string, unknown>[];
  const withNames = await withCost(rows, costMap(internal.data));
  return withNames.map((a, i) => {
    const person = rows[i].person as { full_name?: string | null; email?: string | null } | null;
    return { ...a, personName: person?.full_name?.trim() || person?.email || null };
  });
}

export interface NewArrangement {
  userId: string;
  arrangementType: ArrangementType;
  basis: CompensationBasis;
  agentRateCents: number;
  besCostCents: number;
  managingPartnerId: string | null;
  currency: string;
  effectiveFrom: string;
  reason: string;
}

/**
 * Open a new arrangement, closing the one it replaces.
 *
 * One call, because the close and the open must not be two: a close that
 * succeeds and an open that fails leaves somebody unpriced, and an unpriced
 * person gets no payslip at all. The database function does both, checks the
 * capability, and mirrors the agent side onto the rate the payslip's hourly
 * and daily figures derive from.
 */
export async function openArrangement(a: NewArrangement): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_compensation_arrangement", {
    p_user: a.userId,
    p_type: a.arrangementType,
    p_basis: a.basis,
    p_agent_cents: a.agentRateCents,
    p_bes_cents: a.arrangementType === "direct_bes" ? a.agentRateCents : a.besCostCents,
    p_partner: a.arrangementType === "managing_partner" ? a.managingPartnerId : null,
    p_currency: a.currency,
    p_from: a.effectiveFrom,
    p_reason: a.reason,
  });
  if (error) throw error;
}

/* ── The payroll record: a person's payslips, period by period ──────────── */

export interface PayrollRecordRow {
  payslipId: string;
  cutoffId: string;
  periodStart: string;
  periodEnd: string;
  payday: string | null;
  status: "draft" | "released";
  currency: string;
  basis: string;
  rateCents: number;
  workMinutes: number;
  paidLeaveMinutes: number;
  paidBreakMinutes: number;
  paidDays: number;
  /** The worker's money. Always present. */
  baseCents: number;
  adjustmentCents: number;
  adjustmentNote: string | null;
  grossCents: number;
  /** BES's side. Null unless the caller may see internal cost. */
  besTotalCents: number | null;
  marginCents: number | null;
  managingPartnerName: string | null;
}

/**
 * One person's payroll history.
 *
 * Two requests, issued together rather than one after the other: the payslips
 * and their internal side come from different doors, and neither depends on
 * the other's answer (rule 14). The internal request simply returns nothing
 * when the caller may not see cost.
 */
export async function fetchPayrollRecord(userId: string, limit = 24): Promise<PayrollRecordRow[]> {
  const sb = requireSupabase();
  const [slips, internal] = await Promise.all([
    sb.from("payslips")
      .select("id, cutoff_id, rate_type, rate_cents, currency, work_minutes, paid_leave_minutes, " +
        "paid_break_minutes, paid_days, base_cents, adjustment_cents, adjustment_note, gross_cents, " +
        "cutoff:payroll_cutoffs!payslips_cutoff_id_fkey(period_start, period_end, payday, status)")
      .eq("user_id", userId).limit(limit),
    sb.from("payslips_internal")
      .select("id, bes_total_cents, margin_cents, partner:profiles!payslips_managing_partner_id_fkey(full_name)")
      .eq("user_id", userId).limit(limit),
  ]);
  if (slips.error) throw slips.error;
  /* Not being allowed to see cost is not an error — it is a shorter row. */
  const costs = new Map<string, { bes: number; margin: number; partner: string | null }>();
  for (const r of (internal.data ?? []) as unknown as Record<string, unknown>[]) {
    const p = r.partner as { full_name?: string | null } | null;
    costs.set(r.id as string, {
      bes: Number(r.bes_total_cents ?? 0),
      margin: Number(r.margin_cents ?? 0),
      partner: p?.full_name ?? null,
    });
  }

  return ((slips.data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => {
      const c = r.cutoff as Record<string, unknown> | null;
      const cost = costs.get(r.id as string);
      return {
        payslipId: r.id as string,
        cutoffId: r.cutoff_id as string,
        periodStart: (c?.period_start as string) ?? "",
        periodEnd: (c?.period_end as string) ?? "",
        payday: (c?.payday as string) ?? null,
        status: ((c?.status as string) ?? "draft") as "draft" | "released",
        currency: r.currency as string,
        basis: r.rate_type as string,
        rateCents: Number(r.rate_cents ?? 0),
        workMinutes: Number(r.work_minutes ?? 0),
        paidLeaveMinutes: Number(r.paid_leave_minutes ?? 0),
        paidBreakMinutes: Number(r.paid_break_minutes ?? 0),
        paidDays: Number(r.paid_days ?? 0),
        baseCents: Number(r.base_cents ?? 0),
        adjustmentCents: Number(r.adjustment_cents ?? 0),
        adjustmentNote: (r.adjustment_note as string) ?? null,
        grossCents: Number(r.gross_cents ?? 0),
        besTotalCents: cost ? cost.bes : null,
        marginCents: cost ? cost.margin : null,
        managingPartnerName: cost ? cost.partner : null,
      };
    })
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

/** What the rows above add up to for one calendar year. */
export function yearToDate(rows: PayrollRecordRow[], year: number) {
  const inYear = rows.filter((r) => r.periodEnd.startsWith(String(year)) && r.status === "released");
  const sum = (pick: (r: PayrollRecordRow) => number | null) =>
    inYear.reduce((t, r) => t + (pick(r) ?? 0), 0);
  return {
    periods: inYear.length,
    currency: inYear[0]?.currency ?? null,
    grossCents: sum((r) => r.grossCents),
    minutes: sum((r) => r.workMinutes + r.paidLeaveMinutes + r.paidBreakMinutes),
    /* Null, not zero, when the caller may not see cost — a zero would read as
       "BES paid nothing", which is a different statement. */
    besTotalCents: inYear.some((r) => r.besTotalCents !== null) ? sum((r) => r.besTotalCents) : null,
    marginCents: inYear.some((r) => r.marginCents !== null) ? sum((r) => r.marginCents) : null,
  };
}
