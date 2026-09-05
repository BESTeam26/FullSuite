/**
 * Funding document vocabulary — the words the interface uses for what the
 * database stores (migration 0058). Two rules from the FundingOps doctrine
 * live here as data:
 *  - a document disposition is never a credit word ("Not accepted", never
 *    "Rejected");
 *  - a flag has a client-safe meaning; the code is for reviewers, the meaning
 *    is for everyone. A flag is a potential issue, never a finding of fraud.
 */
import type { Enums } from "@/lib/supabase/database.types";

export type DocumentDisposition = Enums<"document_disposition">;
export type DocumentFlagCode = Enums<"document_flag_code">;
export type LenderDecisionKind = Enums<"lender_decision_kind">;

/** Document types a request can ask for. Requirement rules reference these keys. */
export const DOCUMENT_TYPES: ReadonlyArray<{ key: string; label: string; periodic: boolean }> = [
  { key: "bank_statement", label: "Business bank statement", periodic: true },
  { key: "processing_statement", label: "Card processing statement", periodic: true },
  { key: "government_id", label: "Government ID", periodic: false },
  { key: "voided_check", label: "Voided check / bank letter", periodic: false },
  { key: "application", label: "Signed application", periodic: false },
  { key: "business_tax_return", label: "Business tax return", periodic: false },
  { key: "personal_tax_return", label: "Personal tax return", periodic: false },
  { key: "pnl", label: "Profit & loss statement", periodic: false },
  { key: "balance_sheet", label: "Balance sheet", periodic: false },
  { key: "debt_schedule", label: "Business debt schedule", periodic: false },
  { key: "formation_document", label: "Formation / registration document", periodic: false },
  { key: "lease", label: "Lease", periodic: false },
  { key: "sba_form_1919", label: "SBA Form 1919", periodic: false },
  { key: "owner_financial_statement", label: "Owner financial statement", periodic: false },
  { key: "purchase_agreement", label: "Purchase agreement", periodic: false },
  { key: "other", label: "Other (lender stipulation)", periodic: false },
];

export function documentTypeLabel(key: string | null | undefined): string {
  if (!key) return "Document";
  return DOCUMENT_TYPES.find((d) => d.key === key)?.label ?? key.replace(/_/g, " ");
}

export const DISPOSITION_LABELS: Record<DocumentDisposition, string> = {
  pending_review: "Pending review",
  accepted: "Accepted for package",
  needs_correction: "Needs correction",
  not_accepted: "Not accepted",
  escalated: "Escalated",
};

/** Dispositions a reviewer may set. Pending is where an upload starts, never where it returns. */
export const REVIEWER_DISPOSITIONS: readonly DocumentDisposition[] = ["accepted", "needs_correction", "not_accepted", "escalated"];

export const DECISION_LABELS: Record<LenderDecisionKind, string> = {
  pending: "Pending",
  approved: "Approved",
  conditional: "Conditional approval",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

/** Client-safe meaning per flag code. Shown to reviewers next to the code; the only wording a client ever sees. */
export const FLAG_MEANINGS: Record<DocumentFlagCode, string> = {
  MISSING_REQUIRED_DOCUMENT: "A required document has not been received.",
  WRONG_DOCUMENT_TYPE: "The file does not appear to match the requested document.",
  UNREADABLE_DOCUMENT: "Some information cannot be reliably read.",
  MISSING_PAGE: "The document may be incomplete.",
  EXPIRED_DOCUMENT: "The document is outside its permitted validity period.",
  STALE_DOCUMENT: "The document is older than the requirement allows.",
  DUPLICATE_DOCUMENT: "This file appears to duplicate another upload.",
  DUPLICATE_PERIOD: "The same reporting period appears more than once.",
  STATEMENT_PERIOD_GAP: "The expected sequence of statements appears incomplete.",
  NAME_MISMATCH: "The name on the document does not match the expected party.",
  BUSINESS_NAME_MISMATCH: "The business identity needs confirmation.",
  ADDRESS_MISMATCH: "Addresses differ across the records.",
  APPLICATION_DATA_MISMATCH: "A value on the document differs from the application.",
  ACCOUNT_OWNERSHIP_MISMATCH: "The account owner requires verification.",
  ENTITY_VERIFICATION_MISMATCH: "Business registration or TIN data requires review.",
  FINANCIAL_PERIOD_MISMATCH: "Statements refer to inconsistent periods.",
  CALCULATION_VARIANCE: "Totals or arithmetic require review.",
  INCOME_VARIANCE: "Reported and documented income differ beyond tolerance.",
  PROPERTY_DATA_MISMATCH: "Property details differ across records.",
  VIN_MISMATCH: "Vehicle identifiers differ.",
  THIRD_PARTY_RISK_SIGNAL: "An external validator returned a review signal.",
  POSSIBLE_TAMPER_SIGNAL: "Additional verification is required for this document.",
  INSUFFICIENT_EXTRACTION_CONFIDENCE: "The system could not read this document reliably.",
  LENDER_SPECIFIC_EXCEPTION: "This does not clearly meet the lender's stated format or rule.",
  COMPLIANCE_REVIEW_REQUIRED: "A compliance exception requires authorized review.",
  PROCESSING_FAILURE: "Automated processing could not complete.",
};

/** yyyy-mm, the only period shape a request accepts. */
export const PERIOD_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export function periodLabel(period: string | null | undefined): string {
  if (!period || !PERIOD_PATTERN.test(period)) return "";
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Renewal opportunity states — an operational reminder over a funded deal, never eligibility. */
export type RenewalStatus = Enums<"renewal_status">;
export const RENEWAL_STATUS_LABEL: Record<RenewalStatus, string> = {
  monitoring: "Monitoring", review_due: "Review due", outreach: "Outreach", client_interested: "Client interested", new_file_created: "New file created", not_pursued: "Not pursued",
};

/** key → label, for lists that show a stored document type. */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(DOCUMENT_TYPES.map((d) => [d.key, d.label]));
