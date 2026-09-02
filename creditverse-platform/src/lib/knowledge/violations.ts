// Consumer-law violation reference patterns — used to flag potential issues
// for human/consumer review. Never treat a match here as a confirmed
// violation; it is a documentation and investigation prompt only.

export interface ViolationEntry {
  id: string;
  law: "FCRA" | "FDCPA" | "CROA" | "TSR / Reg V";
  title: string;
  citation: string;
  summary: string;
  redFlags: string[];
  requiredEvidence: string[];
  severity: "info" | "caution" | "high";
}

export const violationLibrary: ViolationEntry[] = [
  {
    id: "fcra-cross-bureau-balance",
    law: "FCRA",
    title: "Cross-bureau balance/status inconsistency",
    citation: "FCRA §§ 611, 623(a)(1)",
    summary:
      "The same tradeline reports materially different balances, statuses, or past-due amounts across bureaus for the same reporting period.",
    redFlags: [
      "Balance differs by more than a normal reporting-cycle timing gap",
      "One bureau shows 'closed' while others show 'open/collection'",
      "Past-due amount present on one report but $0 on another",
    ],
    requiredEvidence: [
      "Bank or creditor statement showing correct balance",
      "Settlement or payoff confirmation, if applicable",
      "Consumer attestation of the correct value",
    ],
    severity: "caution",
  },
  {
    id: "fcra-dofd-reaging",
    law: "FCRA",
    title: "Potential DOFD re-aging",
    citation: "FCRA § 605(c), § 623(a)(5)",
    summary:
      "Date of First Delinquency appears to move forward in time on a later report without a legitimate new delinquency, potentially extending the 7-year reporting window.",
    redFlags: [
      "DOFD changed between two snapshots with no new missed payment",
      "Account sold/transferred with a DOFD reset to the sale date",
      "DOFD inconsistent across bureaus for an account that has not been re-defaulted",
    ],
    requiredEvidence: [
      "Prior credit report snapshot showing the earlier DOFD",
      "Original account statements establishing the true delinquency date",
    ],
    severity: "high",
  },
  {
    id: "fcra-mixed-file",
    law: "FCRA",
    title: "Possible mixed file / identity mismatch",
    citation: "FCRA § 611(a), § 607(b)",
    summary:
      "Tradeline, inquiry, or personal information belongs to a different consumer with a similar name, SSN digit transposition, or shared address history.",
    redFlags: [
      "Account the consumer has no knowledge of, with an unfamiliar address",
      "Similar name/SSN pattern typical of file-merge errors",
    ],
    requiredEvidence: [
      "Consumer attestation of no knowledge/relationship to the account",
      "Government ID confirming correct identity details",
      "Full report showing the conflicting personal information",
    ],
    severity: "high",
  },
  {
    id: "fcra-obsolete-reporting",
    law: "FCRA",
    title: "Information past the obsolescence period",
    citation: "FCRA § 605",
    summary:
      "A negative item remains reported beyond the 7-year (or 10-year bankruptcy) window measured from the correct DOFD or filing date.",
    redFlags: [
      "DOFD plus 7 years has already passed and the item is still reporting",
      "Bankruptcy still reporting more than 10 years after filing",
    ],
    requiredEvidence: [
      "Confirmed DOFD or bankruptcy filing date",
      "Current report date to calculate elapsed time",
    ],
    severity: "high",
  },
  {
    id: "fcra-unverified-after-mov",
    law: "FCRA",
    title: "Verified without documented investigation (MOV concern)",
    citation: "FCRA § 611(a)(7), § 623(b)",
    summary:
      "A dispute came back 'verified' but the furnisher or CRA cannot articulate what records were reviewed — a basis to request Method of Verification, not an automatic violation.",
    redFlags: [
      "Generic 'verified as accurate' response with no described process",
      "Same exact response language across unrelated disputes",
    ],
    requiredEvidence: [
      "Copy of the dispute submitted and the response received",
      "MOV request letter and any reply",
    ],
    severity: "caution",
  },
  {
    id: "fdcpa-false-representation",
    law: "FDCPA",
    title: "False or misleading representation by a collector",
    citation: "FDCPA § 807, 15 U.S.C. § 1692e",
    summary:
      "A debt collector overstates the amount owed, misrepresents its legal status, or implies affiliation with a government agency or credit bureau.",
    redFlags: [
      "Collector claims the debt will be reported to law enforcement",
      "Amount demanded exceeds what is documented in the original creditor's records",
      "Threats of legal action the collector does not intend to take",
    ],
    requiredEvidence: [
      "Collection letters or call notes",
      "Original creditor documentation of the true balance",
    ],
    severity: "high",
  },
  {
    id: "fdcpa-no-validation",
    law: "FDCPA",
    title: "Failure to provide debt validation",
    citation: "FDCPA § 809, 15 U.S.C. § 1692g",
    summary:
      "Consumer requested validation within 30 days of initial contact and the collector continued collection activity without providing it.",
    redFlags: [
      "Written validation request sent and unanswered",
      "Continued reporting or collection calls after a timely validation request",
    ],
    requiredEvidence: [
      "Copy of the validation request with proof of mailing/delivery",
      "Timeline of subsequent collector activity",
    ],
    severity: "high",
  },
  {
    id: "fdcpa-time-barred",
    law: "FDCPA",
    title: "Collection on time-barred (out-of-statute) debt",
    citation: "FDCPA § 807/808 (general prohibitions)",
    summary:
      "A collector pursues or threatens legal action on a debt outside the applicable state statute of limitations without required disclosures.",
    redFlags: [
      "Last activity date suggests the state SOL has expired",
      "Threat of lawsuit despite an expired limitations period",
    ],
    requiredEvidence: [
      "Original charge-off / last-payment date",
      "State statute-of-limitations reference for the debt type",
    ],
    severity: "caution",
  },
  {
    id: "croa-advance-fee",
    law: "CROA",
    title: "Advance fee for covered credit-repair services",
    citation: "CROA § 404(b), 15 U.S.C. § 1679b(b)",
    summary:
      "A company charges or collects a fee for credit-repair services before those services are fully performed.",
    redFlags: [
      "Upfront 'setup fee' charged before any dispute work occurs",
      "Recurring fee billed automatically regardless of completed service events",
    ],
    requiredEvidence: [
      "Contract terms and billing history",
      "Service-completion timeline vs. charge dates",
    ],
    severity: "high",
  },
  {
    id: "croa-guarantee-claims",
    law: "CROA",
    title: "Untrue or misleading representations",
    citation: "CROA § 404(a), 15 U.S.C. § 1679b(a)",
    summary:
      "Marketing or sales language guarantees specific results (deletions, score increases) that cannot be lawfully promised.",
    redFlags: [
      '"Guaranteed deletion" or "we\'ll raise your score 100 points" claims',
      "Implying every negative item can be legally removed regardless of accuracy",
    ],
    requiredEvidence: ["Marketing copy, scripts, or recorded sales calls"],
    severity: "high",
  },
  {
    id: "croa-no-written-contract",
    law: "CROA",
    title: "Missing required written contract or disclosures",
    citation: "CROA §§ 405–406, 15 U.S.C. §§ 1679c–1679d",
    summary:
      "Consumer was not given a compliant written contract with statutorily required disclosures and a cancellation right before service began.",
    redFlags: [
      "No signed contract on file",
      "Contract missing the 3-business-day cancellation notice",
    ],
    requiredEvidence: [
      "Signed contract copy",
      "Disclosure acknowledgment records",
    ],
    severity: "high",
  },
  {
    id: "tsr-telemarketing-fee-timing",
    law: "TSR / Reg V",
    title: "Telemarketed fee collected before the required waiting period",
    citation: "TSR 16 C.F.R. § 310.4(a)(2)",
    summary:
      "For telemarketed credit-repair sales, a fee is requested or received before documented results have been achieved and maintained for six months.",
    redFlags: [
      "Fee charged immediately after a telemarketed sale with no documented results",
      "No record of the promised result being verified more than 6 months prior",
    ],
    requiredEvidence: [
      "Acquisition-channel record (telemarketing flag)",
      "Documented result and the date it was achieved",
    ],
    severity: "high",
  },
];
