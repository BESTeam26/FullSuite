// Credit Intelligence Engine — AI auto-classification & auto-selection logic
// Consumes raw imported report items and produces categorized, dispositioned items
// with explainable AI reasoning. Frontend simulation of the engine described in the
// platform blueprint: DATA → FACT → EVIDENCE → ISSUE → DISPUTE.

export type Bureau = "EQ" | "EX" | "TU";
export type ItemKind = "Account" | "Inquiry" | "Personal" | "Public Record";

export type NegativeCategory =
  | "Inquiry"
  | "3rd-Party Collection"
  | "Charge-Off"
  | "Student Loan"
  | "Public Record"
  | "Late Payment"
  | "Repossession"
  | "Foreclosure";

export type PositiveCategory =
  "Open Positive Account" | "Closed Positive Account";

export type Category = NegativeCategory | PositiveCategory | "Neutral";

export type Disposition =
  | "dispute" // Dispute Items — selected this round
  | "undisputed" // Undisputed Items — negative but not yet selected
  | "never" // Never Dispute
  | "open-positive" // Open Positive Accounts
  | "closed-positive"; // Closed Positive Accounts

export interface RawReportItem {
  id: string;
  name: string;
  kind: ItemKind;
  subtype?: string; // e.g. "Revolving", "Auto Loan", "Collection", "Bankruptcy"
  balance?: string;
  /**
   * The credit limit as the report states it, when it states one. Absent is
   * meaningful: utilization is not computed for an account without it, rather
   * than computed from an assumed limit.
   */
  creditLimit?: string;
  status: string; // "Open", "Closed", "Collection", "Charge-Off", "Paid", etc.
  bureaus: Bureau[];
  dofd?: string;
  openDate?: string;
  linkedCreditor?: string; // for inquiries — creditor the inquiry is associated with
  remarks?: string;
  /**
   * What each bureau said, where the SOURCE proved which value belongs to
   * which bureau (CR-2). Absent is the ordinary case and means UNKNOWN — never
   * that the bureaus agree, and never reconstructible from `bureaus` above,
   * which lists who reports the account and not what any of them said.
   */
  records?: BureauValues[];
}

/**
 * One bureau's values for one item. Structurally the same shape as
 * `BureauRecord` in `dispute/condition-detector`, which is the canonical
 * per-bureau record; declared here because `credit-classification` is the
 * lower layer and may not import from `dispute/`.
 */
export interface BureauValues {
  bureau: Bureau;
  status?: string;
  paymentStatus?: string;
  accountType?: string;
  accountNumberMasked?: string;
  balance?: number;
  highBalance?: number;
  creditLimit?: number;
  pastDue?: number;
  monthlyPayment?: number;
  termMonths?: number;
  openDate?: string;
  dateClosed?: string;
  dateLastPayment?: string;
  dateLastActive?: string;
  dofd?: string;
  paymentHistory?: (string | null)[];
  remarks?: string;
}

export interface ClassifiedItem extends RawReportItem {
  category: Category;
  isNegative: boolean;
  isDerogatory: boolean;
  disposition: Disposition;
  aiReason: string;
  linkedOpenAccount?: string; // inquiry protection — name of open account it's tied to
  autoSelected: boolean;
  riskFlags: string[];
}

const COLLECTION_KEYWORDS = [
  "portfolio recovery",
  "lvnv",
  "midland",
  "arrow",
  "cavalry",
  "jefferson",
  "resurgent",
  "allied",
  "national credit",
  "collect",
  "recovery",
  "associates",
];

const STUDENT_KEYWORDS = [
  "navient",
  "sallie",
  "great lakes",
  "fedloan",
  "nelnet",
  "edfinancial",
  "student",
];

const PUBLIC_RECORD_KEYWORDS = [
  "bankruptcy",
  "judgment",
  "lien",
  "civil",
  "tax lien",
  "eviction",
];

