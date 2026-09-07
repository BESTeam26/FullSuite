/**
 * What is actually wrong with this item — read from the report, never typed.
 *
 * This is the hardcoded half of the dispute engine. The reason LIBRARY is data
 * (Dee edits the wording); the conditions below are code, because they decide
 * which reason a bureau receives and that decision must be identical every
 * time, explainable afterwards, and impossible for a model to influence
 * (rule 9).
 *
 * Every condition is one of two things:
 *
 *   • a FACT VISIBLE IN THE REPORT — a balance that differs between bureaus, a
 *     charge-off carrying a balance, a 90-day mark with no 30-day mark before
 *     it, a date of last activity earlier than the date the account opened;
 *   • a FACT THE CONSUMER SIGNED — identity theft, breach impact, "I was never
 *     late". These arrive as attestations and are passed in; nothing here
 *     infers them.
 *
 * What it deliberately never does: guess. A missing field is reported as
 * missing, not assumed to be zero. Two accounts with similar names are two
 * accounts (rule 4). An absent value and a zero value are different things,
 * which is the single most common way a credit-report parser produces a
 * confident lie.
 */
import type { Bureau, ClassifiedItem } from "@/lib/credit-classification";
import type { ReasonCondition } from "./reason-catalogue";

/** One bureau's version of a single account. */
export interface BureauRecord {
  bureau: Bureau;
  status?: string;
  paymentStatus?: string;
  balance?: number;
  highBalance?: number;
  creditLimit?: number;
  pastDue?: number;
  monthlyPayment?: number;
  termMonths?: number;
  openDate?: string;
  dateLastActive?: string;
  dateLastPayment?: string;
  dateClosed?: string;
  dofd?: string;
  accountNumberMasked?: string;
  accountType?: string;
  /** Oldest first. "OK" | "30" | "60" | "90" | "120" | "150" | "180" | "CO" | null */
  paymentHistory?: (string | null)[];
  remarks?: string;
}

/** What the consumer has signed. Never inferred, never defaulted to true. */
export interface ConsumerAttestations {
  identityTheft?: boolean;
  breachImpact?: boolean;
  neverLate?: boolean;
  notMine?: boolean;
  noWrittenConsent?: boolean;
  requestedProofNoneGiven?: boolean;
  collectorStillContacting?: boolean;
}

/** What we ourselves did before, from our own records — not from the report. */
export interface DisputeHistory {
  priorRounds: number;
  lastResponseAt?: string | null;
  everDeletedThenReturned?: boolean;
  verificationRequestedNotProduced?: boolean;
  notatedAsDisputed?: boolean;
}

export interface DetectionInput {
  item: ClassifiedItem;
  /** One entry per bureau reporting this account. */
  records: BureauRecord[];
  /** Bureaus that used to report it and no longer do. */
  deletedFromBureaus?: Bureau[];
  attestations?: ConsumerAttestations;
  history?: DisputeHistory;
}

/**
 * The Metro 2 fields a tradeline is expected to carry. A blank here is the
 * "Data is MISSING and/or DEFICIENTLY reported" case — one of the most
 * productive disputes there is, because it needs no argument: the field is
 * either populated or it is not.
 */
export const EXPECTED_FIELDS = [
  "accountNumberMasked", "accountType", "status", "paymentStatus", "monthlyPayment",
  "openDate", "balance", "termMonths", "highBalance", "creditLimit", "pastDue",
  "dateLastActive", "dateLastPayment",
] as const;
export type ExpectedField = (typeof EXPECTED_FIELDS)[number];

/** Human labels, for the letter and for the reviewer. */
export const FIELD_LABELS: Record<ExpectedField, string> = {
  accountNumberMasked: "Account #",
  accountType: "Account Type",
  status: "Account Status",
  paymentStatus: "Payment Status",
  monthlyPayment: "Monthly Payment",
  openDate: "Date Opened",
  balance: "Balance",
  termMonths: "No. of Months (Terms)",
  highBalance: "High Credit",
  creditLimit: "Credit Limit",
  pastDue: "Past Due",
  dateLastActive: "Date Last Active",
  dateLastPayment: "Date of Last Payment",
};

/**
 * How sure we are, in the vocabulary the BES dispute specification uses.
 *
 *   confirmed     the report itself establishes it. May be stated as fact.
 *   apparent      it looks wrong, and a legitimate explanation exists. May be
 *                 asked as a specific, neutral question. NEVER asserted.
 *   not_an_error  it looks wrong to the untrained eye and is not. Recorded so
 *                 nobody disputes it, and so a reviewer can see it was
 *                 considered rather than missed.
 *
 * This distinction is the whole ballgame. A letter full of "violations" that
 * are really normal reporting is how a dispute gets dismissed as frivolous —
 * and how a credit repair organization ends up asserting things it cannot
 * support. Only `confirmed` findings may be stated as facts.
 */
