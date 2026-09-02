// Metro 2 field reference — conceptual/educational summaries only.
// The authoritative field/code definitions live in the CDIA Metro 2 Format
// Guide, licensed to furnishers, processors, qualifying software vendors, and
// CRAs. Treat this as training content, not the specification itself.

export interface Metro2Field {
  code: string;
  label: string;
  category:
    "Base Segment" | "Compliance Condition" | "Special Comment" | "Dates";
  meaning: string;
  note?: string;
}

export const metro2Fields: Metro2Field[] = [
  {
    code: "Base Segment",
    label: "Base Segment",
    category: "Base Segment",
    meaning:
      "The core account record: identification, account number, dates, balances, and status. Every tradeline reported by a furnisher has exactly one Base Segment per reporting cycle.",
  },
  {
    code: "DOFD",
    label: "Date of First Delinquency",
    category: "Dates",
    meaning:
      "The date the account first became delinquent and was never subsequently brought current. Governs the FCRA §605 7-year removal clock and cannot legally be re-aged by re-reporting.",
    note: "One of the highest-value factual review points — compare DOFD across all three bureaus for the same tradeline.",
  },
  {
    code: "Date Reported",
    label: "Date Reported / Date of Account Information",
    category: "Dates",
    meaning:
      "The 'as-of' date for the data in that reporting cycle. Should update monthly for actively reported accounts; a stale date can indicate a furnisher reporting gap.",
  },
  {
    code: "Account Status",
    label: "Account Status Code",
    category: "Base Segment",
    meaning:
      "Two-digit code describing current standing (e.g., current, 30/60/90+ days past due, collection, charge-off, closed). Bureau-to-bureau mismatches here are common factual review candidates.",
  },
  {
    code: "Payment History Profile",
    label: "Payment History Profile (PHP)",
    category: "Base Segment",
    meaning:
      "A 24-month (or longer) grid of monthly payment ratings. Inconsistent PHP entries across bureaus for the same account/month are a frequent, well-documented factual discrepancy.",
  },
  {
    code: "Compliance Condition Code",
    label: "Compliance Condition Code",
    category: "Compliance Condition",
    meaning:
      "A furnisher-set code communicating dispute or compliance status of the account to the CRAs (e.g., account is under dispute/reinvestigation, disputed after resolution, or closed at consumer's request).",
    note: "Exact code values are defined in the current CDIA Metro 2 specification, which is licensed to furnishers, processors, qualifying software vendors, and CRAs. Treat any code table shown in tooling as illustrative until verified against the licensed spec for your furnisher relationship.",
  },
  {
    code: "Special Comment Code",
    label: "Special Comment Code",
    category: "Special Comment",
    meaning:
      "Narrative-style code adding context (e.g., paid/closed, settled for less than full balance, affected by natural disaster). Useful for confirming a consumer's factual narrative against what was actually furnished.",
  },
  {
    code: "Consumer Information Indicator",
    label: "Consumer Information Indicator (CII)",
    category: "Compliance Condition",
    meaning:
      "Flags specific consumer situations such as active-duty military, or that the consumer disputes this information. Used to trigger special handling by the CRA/furnisher.",
  },
  {
    code: "ECOA Code",
    label: "ECOA / Account Designator",
    category: "Base Segment",
    meaning:
      "Identifies the consumer's relationship to the account: individual, joint, authorized user, terminated, etc. Frequently the actual factual issue behind a 'this isn't my debt' dispute.",
  },
  {
    code: "Balance / Amount Past Due",
    label: "Current Balance & Amount Past Due",
    category: "Base Segment",
    meaning:
      "Dollar fields updated each cycle. A furnished balance that conflicts with a settlement letter, payoff confirmation, or another bureau's balance is a core Data Integrity Engine flag.",
  },
];
