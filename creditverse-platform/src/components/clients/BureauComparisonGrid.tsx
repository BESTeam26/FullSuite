/**
 * One account, three bureaus, every field the source exposed.
 *
 * The structure a reviewer needs, and the one thing this component refuses to
 * do: it shows **exactly what each bureau's column reported**, and it never
 * merges three values into one. A dash means that bureau reported nothing —
 * not zero, not "the same as the others".
 *
 * The heading above it carries the masked account number, decided by
 * `describeAccountNumber`: shared, single, "varies by bureau", or "not shown".
 * There is no master account number anywhere in BES, and none is invented here.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Bureau } from "@/lib/credit-classification";
import type { BureauValueInput } from "@/lib/credit-report/import-parser";

const BUREAU_ORDER: Bureau[] = ["EQ", "EX", "TU"];
const BUREAU_LABEL: Record<Bureau, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };

const money = (cents?: number) =>
  cents === undefined ? undefined : `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * The rows, in the order a reviewer reads them: what the account IS, then what
 * it OWES, then WHEN things happened, then what the bureau says about it.
 */
type Row = { label: string; read: (v: BureauValueInput) => string | undefined };

const ROWS: Row[] = [
  { label: "Account Number", read: (v) => v.account_number_masked },
  { label: "Account Type", read: (v) => v.account_type },
  /* SmartCredit exposes no separate type detail. The row stays so a source
     that does has somewhere to put it, and shows a dash until then. */
  { label: "Account Type Detail", read: () => undefined },
  { label: "Responsibility", read: (v) => v.responsibility_raw },
  { label: "Account Rating", read: (v) => v.account_rating },
  { label: "Account Status", read: (v) => v.status },
  { label: "Payment Status", read: (v) => v.payment_status },
  { label: "Balance", read: (v) => money(v.balance_cents) },
  { label: "High Balance", read: (v) => money(v.high_balance_cents) },
  { label: "Credit Limit", read: (v) => money(v.credit_limit_cents) },
  { label: "Past Due", read: (v) => money(v.past_due_cents) },
  { label: "Monthly Payment", read: (v) => money(v.monthly_payment_cents) },
  { label: "Terms", read: (v) => (v.term_months === undefined ? undefined : `${v.term_months} months`) },
  { label: "Date Opened", read: (v) => v.open_date },
  { label: "Date Closed", read: (v) => v.date_closed },
  { label: "Last Payment", read: (v) => v.date_last_payment },
  { label: "Last Activity", read: (v) => v.date_last_active },
  { label: "Last Reported", read: (v) => v.account_information_date },
  { label: "Last Verified", read: (v) => v.last_verified },
  { label: "Payment Frequency", read: (v) => v.payment_frequency },
  { label: "Dispute Status", read: (v) => v.dispute_status },
  { label: "Creditor Type", read: (v) => v.creditor_type },
  { label: "Remarks", read: (v) => v.remarks },
];

/**
 * A PUBLIC RECORD's rows. Not a tradeline's — a record has no balance, no
 * limit and no payment history, and showing those rows empty would suggest it
 * ought to have them.
 */
const RECORD_ROWS: Row[] = [
  { label: "Type", read: (v) => v.account_type },
  { label: "Status", read: (v) => v.status },
  { label: "Date Filed / Reported", read: (v) => v.filed_on },
  { label: "Closing Date", read: (v) => v.date_closed },
  { label: "Reference #", read: (v) => v.reference_number },
  { label: "Court", read: (v) => v.court },
  { label: "Liability", read: (v) => money(v.liability_cents) },
  { label: "Asset Amount", read: (v) => money(v.asset_cents) },
  { label: "Exempt Amount", read: (v) => money(v.exempt_cents) },
  { label: "Remarks", read: (v) => v.remarks },
];

/** An ENQUIRY's rows. The type is blank unless the source stated it. */
const INQUIRY_ROWS: Row[] = [
  { label: "Date of Inquiry", read: (v) => v.inquiry_date },
  /* Absent means UNKNOWN, and the dash says so. Never inferred from the
     subscriber's name or from how recent the enquiry is. */
  { label: "Inquiry Type", read: (v) => v.inquiry_type },
];

