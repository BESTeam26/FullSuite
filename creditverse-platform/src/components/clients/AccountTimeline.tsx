/**
 * How one account's reported data changed across snapshots.
 *
 * FACTS, in the order they happened. "Experian balance changed $3,031 →
 * $2,800" and nothing more — no corrected, no inaccurate, no re-aged, no
 * violation. Those conclusions belong to engines that reach them with evidence
 * and a person.
 *
 * The two things this view is careful about, because they are the two ways a
 * timeline lies:
 *
 *   A partial snapshot cannot prove an absence, so where coverage was
 *   incomplete the row says the comparison was unavailable — not that the
 *   account went.
 *
 *   An ambiguous identity is not a merge. A renamed creditor shows as a match
 *   to review, not as one account dying and another being born.
 */
import { useState } from "react";
import { ArrowRight, CalendarClock, CircleAlert, GitCompare, HelpCircle, Table2 } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import {
  buildAccountChronology,
  groupByPeriod,
  type ChronologyEvent,
  type ChronologySnapshot,
} from "@/lib/credit-report/chronology";

const BUREAU_LABEL: Record<string, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };

const KIND_TONE: Record<ChronologyEvent["kind"], string> = {
  FIRST_OBSERVED: "border-border bg-muted/40 text-foreground",
  FIELD_CHANGED: "border-blue-600/30 bg-blue-500/5 text-foreground",
  HISTORY_MARK_CHANGED: "border-blue-600/30 bg-blue-500/5 text-foreground",
  NO_LONGER_OBSERVED: "border-amber-600/40 bg-amber-500/5 text-foreground",
  OBSERVED_AGAIN: "border-border bg-muted/40 text-foreground",
  POTENTIAL_REAPPEARANCE_EVENT: "border-amber-600/40 bg-amber-500/5 text-foreground",
  COMPARISON_UNAVAILABLE: "border-dashed border-border bg-muted/30 text-foreground",
  MATCH_REVIEW_REQUIRED: "border-dashed border-amber-600/40 bg-amber-500/5 text-foreground",
};

const KIND_LABEL: Record<ChronologyEvent["kind"], string> = {
  FIRST_OBSERVED: "First observed",
  FIELD_CHANGED: "Changed",
  HISTORY_MARK_CHANGED: "History changed",
  NO_LONGER_OBSERVED: "Not observed",
  OBSERVED_AGAIN: "Observed again",
  POTENTIAL_REAPPEARANCE_EVENT: "Observed again",
  COMPARISON_UNAVAILABLE: "Cannot compare",
  MATCH_REVIEW_REQUIRED: "Match to review",
};

export function AccountTimeline({
  snapshots,
  accountRef,
}: {
  snapshots: ChronologySnapshot[];
  accountRef: string;
}) {
  const [view, setView] = useState<"timeline" | "table">("timeline");
  const chronology = buildAccountChronology(snapshots, accountRef);
  const periods = groupByPeriod(chronology.events);

  if (chronology.events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing has changed for this account across the reports on file.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-4 w-4 text-status-info" />
        <h4 className="text-sm font-bold text-foreground">{chronology.name}</h4>
        <span className="text-[11px] text-muted-foreground">
          across {snapshots.length} report{snapshots.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex gap-1">
          {(["timeline", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={
                view === v
                  ? "flex items-center gap-1 rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                  : "flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              }
            >
              {v === "timeline" ? <GitCompare className="h-3 w-3" /> : <Table2 className="h-3 w-3" />}
              {v === "timeline" ? "Timeline" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {(chronology.hasGaps || chronology.matchReviewRequired) && (
        <p className="flex items-start gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-[11px] text-foreground">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
          <span>
            {chronology.matchReviewRequired && <>Identity across reports is not settled for this account, so histories are <strong>not merged</strong>. </>}
            {chronology.hasGaps && <>Some reports could not be compared, so this timeline does <strong>not</strong> show whether the account stopped being reported in those periods.</>}
          </span>
        </p>
      )}

      {view === "timeline" ? (
        <ol className="space-y-3">
          {periods.map((period) => (
            <li key={period.pulledAt}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {formatDate(period.pulledAt)}
              </p>
              <ul className="mt-1 space-y-1.5">
                {period.events.map((e, i) => (
                  <li
                    key={`${e.kind}-${e.bureau ?? ""}-${e.field ?? ""}-${e.month ?? ""}-${i}`}
                    className={`rounded-lg border p-2 text-xs ${KIND_TONE[e.kind]}`}
                  >
                    <span className="mr-1.5 rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {KIND_LABEL[e.kind]}
                    </span>
                    {e.detail}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-xs">
            <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Report date</th>
                <th className="px-2 py-1.5 text-left font-semibold">Bureau</th>
                <th className="px-2 py-1.5 text-left font-semibold">Field</th>
                <th className="px-2 py-1.5 text-left font-semibold">Previous</th>
                <th className="px-2 py-1.5 text-left font-semibold">New</th>
                <th className="px-2 py-1.5 text-left font-semibold">Match status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {chronology.events.map((e, i) => (
                <tr key={`${e.kind}-${e.bureau ?? ""}-${e.field ?? ""}-${e.month ?? ""}-${i}`}>
                  <td className="px-2 py-1.5 text-foreground">{formatDate(e.pulledAt)}</td>
                  <td className="px-2 py-1.5 text-foreground">
                    {e.bureau ? BUREAU_LABEL[e.bureau] : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-foreground">
                    {e.fieldLabel ?? KIND_LABEL[e.kind]}
                    {e.month && <span className="text-muted-foreground"> ({e.month})</span>}
                  </td>
                  <td className="px-2 py-1.5 text-foreground">
                    {e.previous ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-foreground">
                    {e.next ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {e.reason
                      ? e.reason.replace(/_/g, " ").toLowerCase()
                      : e.kind === "FIELD_CHANGED" || e.kind === "HISTORY_MARK_CHANGED"
                        ? "matched"
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
            Every row is what a report said, compared with what an earlier report said. A change is a
            change &mdash; not a correction, an inaccuracy, or a violation.
          </p>
        </div>
      )}
    </div>
  );
}

/** The chronology section: pick an account, read its history. */
export function AccountTimelineSection({
  snapshots,
  refs,
}: {
  snapshots: ChronologySnapshot[];
  refs: { accountRef: string; name: string }[];
}) {
  const [selected, setSelected] = useState(refs[0]?.accountRef ?? "");

  if (snapshots.length < 2) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CalendarClock className="h-4 w-4 text-status-info" /> Report history
        </h3>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A history needs at least two reports to compare. Import another to see how each bureau&rsquo;s
          reporting changed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CalendarClock className="h-4 w-4 text-status-info" /> Report history
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          What each bureau reported, and how it changed between reports. Facts only.
        </p>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {refs.map((r) => (
            <option key={r.accountRef} value={r.accountRef}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      {selected && <AccountTimeline snapshots={snapshots} accountRef={selected} />}
    </div>
  );
}