export type Confidence = "confirmed" | "apparent" | "not_an_error";

export interface Finding {
  condition: ReasonCondition;
  confidence: Confidence;
  /** Plain, checkable, never a conclusion. */
  observation: string;
  /** For an apparent finding: the fact that would settle it either way. */
  needs?: string;
}

export interface DetectionResult {
  /** Everything found, with how sure we are. */
  findings: Finding[];
  /** Only the confirmed ones — what a reason may be built on. */
  conditions: ReasonCondition[];
  /** Apparent ones, for the questions section and the reviewer's queue. */
  questions: Finding[];
  /** Considered and ruled out, so nobody disputes normal reporting. */
  ruledOut: Finding[];
  /** Which expected fields no bureau populated. Feeds the missing-data letter. */
  missingFields: ExpectedField[];
  evidence: string[];
}

const LATE_CODES = new Set(["30", "60", "90", "120", "150", "180"]);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const norm = (v?: string) => (v ?? "").trim().toLowerCase();

/** Distinct non-empty values of one field across the bureaus reporting it. */
function distinct<K extends keyof BureauRecord>(records: BureauRecord[], key: K): unknown[] {
  const seen = new Set<string>();
  for (const r of records) {
    const v = r[key];
    if (v === undefined || v === null || v === "") continue;
    seen.add(typeof v === "number" ? v.toFixed(2) : String(v).trim().toLowerCase());
  }
  return [...seen];
}