const ROWS_FOR: Record<string, Row[]> = {
  Account: ROWS,
  "Public Record": RECORD_ROWS,
  Inquiry: INQUIRY_ROWS,
};

const MONTH = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-02:30" → { label: "Feb '26", status: "30" }. Dates travel with the mark. */
function readEntry(entry: string): { label: string; status: string } | null {
  const m = /^(\d{4})-(\d{2}):(.*)$/.exec(entry);
  if (!m) return null;
  return { label: `${MONTH[Number(m[2])]} '${m[1].slice(2)}`, status: m[3] };
}

const MARK_TONE: Record<string, string> = {
  OK: "bg-emerald-500/10 text-emerald-700 border-emerald-600/30",
  ND: "bg-muted text-muted-foreground border-border",
};
const lateTone = "bg-amber-500/10 text-amber-800 border-amber-600/40";
const badTone = "bg-red-500/10 text-red-700 border-red-600/40";
const toneFor = (status: string) =>
  MARK_TONE[status] ?? (status === "CO" ? badTone : /^\d+$/.test(status) ? lateTone : "bg-muted text-foreground border-border");

export function BureauComparisonGrid({
  values,
  sourceColumns,
  kind = "Account",
}: {
  values: BureauValueInput[];
  /** Multi-column values the source did not attribute. Shown, never assigned. */
  sourceColumns?: Record<string, string[]>;
  /** Chooses the field list. A record is not a tradeline (S-15, S-16). */
  kind?: string;
}) {
  const rows = ROWS_FOR[kind] ?? ROWS;
  const [showHistory, setShowHistory] = useState(true);
  const present = BUREAU_ORDER.filter((b) => values.some((v) => v.bureau === b));
  const columns = present.length > 0 ? present : BUREAU_ORDER;
  const valueFor = (b: Bureau) => values.find((v) => v.bureau === b);

  /* Only a tradeline has payment history. A record or an enquiry showing an
     empty history block would imply it should have one. */
  const hasHistory = kind === "Account" && values.some((v) => (v.payment_history?.length ?? 0) > 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[34rem] text-xs">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Field</th>
              {columns.map((b) => (
                <th key={b} className="px-2 py-1.5 text-left font-semibold text-foreground">
                  {BUREAU_LABEL[b]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const cells = columns.map((b) => {
                const v = valueFor(b);
                return v ? row.read(v) : undefined;
              });
              const said = cells.filter((c) => c !== undefined && c !== "");
              /* Highlighted only where two or more bureaus SAID something and
                 disagreed. One value plus a silence is not a disagreement. */
              const differs = said.length > 1 && new Set(said.map((s) => s!.toLowerCase())).size > 1;
              return (
                <tr key={row.label} className={differs ? "bg-amber-500/5" : undefined}>
                  <td className="px-2 py-1.5 font-medium text-muted-foreground">{row.label}</td>
                  {cells.map((cell, i) => (
                    <td key={columns[i]} className={differs ? "px-2 py-1.5 font-semibold text-foreground" : "px-2 py-1.5 text-foreground"}>
                      {cell || <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasHistory && (
        <div className="rounded-lg border border-border p-3">
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {showHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Payment history
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2">
              {columns.map((b) => {
                const entries = (valueFor(b)?.payment_history ?? []).map(readEntry).filter(Boolean);
                return (
                  <div key={b}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{BUREAU_LABEL[b]}</p>
                    {entries.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No payment history reported.</p>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {entries.map((e) => (
                          <span
                            key={`${b}-${e!.label}`}
                            title={`${e!.label}: ${e!.status}`}
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${toneFor(e!.status)}`}
                          >
                            {e!.label} · {e!.status}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {sourceColumns && Object.keys(sourceColumns).length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-[11px] font-semibold text-amber-800">Reported by column, but the source did not say which bureau is which</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            The values are kept exactly as the report printed them. They are not assigned to a bureau, because the
            report&rsquo;s own header did not say which column belongs to which.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {Object.entries(sourceColumns).map(([field, raw]) => (
              <li key={field} className="text-[11px] text-foreground">
                <span className="text-muted-foreground">{field}:</span> {raw.join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
