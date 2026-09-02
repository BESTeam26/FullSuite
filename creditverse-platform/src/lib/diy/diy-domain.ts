// BES DIY Credit — Domain Logic & State Architecture
//
// BES DIY Credit is a B2B2C white-label SaaS. BES sells the software to an
// Organization. That Organization offers the DIY credit experience to its own
// consumers under its brand. BES does NOT sell DIY Credit directly to
// consumers in this model.
//
// ONE shared credit-intelligence foundation, but:
//   - DIY consumer experience = simple, consumer-controlled
//   - CreditOps professional experience = operational, team-driven
//
// One Person can move through multiple services without losing the original
// referral source or creating duplicate identities.

// ---------------------------------------------------------------------------
// Service types & entitlements
// ---------------------------------------------------------------------------

export type ServiceType =
  | "diy" // BES DIY Credit
  | "creditops" // BES CreditOps
  | "fundingops"; // BES FundingOps

export type EntitlementKey = "diyCredit" | "creditOps" | "fundingOps" | "crm";

export interface OrganizationEntitlements {
  diyCredit: boolean;
  creditOps: boolean;
  fundingOps: boolean;
  crm: boolean;
}

export const ALL_ENTITLED: OrganizationEntitlements = {
  diyCredit: true,
  creditOps: true,
  fundingOps: true,
  crm: true,
};

export const DIY_ONLY_ENTITLED: OrganizationEntitlements = {
  diyCredit: true,
  creditOps: false,
  fundingOps: false,
  crm: false,
};

// ---------------------------------------------------------------------------
// White-label / branding
// ---------------------------------------------------------------------------

export interface WhiteLabelConfig {
  programName: string; // consumer-facing brand, e.g. "ABC Credit Builder"
  logoUrl?: string;
  primaryColor?: string; // hex
  supportEmail?: string;
  supportPhone?: string;
  welcomeCopy?: string;
  helpLinks?: { label: string; url: string }[];
  portalName?: string;
  disclosures?: string;
  termsUrl?: string;
  customDomain?: string; // future — Domain Required marker
}

export const DEFAULT_WHITE_LABEL: WhiteLabelConfig = {
  programName: "BES DIY Credit",
  welcomeCopy:
    "You're in control. Nothing is sent on your behalf without your review and approval.",
  portalName: "DIY Credit",
};

// ---------------------------------------------------------------------------
// Person / Client 360 — one identity across the ecosystem
// ---------------------------------------------------------------------------

export type PersonStatus = "active" | "invited" | "paused" | "archived";

export interface Person {
  id: string;
  name: string;
  email: string;
  phone?: string;
  // Previous address option — collected but optional
  currentAddress?: string;
  previousAddress?: string;
  status: PersonStatus;
  createdAt: string;

  // Service enrollments — each is a SEPARATE record.
  // A person can have multiple without duplicating identity.
  diy?: DiyEnrollment;
  creditops?: CreditOpsEnrollment;
  fundingops?: FundingOpsEnrollment;

  // Referral attribution (preserved even if the consumer later adds services)
  attribution?: ReferralSource;
}

export interface ReferralSource {
  partnerId: string;
  partnerName: string;
  referralCode?: string;
  firstReferralDate: string;
  source: "BES DIY Credit" | "Direct" | "Partner";
}

export type DiyStatus =
  | "invited"
  | "joined"
  | "consenting"
  | "importing"
  | "reviewing"
  | "in-progress"
  | "awaiting-reimport"
  | "completed";

export interface DiyEnrollment {
  personId: string;
  status: DiyStatus;
  journeyStep: DiyJourneyStep;
  signupDate: string;
  plan: DiyPlan;
  progressPct: number;
  lastReportDate?: string;
  nextReviewDate?: string;
}

export type DiyPlan = "free" | "one-time" | "monthly" | "included" | "invite";

export interface CreditOpsEnrollment {
  personId: string;
  status:
    "suggested" | "offered" | "requested" | "accepted" | "active" | "declined";
  caseId?: string;
  activatedDate?: string;
}

export interface FundingOpsEnrollment {
  personId: string;
  status:
    "suggested" | "offered" | "requested" | "accepted" | "active" | "declined";
  dealId?: string;
  fundingGoal?: string;
  requestedAmount?: number;
  targetTimeline?: string;
}

// ---------------------------------------------------------------------------
// Conversion tracking — count only when service enrollment actually changes
// ---------------------------------------------------------------------------

export type ConversionType =
  | "diy_to_managed_credit"
  | "diy_to_funding_readiness"
  | "diy_to_fundingops"
  | "managed_credit_to_fundingops"
  | "fundingops_to_diy"
  | "fundingops_to_managed_credit";

export type ConversionState =
  "suggested" | "offered" | "requested" | "accepted" | "declined" | "completed";

