/**
 * Canonical Production Log & EOD Engine
 * =====================================
 * Aggregates production from CreditOps, FundingOps, BES CRM projects, TalentOps,
 * and general Work Items into a single Agency EOD per employee per work date.
 *
 * Rules:
 * 1. EOD totals are ALWAYS auto-derived from non-voided Production Logs.
 * 2. Employees NEVER manually enter production totals.
 * 3. Employees only enter context: Unfinished Work, Blockers, Escalations, Additional Notes, Next Workday Priority.
 * 4. One EOD per employee per work date.
 * 5. Shift end + grace period determines Missing EOD dynamically.
 * 6. Voided production logs are excluded from EOD totals.
 * 7. Scoped assignee pickers — never company-wide directory dump.
 * 8. Role + Permission + Scope + Assignment authorization engine.
 */

export type DivisionId =
  "creditops" | "fundingops" | "bes-crm" | "talentops" | "general";

export interface ProductionLog {
  id: string;
  employeeId: string;
  employeeName: string;
  partnerId?: string; // Organization ID (Organization)
  partnerName?: string;
  businessId?: string;
  divisionId: DivisionId;
  departmentId?: string;
  teamId?: string;
  projectId?: string;
  workItemId?: string;
  creditCaseId?: string;
  fundingDealId?: string;
  productionUnitType: string; // e.g., "Dispute Letters", "Deals Processed", "QA Completed"
  productionUnitQuantity: number;
  actions: string;
  workDate: string; // YYYY-MM-DD
  completedAt: string;
  isVoided: boolean;
  voidReason?: string;
}

export type EodWorkflowState =
  "draft" | "submitted" | "needs_clarification" | "reviewed" | "approved";

export interface EodSubmission {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string; // YYYY-MM-DD
  submittedAt?: string;
  state: EodWorkflowState;

  // Context fields entered by employee
  unfinishedWork?: string;
  blockers?: string;
  escalations?: string;
  additionalNotes?: string;
  nextWorkdayPriority?: string;

  // Auto-derived metrics (computed live from ProductionLogs)
  totalUnits: number;
  unitsByDivision: Record<DivisionId, number>;
  unitsByType: Record<string, number>;
  logCount: number;
}

/**
 * Derives EOD production totals from an array of production logs for a given employee & date.
 * Excludes voided logs automatically.
 */
export function deriveEodTotals(
  logs: ProductionLog[],
  employeeId: string,
  workDate: string,
): {
  totalUnits: number;
  unitsByDivision: Record<DivisionId, number>;
  unitsByType: Record<string, number>;
  activeLogs: ProductionLog[];
} {
  const activeLogs = logs.filter(
    (l) =>
      l.employeeId === employeeId && l.workDate === workDate && !l.isVoided,
  );

  const unitsByDivision: Record<DivisionId, number> = {
    creditops: 0,
    fundingops: 0,
    "bes-crm": 0,
    talentops: 0,
    general: 0,
  };

  const unitsByType: Record<string, number> = {};

  let totalUnits = 0;

  for (const log of activeLogs) {
    totalUnits += log.productionUnitQuantity;
    unitsByDivision[log.divisionId] =
      (unitsByDivision[log.divisionId] || 0) + log.productionUnitQuantity;
    unitsByType[log.productionUnitType] =
      (unitsByType[log.productionUnitType] || 0) + log.productionUnitQuantity;
  }

  return { totalUnits, unitsByDivision, unitsByType, activeLogs };
}

/**
 * Dynamic Missing EOD check based on shift end + grace period.
 */
export function isEodMissing(
  submission: EodSubmission | null,
  shiftEndHour24: number = 17, // Default 5 PM
  gracePeriodHours: number = 2, // 2-hour grace period
  currentHour24: number = new Date().getHours(),
): boolean {
  if (
    submission &&
    (submission.state === "submitted" ||
      submission.state === "approved" ||
      submission.state === "reviewed")
  ) {
    return false;
  }
  // The deadline is shift end plus grace. For a night shift that deadline can
  // land after midnight, in which case the plain sum exceeds 23 and no
  // hour-of-day could ever reach it — a late shift was never flagged missing.
  const rawCutoff = shiftEndHour24 + gracePeriodHours;
  if (rawCutoff < 24) {
    return currentHour24 >= rawCutoff;
  }

  // Wrapped: the EOD is overdue from the small-hours cutoff until the next
  // shift begins winding down, i.e. up to the shift-end hour itself.
  const cutoffHour = rawCutoff % 24;
  return currentHour24 >= cutoffHour && currentHour24 < shiftEndHour24;
}

/** Sample seed production logs for Agency HQ workspace */
export const seedProductionLogs: ProductionLog[] = [
  {
    id: "pl-1",
    employeeId: "emp-1",
    employeeName: "Carlos Mendoza",
    partnerId: "sub-1",
    partnerName: "Apex Credit Co.",
    divisionId: "creditops",
    productionUnitType: "Dispute Letters",
    productionUnitQuantity: 18,
    actions: "Processed Round 2 MOV disputes for Maria Gonzalez & 3 others",
    workDate: new Date().toISOString().split("T")[0],
    completedAt: new Date().toISOString(),
    isVoided: false,
  },
  {
    id: "pl-2",
    employeeId: "emp-1",
    employeeName: "Carlos Mendoza",
    partnerId: "sub-1",
    partnerName: "Apex Credit Co.",
    divisionId: "creditops",
    productionUnitType: "CFPB Complaints",
    productionUnitQuantity: 4,
    actions: "Filed CFPB complaints for collection accounts",
    workDate: new Date().toISOString().split("T")[0],
    completedAt: new Date().toISOString(),
    isVoided: false,
  },
  {
    id: "pl-3",
    employeeId: "emp-2",
    employeeName: "Keila Betancourt",
    partnerId: "sub-4",
    partnerName: "CreditFix Solutions",
    divisionId: "creditops",
    productionUnitType: "QA Reviews",
    productionUnitQuantity: 24,
    actions: "Passed QA for Round 1 dispute packages",
    workDate: new Date().toISOString().split("T")[0],
    completedAt: new Date().toISOString(),
    isVoided: false,
  },
  {
    id: "pl-4",
    employeeId: "emp-2",
    employeeName: "Keila Betancourt",
    partnerId: "os-group-1",
    partnerName: "CRC Outsourcing — Q3 Cohort",
    divisionId: "creditops",
    productionUnitType: "Dispute Letters",
    productionUnitQuantity: 12,
    actions: "Processed Round 1 disputes for Robert Kim",
    workDate: new Date().toISOString().split("T")[0],
    completedAt: new Date().toISOString(),
    isVoided: false,
  },
];
