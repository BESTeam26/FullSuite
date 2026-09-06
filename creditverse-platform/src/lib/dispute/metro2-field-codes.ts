/**
 * The per-bureau comparison grid — the artifact a Metro 2 letter is built from.
 *
 * Every serious tool shows the same thing: one row per field, one column per
 * bureau, and a marker on the rows where the bureaus disagree. It works because
 * it is impossible to argue with. Either the three columns match or they do not.
 *
 * The `BS-` codes are the Base Segment field numbers a consumer-facing report
 * displays. They are useful as a shared vocabulary between the grid, the letter
 * and the reviewer. They are NOT a legal citation, and a letter that says "this
 * violates BS-12" has said nothing — the specification is explicit that Metro 2
 * is an industry format, never the legal basis.
 *
 * ── What this does that a generated Metro 2 letter usually does not ─────────
 *
 * A grid marks a row as different. It does not decide the difference is a
 * defect. Two of the most common markers have innocent explanations that are
 * visible in the grid itself:
 *
 *   • High Credit of $0 where the bureau's own comment says the high-credit
 *     column carries the credit limit. The grid must read that comment before
 *     flagging the zero.
 *   • A one-cycle difference in "last reported". Bureaus update on different
 *     days; the same account read a week apart differs legitimately.
 *
 * So each row carries WHY it is marked and how confident that is, and the
 * detector decides. A grid that marks everything teaches a reader to ignore it.
 */
import type { Bureau } from "@/lib/credit-classification";

export interface FieldCode {
  /** The Base Segment number as reports display it, e.g. "BS-12". */
  code: string;
  key: string;
  label: string;
  /** Numbers compare differently from text and dates. */
  kind: "text" | "money" | "date" | "count";
  /**
   * A difference between bureaus here is normal and should not be marked.
   * Update timing and display conventions vary.
   */
  differenceIsNormal?: boolean;
  note?: string;
}

export const METRO2_FIELDS: FieldCode[] = [
  { code: "BS-7",   key: "accountNumberMasked", label: "Account #", kind: "text", differenceIsNormal: true,
    note: "Bureaus mask differently. A different display does not mean a different underlying number." },
  { code: "BS-9",   key: "accountType",      label: "Account Type", kind: "text" },
  { code: "BS-17A", key: "status",           label: "Account Status", kind: "text" },
  { code: "BS-15",  key: "monthlyPayment",   label: "Monthly Payment", kind: "money" },
  { code: "BS-10",  key: "openDate",         label: "Date Opened", kind: "date" },
  { code: "BS-21",  key: "balance",          label: "Balance", kind: "money" },
  { code: "BS-13",  key: "termMonths",       label: "No. of Months (Terms)", kind: "count" },
  { code: "BS-12",  key: "highBalance",      label: "High Credit", kind: "money",
    note: "Some furnishers place the credit limit in this column and say so in the comments. Read the comment before marking a zero." },
  { code: "BS-11",  key: "creditLimit",      label: "Credit Limit", kind: "money" },
  { code: "BS-22",  key: "pastDue",          label: "Past Due", kind: "money" },
  { code: "BS-17B", key: "paymentStatus",    label: "Payment Status", kind: "text" },
  { code: "BS-8",   key: "dateLastActive",   label: "Date Last Active", kind: "date" },
  { code: "BS-27",  key: "dateLastPayment",  label: "Date of Last Payment", kind: "date" },
  { code: "BS-19",  key: "remarks",          label: "Comments", kind: "text", differenceIsNormal: true,
    note: "Bureaus display different subsets of the comment codes they receive." },
];

export const fieldByKey = (key: string) => METRO2_FIELDS.find((f) => f.key === key);

export interface GridCell {
  bureau: Bureau;
  /** As printed. Absent means the bureau does not report the field. */
  value: string | null;
}

export interface GridRow {
  code: string;
  label: string;
  cells: GridCell[];
  /** The bureaus disagree on a field where disagreement means something. */
  marked: boolean;
  /** Why it is marked, or why a real difference was left unmarked. */
  note?: string;
}

export interface GridInput {
  /** One record per bureau. Values already formatted for display. */
  records: { bureau: Bureau; values: Record<string, string | null | undefined> }[];
}

/** Values that mean "nothing here", so a blank is not mistaken for a difference. */
const isBlank = (v: string | null | undefined) => v === undefined || v === null || v.trim() === "" || v.trim() === "-";

/**
 * Does the comment explain the zero? A furnisher that says "amount in H/C
 * column is credit limit" has told us why High Credit reads $0, and marking
 * it anyway is how a letter loses its reader.
 */
function commentExplainsHighCredit(values: Record<string, string | null | undefined>): boolean {
  const c = (values.remarks ?? "").toLowerCase();
  return c.includes("h/c") || c.includes("high credit") || c.includes("amount in h/c column");
}

export function buildComparisonGrid(input: GridInput): GridRow[] {
  return METRO2_FIELDS.map((field) => {
    const cells: GridCell[] = input.records.map((r) => ({
      bureau: r.bureau,
      value: isBlank(r.values[field.key]) ? null : String(r.values[field.key]).trim(),
    }));

    const present = cells.filter((c) => c.value !== null).map((c) => c.value!.toLowerCase());
    const distinct = new Set(present);
    let marked = distinct.size > 1;
    let note = field.note;

    if (marked && field.differenceIsNormal) {
      marked = false;
      note = field.note ?? "Bureaus differ here as a matter of display, not accuracy.";
    }

    /* High Credit reading zero on a bureau whose own comment explains it. */
    if (marked && field.key === "highBalance") {
      const unexplained = input.records.filter((r) => {
        const v = r.values.highBalance;
        const zero = !isBlank(v) && Number(String(v).replace(/[^0-9.-]/g, "")) === 0;
        return zero && !commentExplainsHighCredit(r.values);
      });
      const zeros = input.records.filter((r) => {
        const v = r.values.highBalance;
        return !isBlank(v) && Number(String(v).replace(/[^0-9.-]/g, "")) === 0;
      });
      if (zeros.length > 0 && unexplained.length === 0) {
        marked = false;
        note = "One bureau reports zero high credit, and its own comment says that column carries the credit limit. Explained, not a defect.";
      }
    }

    return { code: field.code, label: field.label, cells, marked, note };
  });
}

/** The fields the bureaus disagree on, for the letter's opening sentence. */
export function markedFields(rows: GridRow[]): GridRow[] {
  return rows.filter((r) => r.marked);
}

/**
 * One plain sentence naming exactly what differs, per field.
 *
 * Deliberately not the generated-Metro-2 register — no "may not conform to the
 * required reporting standards and decorum", no "reporting complaisance". Those
 * letters say the same hedged thing about every field and specify nothing,
 * which is precisely what the specification's writing rules forbid. A reader
 * should be able to check the sentence against the grid in five seconds.
 */
export function describeRow(row: GridRow): string | null {
  if (!row.marked) return null;
  const parts = row.cells
    .filter((c) => c.value !== null)
    .map((c) => `${c.bureau} ${c.value}`);
  const missing = row.cells.filter((c) => c.value === null).map((c) => c.bureau);
  const absent = missing.length > 0 ? `; not reported by ${missing.join(", ")}` : "";
  return `${row.label} (${row.code}): ${parts.join(", ")}${absent}.`;
}
