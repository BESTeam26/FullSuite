/**
 * What happened to each item between imports, and what the platform is willing
 * to say about it.
 *
 * Two sources sit side by side and are never merged:
 *
 *   the comparison  what two imported snapshots show (`report_item_changes`).
 *                   An absence here is "no longer observed", and only where the
 *                   later report read completely.
 *   the review      what a bureau's result, or a person, established
 *                   (`dispute_item_outcomes`). The only place a confirmed
 *                   deletion or a correction can come from.
 *
 * The counts in the header keep them apart for the same reason: a client
 * reading "3 deletions" should be able to tell which of the two it means.
 */
import { useMemo } from "react";
import { ArrowRightLeft, CircleHelp, Loader2, MinusCircle, PlusCircle, ShieldCheck } from "lucide-react";
import { useReportChanges } from "@/lib/data/use-report-changes";
import { useDisputeOutcomes } from "@/lib/data/use-dispute-outcomes";
import { currentOutcomes } from "@/lib/data/dispute-outcomes";
import { BUREAU_NAMES, OUTCOMES, SOURCE_LABELS, type DisputeOutcome } from "@/lib/dispute/outcome-vocabulary";
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

/** Tone by what the outcome asserts, never by whether it is good news. */
const TONE: Record<DisputeOutcome, string> = {
  bureau_confirmed_deletion: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  corrected: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  no_longer_observed: "border-teal-500/30 bg-teal-500/10 text-teal-700",
  updated: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  unchanged: "border-border bg-muted text-muted-foreground",
  newly_reported: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  reappeared: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  unable_to_compare: "border-slate-400/40 bg-slate-500/10 text-slate-700",
  ambiguous_match: "border-slate-400/40 bg-slate-500/10 text-slate-700",
  result_not_available: "border-border bg-muted text-muted-foreground",
  legacy_reported_deleted: "border-border bg-muted text-muted-foreground",
  legacy_reported_updated: "border-border bg-muted text-muted-foreground",
  legacy_reported_verified: "border-border bg-muted text-muted-foreground",
};

const ICON: Partial<Record<DisputeOutcome, typeof MinusCircle>> = {
  bureau_confirmed_deletion: ShieldCheck,
  no_longer_observed: MinusCircle,
  newly_reported: PlusCircle,
  reappeared: PlusCircle,
  unable_to_compare: CircleHelp,
  ambiguous_match: CircleHelp,
};

function OutcomeBadge({ outcome }: { outcome: DisputeOutcome }) {
  const meaning = OUTCOMES[outcome];
  const Icon = ICON[outcome];
  return (
    <span
      title={meaning.doesNotEstablish ?? undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
        TONE[outcome],
      )}
    >
      {Icon && <Icon className="h-3 w-3" />} {meaning.label}
    </span>
  );
}

interface Row {
  key: string;
  name: string;
  bureau: string;
  observedOn: string;
  outcome: DisputeOutcome;
  previous: string | null;
  current: string | null;
  field: string | null;
  source: string;
  reviewedBy: string | null;
}

const money = (c: number | null) => (c === null ? null : formatMoney(c / 100));

export function ReportChangesPanel({ clientId }: { clientId: string }) {
  const changes = useReportChanges(clientId);
  const reviewed = useDisputeOutcomes(clientId);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const r of changes.data ?? []) {
      const balanceMoved = r.previousBalanceCents !== r.currentBalanceCents;
      out.push({
        key: `c-${r.reportId}-${r.accountRef}`,
        name: r.name,
        bureau: r.bureaus.map((b) => BUREAU_NAMES[b] ?? b).join(", "),
        observedOn: r.observedOn,
        outcome: r.change as DisputeOutcome,
        field: balanceMoved ? "Balance" : r.previousStatus !== r.currentStatus ? "Status" : null,
        previous: balanceMoved ? money(r.previousBalanceCents) : r.previousStatus,
        current: balanceMoved ? money(r.currentBalanceCents) : r.currentStatus,
        source: SOURCE_LABELS.reimport_comparison,
        reviewedBy: null,
      });
    }
    for (const o of currentOutcomes(reviewed.data ?? [])) {
      out.push({
        key: `r-${o.id}`,
        name: o.accountRef,
        bureau: BUREAU_NAMES[o.bureau] ?? o.bureau,
        observedOn: (o.reviewedAt ?? o.createdAt).slice(0, 10),
        outcome: o.outcome,
        field: o.field,
        previous: o.previousValue,
        current: o.currentValue,
        source: SOURCE_LABELS[o.resultSource],
        reviewedBy: o.reviewedBy,
      });
    }
    return out.sort((a, b) => b.observedOn.localeCompare(a.observedOn));
  }, [changes.data, reviewed.data]);

  const loading = changes.isLoading || reviewed.isLoading;
  if (!loading && rows.length === 0) return null;

  /* Counted separately, deliberately. Summing these would be the claim R5
     exists to prevent. */
  const confirmed = rows.filter((r) => r.outcome === "bureau_confirmed_deletion").length;
  const absent = rows.filter((r) => r.outcome === "no_longer_observed").length;
  const uncomparable = rows.filter(
    (r) => r.outcome === "unable_to_compare" || r.outcome === "ambiguous_match",
  ).length;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
            <ArrowRightLeft className="h-4 w-4 text-primary" /> Results by item
          </h3>
          <p className="text-[11px] text-muted-foreground">
            What each item shows now, and where that comes from. An item missing from a newer
            report is recorded as no longer observed — a bureau confirming a deletion is a
            separate, stronger result.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-foreground">
          <span><span className="font-bold">{confirmed}</span> confirmed deleted</span>
          <span><span className="font-bold">{absent}</span> no longer observed</span>
          {uncomparable > 0 && (
            <span className="text-muted-foreground"><span className="font-bold">{uncomparable}</span> need review</span>
          )}
        </div>
      </div>

      {loading && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Comparing imports…
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-xs">
          <thead>
            <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="py-1.5 pr-3">Item</th>
              <th className="py-1.5 pr-3">Previous</th>
              <th className="py-1.5 pr-3">Current</th>
              <th className="py-1.5 pr-3">Observed</th>
              <th className="py-1.5 pr-3">Outcome</th>
              <th className="py-1.5 pr-3">Source</th>
              <th className="py-1.5">Reviewed by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((r) => (
              <tr key={r.key} className="align-top transition-colors hover:bg-muted/40">
                <td className="py-1.5 pr-3">
                  <span className="font-semibold text-foreground">{r.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{r.bureau}</span>
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">
                  {r.previous ?? <span title="Not recorded">—</span>}
                  {r.field && <span className="block text-[10px]">{r.field}</span>}
                </td>
                <td className="py-1.5 pr-3 text-foreground">{r.current ?? "—"}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{formatDate(r.observedOn)}</td>
                <td className="py-1.5 pr-3"><OutcomeBadge outcome={r.outcome} /></td>
                <td className="py-1.5 pr-3 text-muted-foreground">{r.source}</td>
                <td className="py-1.5 text-muted-foreground">
                  {r.reviewedBy ? "Staff" : <span className="italic">Not reviewed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
