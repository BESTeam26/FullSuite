/**
 * Lender Scorecard — descriptive historical outcomes across lenders (Dee's
 * design). Every figure shows its sample; rows with few submissions carry a
 * caution; the sort is a display order, never a recommendation.
 */
import { useMemo, useState } from "react";
import { Landmark, Loader2, TriangleAlert } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ops/ChartCard";
import { TONE_FILL } from "@/components/dashboard/ops/KpiTile";
import { StackedOutcomeBars } from "@/components/dashboard/ops/StackedOutcomeBars";
import { OpsSelect } from "@/components/ui/ops-select";
import { useLenderOutcomes } from "@/lib/data/use-funding-domain";
import { CAUTION_LABEL, SORT_LABEL, formatRate, scoreLenders, sortScores, type ScorecardSort } from "@/lib/funding/lender-scorecard";
import { cn } from "@/lib/utils";

export function LenderScorecard() {
  const outcomes = useLenderOutcomes();
  const [sort, setSort] = useState<ScorecardSort>("funded_volume");
  const rows = useMemo(() => sortScores(scoreLenders(outcomes.data ?? []), sort), [outcomes.data, sort]);
  const totalSubmissions = rows.reduce((s, r) => s + r.submissions, 0);
  const totalFunded = rows.reduce((s, r) => s + r.fundedVolume, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-900">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>These are historical observed outcomes from recorded submissions. They are descriptive only and do not predict the outcome of any current file. Sample sizes are shown for every figure. Final eligibility and approval are determined by the lender.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>{rows.length} lender{rows.length === 1 ? "" : "s"} · {totalSubmissions} recorded submission{totalSubmissions === 1 ? "" : "s"} · ${totalFunded.toLocaleString()} funded volume</p>
        <label className="flex items-center gap-2">Sort:
          <OpsSelect value={sort} onValueChange={(v) => setSort(v as ScorecardSort)} options={(Object.keys(SORT_LABEL) as ScorecardSort[]).map((k) => ({ value: k, label: SORT_LABEL[k] }))} aria-label="Sort order (display only)" />
        </label>
      </div>

      <ChartCard title="Submissions by outcome" icon={Landmark}>
        <StackedOutcomeBars
          data={rows.map((r) => ({ label: r.lenderName, funded: r.funded, offers: Math.max(0, r.offers - r.funded), declined: r.declined, pending: Math.max(0, r.submissions - r.offers - r.declined) }))}
          segments={[
            { key: "funded", label: "Funded", color: TONE_FILL.green },
            { key: "offers", label: "Offer, not funded", color: TONE_FILL.emerald },
            { key: "declined", label: "Declined", color: TONE_FILL.red },
            { key: "pending", label: "Pending / other", color: TONE_FILL.slate },
          ]}
          emptyText="No recorded submissions yet."
        />
        <p className="mt-1 text-[10px] text-muted-foreground">Observed counts per lender, in the sort order chosen above — a description of what happened, not a recommendation.</p>
      </ChartCard>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-bold">Lender</th>
              <th className="px-3 py-2 text-center font-bold">Submissions</th>
              <th className="px-3 py-2 text-center font-bold">Offers</th>
              <th className="px-3 py-2 text-center font-bold">Funded</th>
              <th className="px-3 py-2 text-center font-bold">Offer rate</th>
              <th className="px-3 py-2 text-center font-bold">Funding rate</th>
              <th className="px-3 py-2 text-center font-bold">Median response</th>
              <th className="px-4 py-2 text-right font-bold">Funded volume</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.isLoading && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading recorded submissions…</td></tr>}
            {!outcomes.isLoading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No recorded submissions yet. The scorecard fills in as submissions and lender decisions are recorded.</td></tr>}
            {rows.map((r) => {
              const offer = formatRate(r.offerRate, r.offers, r.submissions);
              const fund = formatRate(r.fundingRate, r.funded, r.submissions);
              return (
                <tr key={r.lenderKey} className="border-t border-border/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white"><Landmark className="h-4 w-4" /></span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{r.lenderName}</p>
                        {r.caution && <p className="text-[11px] font-semibold text-amber-800">{CAUTION_LABEL[r.caution]}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-base font-semibold text-foreground">{r.submissions}</td>
                  <td className="px-3 py-3 text-center text-base font-semibold text-foreground">{r.offers}</td>
                  <td className={cn("px-3 py-3 text-center text-base font-semibold", r.funded > 0 ? "text-status-success" : "text-foreground")}>{r.funded}</td>
                  <td className="px-3 py-3 text-center"><span className="block font-semibold text-foreground">{offer.pct}</span><span className="text-[10px] text-muted-foreground">{offer.sample}</span></td>
                  <td className="px-3 py-3 text-center"><span className="block font-semibold text-foreground">{fund.pct}</span><span className="text-[10px] text-muted-foreground">{fund.sample}</span></td>
                  <td className="px-3 py-3 text-center text-foreground">{r.medianResponseDays === null ? "—" : `${r.medianResponseDays}d`}{r.responseSample > 0 && <span className="block text-[10px] text-muted-foreground">{r.responseSample} decision{r.responseSample === 1 ? "" : "s"}</span>}</td>
                  <td className="px-4 py-3 text-right text-base font-bold text-foreground">{r.fundedVolume > 0 ? `$${r.fundedVolume.toLocaleString()}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {outcomes.error && <p role="alert" className="text-xs text-status-danger">Could not load recorded submissions.</p>}
      <p className="text-[11px] text-muted-foreground">
        Rates are historical (e.g. "4 of 12 submissions"). They are not predictions and do not account for criteria the platform does not possess. A lender with fewer submissions may show high rates by chance — review the sample size. Funded volume uses the submission amount until the funded-deal record carries the actual gross and net.
      </p>
    </div>
  );
}
