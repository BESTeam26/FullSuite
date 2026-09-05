/**
 * FundingOps department / work status — operational truth per FUNDING FILE
 * (separation step 3). Mirrors `fundingops_department_statuses()` in
 * migration 0054; the matrix asserts a sample agrees.
 */
import type { FundingDepartment } from "@/lib/fulfillment/fundingops-store-types";

export const FUNDINGOPS_DEPARTMENT_ORDER: readonly FundingDepartment[] = [
  "Readiness Review", "Document Review", "Lender Matching", "Submissions", "Stipulations", "Offers", "Funded Deals",
];

const VOCAB: Record<FundingDepartment, string[]> = {
  "Readiness Review": ["NOT STARTED", "IN REVIEW", "NEEDS CLIENT ACTION", "COMPLETE"],
  "Document Review": ["NOT STARTED", "IN PROGRESS", "OUTSTANDING", "COMPLETE"],
  "Lender Matching": ["NOT STARTED", "IN PROGRESS", "COMPLETE"],
  Submissions: ["NOT STARTED", "IN PROGRESS", "SUBMITTED", "COMPLETE"],
  Stipulations: ["NOT STARTED", "OUTSTANDING", "SATISFIED"],
  Offers: ["NOT STARTED", "OFFER RECEIVED", "ACCEPTED", "DECLINED"],
  "Funded Deals": ["NOT STARTED", "CLOSING", "FUNDED"],
};

export const fundingDepartmentStatuses = (d: FundingDepartment): string[] => VOCAB[d];

/** "Nothing open for this department": not started, or finished. */
export const FUNDING_CLOSED_STATUSES: ReadonlySet<string> = new Set(["NOT STARTED", "COMPLETE", "SATISFIED", "ACCEPTED", "DECLINED", "FUNDED"]);
export const isOpenFundingStatus = (status: string) => !FUNDING_CLOSED_STATUSES.has(status.toUpperCase());

export function nextFundingDepartment(d: FundingDepartment): FundingDepartment | null {
  const i = FUNDINGOPS_DEPARTMENT_ORDER.indexOf(d);
  return i >= 0 && i < FUNDINGOPS_DEPARTMENT_ORDER.length - 1 ? FUNDINGOPS_DEPARTMENT_ORDER[i + 1] : null;
}

/** The status a department opens with when a file is handed to it. */
export function fundingHandoffEntryStatus(d: FundingDepartment): string {
  return VOCAB[d].find((st) => isOpenFundingStatus(st)) ?? VOCAB[d][0];
}
