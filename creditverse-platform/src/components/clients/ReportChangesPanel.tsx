/**
 * Changes between imports — deletions and updates the engine observed by
 * comparing a client's consecutive reports (0071). Shown as observations with
 * their date; they feed the "from reports" KPIs with provenance engine.
 */
import { useMemo } from "react";
import { ArrowRightLeft, Loader2, MinusCircle } from "lucide-react";
import { useReportChanges } from "@/lib/data/use-report-changes";
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

export function ReportChangesPanel({ clientId }: { clientId: string }) {
  const q = useReportChanges(clientId);
  const rows = q.data ?? [];
  const byDate = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(r.observedOn, [...(m.get(r.observedOn) ?? []), r]);
    return [...m.entries()];
  }, [rows]);
  if (!q.isLoading && rows.length === 0) return null;
  const deleted = rows.filter((r) => r.change === "deleted").length, updated = rows.length - deleted;
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground"><ArrowRightLeft className="h-4 w-4 text-primary" /> Changes between imports</h3>
          <p className="text-[11px] text-muted-foreground">Accounts that disappeared or changed between one import and the next — observed on the later import's date. A disappearance is not proof of a deletion by the bureau until confirmed.</p>
        </div>
        <span className="text-xs text-foreground"><span className="font-bold">{deleted}</span> gone · <span className="font-bold">{updated}</span> changed</span>
      </div>
      {q.isLoading && <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Comparing imports…</p>}
      <div className="mt-3 space-y-3">
        {byDate.map(([date, list]) => (
          <div key={date}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Observed {formatDate(date)}</p>
            <ul className="mt-1 divide-y divide-border/60">
              {list.map((r) => (
                <li key={`${r.reportId}-${r.accountRef}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="text-foreground"><span className="font-semibold">{r.name}</span><span className="text-muted-foreground"> · {r.bureaus.join(", ")}</span></span>
                  {r.change === "deleted" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><MinusCircle className="h-3 w-3" /> No longer reported</span>
                  ) : (
                    <span className={cn("inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-700")}>
                      {r.previousStatus !== r.currentStatus ? `${r.previousStatus} → ${r.currentStatus}` : "Status unchanged"}
                      {r.previousBalanceCents !== r.currentBalanceCents && ` · ${formatMoney((r.previousBalanceCents ?? 0) / 100)} → ${formatMoney((r.currentBalanceCents ?? 0) / 100)}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