/** Months since the epoch, so two dates can be compared without a timezone. */
function ym(date?: string): number | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function detectConditions(input: DetectionInput): DetectionResult {
  const { item, records } = input;
  const att = input.attestations ?? {};
  const hist = input.history;
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add = (condition: ReasonCondition, confidence: Confidence, observation: string, needs?: string) => {
    const key = `${condition}|${observation}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ condition, confidence, observation, needs });
  };

  /* ---- Cross-bureau comparisons. ----
     A difference between bureaus is a real observation and a fair question.
     It is NOT a violation on its own: furnishers choose which bureaus they
     report to, and the BES specification is explicit that neither
     single-bureau reporting nor a deletion elsewhere proves anything. */
  if (records.length === 1) {
    add("single_bureau_only", "apparent",
      `Only ${records[0].bureau} is reporting this account.`,
      "Whether the furnisher reports to this bureau alone by choice, which is permitted and common for specialty furnishers.");
  }
  if ((input.deletedFromBureaus?.length ?? 0) > 0) {
    add("deleted_from_other_bureaus", "apparent",
      `Deleted by ${input.deletedFromBureaus!.join(", ")}; still reported by ${records.map((r) => r.bureau).join(", ")}.`,
      "How this bureau independently verified data another bureau removed. One bureau's deletion does not legally bind another.");
  }
  if (records.length > 1) {
    if (distinct(records, "balance").length > 1) {
      add("balance_inconsistent", "confirmed", "The balance differs between the bureaus reporting this account.");
    }
    if (distinct(records, "status").length > 1 || distinct(records, "paymentStatus").length > 1) {
      add("status_inconsistent", "confirmed", "The account or payment status differs between the bureaus reporting this account.");
    }
    for (const f of ["openDate", "dateLastActive", "dateLastPayment", "dateClosed", "dofd"] as (keyof BureauRecord)[]) {
      if (distinct(records, f).length > 1) {
        add("dates_inconsistent", "confirmed", `${String(f)} differs between the bureaus reporting this account.`);
        break;
      }
    }
    const histories = records.filter((r) => r.paymentHistory?.length).map((r) => (r.paymentHistory ?? []).join(","));
    if (new Set(histories).size > 1) {
      add("payment_history_inconsistent", "confirmed", "The payment history differs between the bureaus reporting this account.");
    }
  }

  /* ---- One bureau's record against itself. ----
     Most of what looks like a contradiction here is normal reporting, and the
     specification's false-positive list is applied literally. */
  const isCollection = item.category === "3rd-Party Collection";
  for (const r of records) {
    const status = norm(r.status);
    const pay = norm(r.paymentStatus);
    const bal = num(r.balance);
    const high = num(r.highBalance);
    const late = (r.paymentHistory ?? []).filter((m) => m && LATE_CODES.has(m));

    if (status.includes("charge") && (bal ?? 0) > 0) {
      /* A charge-off is an accounting event, not forgiveness: the debt can
         still be owed and the balance can still grow. Only the consumer's own
         evidence (a 1099-C, a settlement, a payoff) settles it. */
      add("charge_off_with_balance", "apparent",
        `${r.bureau} reports a charge-off carrying a balance of ${bal}.`,
        "Whether the debt is still legally owed. A charged-off balance is permitted when it is.");
    }
    if ((status.includes("collection") || isCollection) && (num(r.pastDue) ?? 0) > 0) {
      /* Explicitly NOT an error. A collection is allowed to report an amount
         past due, and disputing it is the fastest way to look uninformed. */
      add("collection_with_past_due", "not_an_error",
        `${r.bureau} reports a past-due amount on a collection, which is permitted.`);
    }
    if ((status.includes("discharge") || norm(r.remarks).includes("bankruptcy")) && (bal ?? 0) > 0) {
      add("discharged_with_balance", "apparent",
        `${r.bureau} reports a balance on an account shown as discharged.`,
        "The Consumer Information Indicator, whether this debt was in the discharge, and whether it was reaffirmed or belongs to a non-filer.");
    }
    if ((status.includes("paid") || pay.includes("current") || pay.includes("pays as agreed")) && late.length > 0) {
      /* A payment RATING can describe the account before it was paid, and a
         current account keeps its history. Normal unless the consumer says the
         lates never happened. */
      add("paid_status_but_late_marks",
        att.neverLate ? "apparent" : "not_an_error",
        `${r.bureau} shows the account as ${r.status ?? r.paymentStatus} with ${late.length} historical late mark(s).`,
        att.neverLate ? "The consumer states no payment was ever late; documentation of on-time payment for those months would confirm it." : undefined);
    }
    if (bal !== undefined && high !== undefined && bal > high) {
      add("balance_above_high_credit", "apparent",
        `${r.bureau} reports a balance (${bal}) above the high credit (${high}).`,
        "Whether fees or accrued interest account for the difference, which is legitimate.");
    }
    /* A jump to 90 with no 30 before it is worth asking about, but deferment,
       forbearance, a cure, missing months and reporting cadence all produce it
       legitimately. It is a question, never an assertion. */
    const hist2 = r.paymentHistory ?? [];
    const firstSevere = hist2.findIndex((m) => m && ["90", "120", "150", "180"].includes(m));
    if (firstSevere >= 0 && hist2.slice(0, firstSevere).filter((m) => m === "30").length === 0) {
      add("severe_late_without_prior_30", "apparent",
        `${r.bureau} reports a ${hist2[firstSevere]}-day mark with no 30-day mark before it.`,
        "The monthly sequence, any missing months, and whether deferment, forbearance or a cure explains the jump.");
    }
    if (late.length === 1) add("single_late_mark", "confirmed", `${r.bureau} reports one late mark.`);
    if (late.length > 1) add("multiple_late_marks", "confirmed", `${r.bureau} reports ${late.length} late marks.`);

    /* Activity before the account existed is not explainable. This one is
       genuinely impossible and may be stated as a fact. */
    const opened = ym(r.openDate);
    const active = ym(r.dateLastActive);
    if (opened !== undefined && active !== undefined && active < opened) {
      add("dola_before_open_date", "confirmed",
        `${r.bureau} reports last activity (${r.dateLastActive}) before the account opened (${r.openDate}).`);
    }
  }

  /* ---- Missing data. ----
     A blank is a fact. Whether it is a DEFECT depends on the account: a
     collection is intentionally blank on monthly payment, credit limit, terms
     and payment history, so demanding them there is the classic false
     positive the specification warns about. */
  const COLLECTION_BLANKS: ExpectedField[] = ["monthlyPayment", "creditLimit", "termMonths", "highBalance"];
  const missingFields: ExpectedField[] = [];
  for (const f of EXPECTED_FIELDS) {
    const anyPopulated = records.some((r) => {
      const v = r[f as keyof BureauRecord];
      return v !== undefined && v !== null && v !== "";
    });
    if (!anyPopulated) missingFields.push(f);
  }
  const meaningful = missingFields.filter((f) => !(isCollection && COLLECTION_BLANKS.includes(f)));
  const expectedBlanks = missingFields.filter((f) => isCollection && COLLECTION_BLANKS.includes(f));
  if (meaningful.length > 0) {
    add("data_missing_or_deficient", "confirmed",
      `Not reported by any bureau: ${meaningful.map((f) => FIELD_LABELS[f]).join(", ")}.`);
  }
  if (expectedBlanks.length > 0) {
    add("data_missing_or_deficient", "not_an_error",
      `Blank on this collection, as expected: ${expectedBlanks.map((f) => FIELD_LABELS[f]).join(", ")}.`);
  }

  /* ---- The delinquency date, which is expected only sometimes. ----
     DOFD is deliberately NOT in EXPECTED_FIELDS. On an account that has never
     been late there is no delinquency to date, and demanding one everywhere
     would flag every healthy tradeline on the file.

     Where the account's OWN reporting says it went bad, the absence matters
     more than any other blank: § 1681c(a)(4) runs the reporting period from
     that date, so without it nothing determines when the account must come
     off. It is raised as APPARENT rather than confirmed, because "the bureau
     does not report it" and "our import did not capture it" are different
     problems with the same appearance, and only a person looking at the report
     can tell them apart. Missing source data is a review task, never a
     reporting violation on its own. */
  const derogatoryText = `${norm(item.status)} ${norm(item.subtype)} ${records.map((r) => `${norm(r.status)} ${norm(r.paymentStatus)} ${norm(r.remarks)}`).join(" ")}`;
  const derogatoryNow = /charge|collection|repossess|foreclos|default|delinq|past due|write[- ]?off|settled/.test(derogatoryText);
  const everLate = records.some((r) => (r.paymentHistory ?? []).some((m) => m && LATE_CODES.has(m)));
  const dofdIsRelevant = isCollection || derogatoryNow || everLate;
  const dofdReported = records.some((r) => r.dofd !== undefined && r.dofd !== null && r.dofd !== "");

  if (dofdIsRelevant && !dofdReported) {
    add("data_missing_or_deficient", "apparent",
      "No date of first delinquency is reported by any bureau on an account reported as delinquent. That date is what determines when the account must stop being reported.",
      "Whether the bureau omits the date or the import did not capture it — read it off the report before anything is disputed.");
  }
  if (!dofdIsRelevant) {
    add("data_missing_or_deficient", "not_an_error",
      "No date of first delinquency, and none is expected — nothing on this account is reported as delinquent.");
  }

  /* ---- Account shape. Facts, not findings. ---- */
  const sub = norm(item.subtype);
  if (sub.includes("auto")) add("auto_loan", "confirmed", "Auto loan.");
  if (item.category === "Student Loan" || sub.includes("student")) add("student_loan", "confirmed", "Student loan.");
  if (sub.includes("medical") || norm(item.name).includes("medical")) add("medical", "confirmed", "Medical account.");
  if (sub.includes("revolving") && norm(item.status).includes("open")) add("open_revolving", "confirmed", "Open revolving account.");

  /* ---- Our own procedural history. ---- */
  if (hist) {
    if (hist.priorRounds > 0 && !hist.lastResponseAt) {
      add("prior_dispute_unanswered", "confirmed", `${hist.priorRounds} prior dispute(s) with no response recorded.`);
    }
    if (hist.notatedAsDisputed === false) {
      add("not_notated_as_disputed", "confirmed", "The account is not marked as disputed after our notice.");
    }
    if (hist.everDeletedThenReturned) {
      add("reinserted_after_deletion", "confirmed", "This item was deleted and later reappeared.");
    }
    if (hist.verificationRequestedNotProduced) {
      add("verification_not_produced", "confirmed", "A description of the verification procedure was requested and not produced.");
    }
  }

  /* ---- Signed consumer statements. Never inferred. ---- */
  if (att.identityTheft) add("attested_identity_theft", "confirmed", "The consumer has signed an identity theft statement.");
  if (att.breachImpact) add("attested_breach_impact", "confirmed", "The consumer has signed that they were affected by a data breach.");
  if (att.neverLate) add("attested_never_late", "confirmed", "The consumer states no payment on this account was late.");
  if (att.notMine) add("attested_not_mine", "confirmed", "The consumer states this account is not theirs.");
  if (att.noWrittenConsent) add("attested_no_written_consent", "confirmed", "The consumer states they gave no written consent.");
  if (att.requestedProofNoneGiven) add("attested_requested_proof_none_given", "confirmed", "The consumer asked for proof and received none.");
  if (att.collectorStillContacting) add("attested_collector_still_contacting", "confirmed", "The consumer states the collector is still making contact.");

  const confirmed = findings.filter((f) => f.confidence === "confirmed");
  return {
    findings,
    /* Only confirmed findings become a dispute reason. An apparent one becomes
       a question in the letter; a ruled-out one becomes nothing at all. */
    conditions: [...new Set(confirmed.map((f) => f.condition))].sort(),
    questions: findings.filter((f) => f.confidence === "apparent"),
    ruledOut: findings.filter((f) => f.confidence === "not_an_error"),
    missingFields,
    evidence: findings.map((f) => f.observation),
  };
}
