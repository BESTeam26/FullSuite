/**
 * Deals on this funding file — every lender this file has actually gone to.
 *
 * One funding file, many deals. A decline closes THAT deal; the file carries
 * on with the others, which is why this is a list and not a status field.
 */
import { Link } from "react-router-dom";
import { Briefcase, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import type { FundingFileDomain } from "@/lib/data/funding-domain";
import { PROGRAM_FIT_LABEL } from "@/lib/funding/readiness-engine";

const STATUS_TONE: Record<string, string> = {
  Draft: "border-border bg-muted text-muted-foreground",
  Submitted: "border-blue-500/30 bg-blue-500/10 text-status-info",
  "In Review": "border-blue-500/30 bg-blue-500/10 text-status-info",
  Stipulations: "border-amber-500/40 bg-amber-500/10 text-status-warning",
  "Offer Received": "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  Funded: "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  Declined: "border-red-500/30 bg-red-500/10 text-status-danger",
  Withdrawn: "border-border bg-muted text-muted-foreground",
};

export function FileDealsTab({ domain }: { domain: FundingFileDomain }) {
  if (domain.deals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No deals yet. Select a lender from Lender Search to create one.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {domain.deals.map((d) => {
          const offers = domain.offers.filter((o) => o.dealId === d.id);
          const funded = domain.fundedDeals.find((f) => f.dealId === d.id);
          return (
            <li key={d.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Briefcase className="h-3.5 w-3.5 text-primary" />
                    {d.lender}
                    {d.program && <span className="font-normal text-muted-foreground">· {d.program}</span>}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    ${d.amount.toLocaleString()}
                    {d.submittedAt ? ` · submitted ${formatDate(d.submittedAt)}` : " · not submitted"}
                    {d.fitOutcome ? ` · ${PROGRAM_FIT_LABEL[d.fitOutcome]} when chosen` : ""}
                    {offers.length > 0 ? ` · ${offers.length} offer${offers.length === 1 ? "" : "s"}` : ""}
                    {funded ? ` · funded ${formatDate(funded.fundedAt)}` : ""}
                  </p>
                  {d.decisions.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Last decision: {d.decisions[0].decision} on {formatDate(d.decisions[0].decidedAt)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[d.status] ?? "border-border bg-muted text-muted-foreground"}`}>
                    {d.status}
                  </span>
                  <Link
                    to={`/app/funding-deals/${d.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        A lender declining closes that deal. The funding file stays open while another deal can still
        succeed.
      </p>
    </div>
  );
}