const CHARGEOFF_KEYWORDS = ["charge", "charge-off", "charged off", "write-off"];

const POSITIVE_STATUS = ["open", "pays as agreed", "current", "paid", "closed"];

function norm(s: string) {
  return (s || "").toLowerCase();
}

function isDerogatoryStatus(status: string): boolean {
  const s = norm(status);
  return (
    s.includes("collection") ||
    s.includes("charge") ||
    s.includes("derogatory") ||
    s.includes("late") ||
    s.includes("repossession") ||
    s.includes("foreclosure") ||
    s.includes("default") ||
    (s.includes("settled") === false && s.includes("bankrupt"))
  );
}

function detectCategory(raw: RawReportItem): Category {
  const name = norm(raw.name);
  const sub = norm(raw.subtype || "");
  const status = norm(raw.status);
  const combined = `${name} ${sub} ${status}`;

  if (
    raw.kind === "Public Record" ||
    PUBLIC_RECORD_KEYWORDS.some((k) => combined.includes(k))
  ) {
    return "Public Record";
  }
  if (raw.kind === "Inquiry") return "Inquiry";
  if (
    COLLECTION_KEYWORDS.some((k) => name.includes(k)) ||
    status.includes("collection")
  ) {
    return "3rd-Party Collection";
  }
  if (CHARGEOFF_KEYWORDS.some((k) => combined.includes(k))) return "Charge-Off";
  if (STUDENT_KEYWORDS.some((k) => name.includes(k))) return "Student Loan";
  if (status.includes("repossession")) return "Repossession";
  if (status.includes("foreclosure")) return "Foreclosure";
  if (status.includes("late")) return "Late Payment";

  // Positive classification
  if (status.includes("open") && !isDerogatoryStatus(status))
    return "Open Positive Account";
  if (status.includes("closed") || status.includes("paid"))
    return "Closed Positive Account";

  return "Neutral";
}

/**
 * Core AI auto-selection engine.
 * Rules:
 *  - Derogatory negatives (collection, chargeoff, public record, late, repo, foreclosure,
 *    derogatory student loan) → auto-selected for dispute.
 *  - Inquiries: protected if linked to an OPEN positive account on file → Never Dispute.
 *    Unlinked hard inquiries → dispute candidate.
 *  - Open positive accounts (non-derogatory) → Open Positive (never dispute).
 *  - Closed positive → Closed Positive.
 */
export function classifyReport(rawItems: RawReportItem[]): ClassifiedItem[] {
  // Build open-account name index for inquiry protection
  const openAccountNames = rawItems
    .filter(
      (i) =>
        i.kind === "Account" &&
        norm(i.status).includes("open") &&
        !isDerogatoryStatus(i.status),
    )
    .map((i) => i.name);

  return rawItems.map((raw) => {
    const category = detectCategory(raw);
    const isNegative = ![
      "Open Positive Account",
      "Closed Positive Account",
      "Neutral",
    ].includes(category);
    const isDerogatory = isDerogatoryStatus(raw.status) || isNegative;

    const riskFlags: string[] = [];
    let disposition: Disposition;
    let aiReason = "";
    let linkedOpenAccount: string | undefined;
    let autoSelected = false;

    if (category === "Open Positive Account") {
      disposition = "open-positive";
      aiReason =
        "Open account in good standing. Disputing an active positive tradeline can damage the consumer's score and utilization. Protected from dispute.";
      riskFlags.push("Active positive tradeline");
    } else if (category === "Closed Positive Account") {
      disposition = "closed-positive";
      aiReason =
        "Closed account with positive history. Retains positive age/credit history. No dispute action recommended.";
    } else if (category === "Inquiry") {
      // Inquiry protection: is it linked to an open account?
      const link = openAccountNames.find((n) =>
        raw.linkedCreditor
          ? norm(n).includes(norm(raw.linkedCreditor)) ||
            norm(raw.linkedCreditor).includes(norm(n))
          : norm(n).includes(norm(raw.name)) ||
            norm(raw.name).includes(norm(n)),
      );
      if (link) {
        linkedOpenAccount = link;
        disposition = "never";
        aiReason = `Hard inquiry appears tied to open account "${link}". Disputing a legitimate inquiry tied to an account you opened can trigger a fraud flag or account review. Marked Never Dispute.`;
        riskFlags.push("Linked to open account");
      } else {
        disposition = "dispute";
        autoSelected = true;
        aiReason =
          "Unlinked hard inquiry with no corresponding open tradeline on file. Candidate for factual dispute (unauthorized/unsolicited inquiry).";
      }
    } else {
      // Negative / derogatory items → auto-select for dispute
      disposition = "dispute";
      autoSelected = true;
      aiReason = explainNegative(category, raw);
      if (raw.dofd)
        riskFlags.push(`DOFD ${raw.dofd} — verify 7-year reporting window`);
      if (category === "3rd-Party Collection")
        riskFlags.push("Validate chain of assignment / authorization");
      if (category === "Public Record")
        riskFlags.push("Verify court records & Satisfactions");
    }

    return {
      ...raw,
      category,
      isNegative,
      isDerogatory,
      disposition,
      aiReason,
      linkedOpenAccount,
      autoSelected,
      riskFlags,
    };
  });
}

