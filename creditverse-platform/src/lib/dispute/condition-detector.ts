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

export interface DetectionResult {
  conditions: ReasonCondition[];
  /** Which expected fields no bureau populated. Feeds the missing-data letter. */
  missingFields: ExpectedField[];
  /** Plain observations a reviewer can check against the report themselves. */
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
  const found = new Set<ReasonCondition>();
  const evidence: string[] = [];
  const add = (c: ReasonCondition, why?: string) => { found.add(c); if (why) evidence.push(why); };

  /* ---- Cross-bureau comparisons. Only meaningful with two or more. ---- */
  if (records.length === 1) {
    add("single_bureau_only", `Only ${records[0].bureau} is reporting this account.`);
  }
  if ((input.deletedFromBureaus?.length ?? 0) > 0) {
    add("deleted_from_other_bureaus",
      `Already deleted by ${input.deletedFromBureaus!.join(", ")}; still reported by ${records.map((r) => r.bureau).join(", ")}.`);
  }
  if (records.length > 1) {
    if (distinct(records, "balance").length > 1) add("balance_inconsistent", "The balance differs between bureaus.");
    if (distinct(records, "status").length > 1) add("status_inconsistent", "The account status differs between bureaus.");
    if (distinct(records, "paymentStatus").length > 1) add("status_inconsistent", "The payment status differs between bureaus.");
    const dateFields: (keyof BureauRecord)[] = ["openDate", "dateLastActive", "dateLastPayment", "dateClosed", "dofd"];
    for (const f of dateFields) {
      if (distinct(records, f).length > 1) {
        add("dates_inconsistent", `${String(f)} differs between bureaus.`);
        break;
      }
    }
    const histories = records
      .filter((r) => r.paymentHistory?.length)
      .map((r) => (r.paymentHistory ?? []).join(","));
    if (new Set(histories).size > 1) add("payment_history_inconsistent", "The payment history differs between bureaus.");
  }

  /* ---- Contradictions inside one bureau's own record. ----
     These are the strongest disputes: the bureau is not disagreeing with
     another bureau, it is disagreeing with itself. */
  for (const r of records) {
    const status = norm(r.status);
    const pay = norm(r.paymentStatus);
    const bal = num(r.balance);
    const high = num(r.highBalance);
    const late = (r.paymentHistory ?? []).filter((m) => m && LATE_CODES.has(m));

    if (status.includes("charge") && (bal ?? 0) > 0) {
      add("charge_off_with_balance", `${r.bureau} reports a charge-off still carrying a balance of ${bal}.`);
    }
    if ((status.includes("collection") || item.category === "3rd-Party Collection") && (num(r.pastDue) ?? 0) > 0) {
      add("collection_with_past_due", `${r.bureau} reports a past-due amount on a collection.`);
    }
    if ((status.includes("discharge") || norm(r.remarks).includes("bankruptcy")) && (bal ?? 0) > 0) {
      add("discharged_with_balance", `${r.bureau} reports a balance on an account shown as discharged.`);
    }
    if ((status.includes("paid") || pay.includes("current") || pay.includes("pays as agreed")) && late.length > 0) {
      add("paid_status_but_late_marks",
        `${r.bureau} shows the account as ${r.status ?? r.paymentStatus} while the history carries ${late.length} late mark(s).`);
    }
    if (pay.includes("current") && late.length === 1) {
      add("current_but_late_mark", `${r.bureau} shows the status as current with a single late mark.`);
    }
    if (bal !== undefined && high !== undefined && bal > high) {
      add("balance_inconsistent", `${r.bureau} reports a balance (${bal}) higher than the high credit (${high}).`);
    }
    /* A 90/120/150/180 mark with no 30 before it. A payment history that jumps
       straight to 90 describes something that cannot have happened: you reach
       90 days late by first being 30. */
    const hist2 = r.paymentHistory ?? [];
    const firstSevere = hist2.findIndex((m) => m && ["90", "120", "150", "180"].includes(m));
    if (firstSevere >= 0) {
      const before = hist2.slice(0, firstSevere).filter((m) => m === "30");
      if (before.length === 0) {
        add("severe_late_without_prior_30",
          `${r.bureau} reports a ${hist2[firstSevere]}-day mark with no 30-day mark before it.`);
      }
    }
    if (late.length === 1) add("single_late_mark");
    if (late.length > 1) add("multiple_late_marks");

    /* Date of last activity before the account existed. */
    const opened = ym(r.openDate);
    const active = ym(r.dateLastActive);
    if (opened !== undefined && active !== undefined && active < opened) {
      add("dola_before_open_date",
        `${r.bureau} reports last activity (${r.dateLastActive}) before the account opened (${r.openDate}).`);
    }
  }

  /* ---- Missing data. A blank field is a fact, not an inference. ---- */
  const missingFields: ExpectedField[] = [];
  for (const f of EXPECTED_FIELDS) {
    const anyPopulated = records.some((r) => {
      const v = r[f as keyof BureauRecord];
      return v !== undefined && v !== null && v !== "";
    });
    if (!anyPopulated) missingFields.push(f);
  }
  if (missingFields.length > 0) {
    add("data_missing_or_deficient",
      `Not reported by any bureau: ${missingFields.map((f) => FIELD_LABELS[f]).join(", ")}.`);
  }

  /* ---- Account shape, which decides the statute that applies. ---- */
  const sub = norm(item.subtype);
  if (sub.includes("auto")) add("auto_loan");
  if (item.category === "Student Loan" || sub.includes("student")) add("student_loan");
  if (sub.includes("medical") || norm(item.name).includes("medical")) add("medical");
  if (sub.includes("revolving") && norm(item.status).includes("open")) add("open_revolving");

  /* ---- Our own procedural history. Never guessed from the report. ---- */
  if (hist) {
    if (hist.priorRounds > 0 && !hist.lastResponseAt) add("prior_dispute_unanswered");
    if (hist.notatedAsDisputed === false) add("not_notated_as_disputed");
    if (hist.everDeletedThenReturned) add("reinserted_after_deletion");
    if (hist.verificationRequestedNotProduced) add("verification_not_produced");
  }

  /* ---- Signed consumer statements. ---- */
  if (att.identityTheft) add("attested_identity_theft");
  if (att.breachImpact) add("attested_breach_impact");
  if (att.neverLate) add("attested_never_late");
  if (att.notMine) add("attested_not_mine");
  if (att.noWrittenConsent) add("attested_no_written_consent");
  if (att.requestedProofNoneGiven) add("attested_requested_proof_none_given");
  if (att.collectorStillContacting) add("attested_collector_still_contacting");

  return { conditions: [...found].sort(), missingFields, evidence };
}