export interface ConversionRecord {
  id: string;
  personId: string;
  type: ConversionType;
  state: ConversionState;
  createdDate: string;
  completedDate?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Guided DIY journey — step-based, consumer-controlled
// ---------------------------------------------------------------------------

export type DiyJourneyStep =
  | "join"
  | "consent"
  | "connect-report"
  | "review-profile"
  | "confirm-personal"
  | "review-accounts"
  | "review-inquiries"
  | "identify-issues"
  | "confirm-facts"
  | "upload-evidence"
  | "action-plan"
  | "prepare-communication"
  | "consumer-review"
  | "consumer-approval"
  | "send-download-track"
  | "wait-monitor"
  | "reimport"
  | "compare-results"
  | "next-action"
  | "progress-review";

export const JOURNEY_STEPS: { key: DiyJourneyStep; label: string }[] = [
  { key: "join", label: "Join Program" },
  { key: "consent", label: "Consent & Disclosures" },
  { key: "connect-report", label: "Connect / Upload Report" },
  { key: "review-profile", label: "Review Credit Profile" },
  { key: "confirm-personal", label: "Confirm Personal Info" },
  { key: "review-accounts", label: "Review Accounts" },
  { key: "review-inquiries", label: "Review Inquiries" },
  { key: "identify-issues", label: "Identify Potential Issues" },
  { key: "confirm-facts", label: "Confirm Facts" },
  { key: "upload-evidence", label: "Upload Evidence" },
  { key: "action-plan", label: "Build Action Plan" },
  { key: "prepare-communication", label: "Prepare Communication" },
  { key: "consumer-review", label: "Consumer Review" },
  { key: "consumer-approval", label: "Consumer Approval" },
  { key: "send-download-track", label: "Send / Download / Track" },
  { key: "wait-monitor", label: "Wait & Monitor" },
  { key: "reimport", label: "Reimport Updated Report" },
  { key: "compare-results", label: "Compare Results" },
  { key: "next-action", label: "Next Action" },
  { key: "progress-review", label: "Progress Review" },
];

// ---------------------------------------------------------------------------
// Report import UI states — provider-agnostic
// ---------------------------------------------------------------------------

export type ImportProvider =
  | "SmartCredit"
  | "IdentityIQ"
  | "MyScoreIQ"
  | "MyFreeScoreNow"
  | "Manual PDF Upload";

export const IMPORT_PROVIDERS: ImportProvider[] = [
  "SmartCredit",
  "IdentityIQ",
  "MyScoreIQ",
  "MyFreeScoreNow",
  "Manual PDF Upload",
];

export type ImportState =
  | "not-connected"
  | "connected"
  | "importing"
  | "processing"
  | "analysis-complete"
  | "needs-review"
  | "failed";

// ---------------------------------------------------------------------------
// DIY issue — consumer-facing, evidence-linked, consumer-confirmed
// ---------------------------------------------------------------------------

export type IssueStatus =
  | "potential"
  | "observed"
  | "needs-confirmation"
  | "evidence-needed"
  | "needs-review"
  | "confirmed"
  | "disputed"
  | "resolved";

export interface DiyIssue {
  id: string;
  accountName: string;
  accountNumber?: string;
  bureau: string;
  field: string; // e.g. "Balance", "Status"
  reportedValue: string;
  consumerBelieves?: string;
  whyFlagged: string;
  status: IssueStatus;
  evidenceIds: string[];
  consumerConfirmed: boolean;
  attested: boolean;
}

// ---------------------------------------------------------------------------
// Truth Gate — required before any dispute or formal communication
// ---------------------------------------------------------------------------

export interface TruthGateAnswer {
  recognizesAccount: "yes" | "no" | "unsure";
  whatIsInaccurate?: string;
  whyInaccurate?: string;
  evidenceSummary?: string;
  attested: boolean;
}

export const isTruthGateComplete = (a: TruthGateAnswer): boolean => {
  if (!a.recognizesAccount) return false;
  if (a.recognizesAccount === "no" || a.recognizesAccount === "unsure") {
    // Identity theft route needs separate explicit workflow — never infer it
    return a.attested;
  }
  return Boolean(a.whatIsInaccurate && a.whyInaccurate && a.attested);
};

// ---------------------------------------------------------------------------
// Action plan — consumer-facing next steps
// ---------------------------------------------------------------------------

export type ActionType =
  | "review-information"
  | "gather-evidence"
  | "correct-personal-info"
  | "prepare-dispute"
  | "contact-furnisher"
  | "request-documentation"
  | "monitor-account"
  | "reduce-utilization"
  | "build-positive-history"
  | "wait-recheck"
  | "human-help-recommended";

export interface ActionPlanItem {
  id: string;
  type: ActionType;
  label: string;
  why: string;
  needed: string;
  nextStep: string;
  done: boolean;
}

// ---------------------------------------------------------------------------
// Evidence / documents
// ---------------------------------------------------------------------------

export interface EvidenceDoc {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  attachedToIssueIds: string[];
}

// ---------------------------------------------------------------------------
// Report snapshots — NEVER overwrite previous imports
// ---------------------------------------------------------------------------

export interface ReportSnapshot {
  id: string;
  personId: string;
  importedAt: string;
  provider: ImportProvider;
  state: ImportState;
  scores: { eq?: number; ex?: number; tu?: number };
  issues: DiyIssue[];
}

// ---------------------------------------------------------------------------
// Activity / audit
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  id: string;
  personId: string;
  type: string;
  label: string;
  date: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Entitlement gating — hide DIY module completely when not enabled
// ---------------------------------------------------------------------------

export const isDiyEntitled = (e: OrganizationEntitlements): boolean =>
  e.diyCredit === true;

export const isCreditOpsEntitled = (e: OrganizationEntitlements): boolean =>
  e.creditOps === true;

export const isFundingOpsEntitled = (e: OrganizationEntitlements): boolean =>
  e.fundingOps === true;

// Valid setups for DIY independence
export const VALID_DIY_SETUPS = [
  ["diyCredit"],
  ["diyCredit", "creditOps"],
  ["diyCredit", "fundingOps"],
  ["diyCredit", "creditOps", "fundingOps"],
  ["diyCredit", "creditOps", "fundingOps", "crm"],
];