function explainNegative(category: Category, raw: RawReportItem): string {
  switch (category) {
    case "3rd-Party Collection":
      return "Third-party collection account. Factual dispute path: validate the collector's authority, account ownership, balance accuracy, and DOFD. Requires consumer attestation and supporting evidence before dispute.";
    case "Charge-Off":
      return "Charge-off reported. Verify balance, DOFD, and whether the account was later settled/sold. Cross-bureau discrepancies are common here — run the Data Integrity Engine.";
    case "Student Loan":
      return "Student loan derogatory mark. Verify servicer, rehabilitation status, and DOFD. Federal loans have specific rehabilitation options beyond dispute.";
    case "Public Record":
      return "Public record (bankruptcy/lien/judgment). Verify accuracy, disposition, and the 7–10 year reporting window. Court documents are required evidence.";
    case "Late Payment":
      return "Late payment reported. Verify the payment history against bank statements for the disputed month. Factual dispute requires dated evidence.";
    case "Repossession":
      return "Repossession reported. Verify deficiency balance accuracy and date of first delinquency.";
    case "Foreclosure":
      return "Foreclosure reported. Verify reporting accuracy and the 7-year reporting window from completion.";
    default:
      return "Negative item detected. Run factual investigation before generating a dispute.";
  }
}

export const DISPOSITION_SECTIONS: {
  key: Disposition;
  label: string;
  description: string;
  tone: string;
}[] = [
  {
    key: "dispute",
    label: "Dispute Items",
    description:
      "AI-selected for this round — negatives with a factual dispute path",
    tone: "text-emerald-600",
  },
  {
    key: "undisputed",
    label: "Undisputed Items",
    description: "Negatives not yet selected — review before adding to a round",
    tone: "text-amber-600",
  },
  {
    key: "never",
    label: "Never Dispute Items",
    description: "Protected — inquiries tied to open accounts or flagged items",
    tone: "text-slate-500",
  },
  {
    key: "open-positive",
    label: "Open Positive Accounts",
    description:
      "Active accounts in good standing — disputing risks score damage",
    tone: "text-blue-600",
  },
  {
    key: "closed-positive",
    label: "Closed Positive Accounts",
    description: "Closed accounts retaining positive history & age",
    tone: "text-muted-foreground",
  },
];

export const NEGATIVE_CATEGORIES: NegativeCategory[] = [
  "Inquiry",
  "3rd-Party Collection",
  "Charge-Off",
  "Student Loan",
  "Public Record",
  "Late Payment",
  "Repossession",
  "Foreclosure",
];
