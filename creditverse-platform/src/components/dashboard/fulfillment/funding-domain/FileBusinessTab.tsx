/**
 * The business behind this funding file, and its financials as the application
 * states them.
 *
 * Read-only here on purpose. The business is the client's, edited from the
 * client record; the financial figures belong to a versioned application and
 * are edited on the Application tab, where the version is recorded. Two places
 * to change one number is how the two disagree (rule 2).
 */
import { Building2, TrendingUp } from "lucide-react";
import type { FundingFileDomain } from "@/lib/data/funding-domain";

const money = (v: number | null) => (v === null ? "—" : `$${v.toLocaleString()}`);
const months = (v: number | null) =>
  v === null ? "—" : v >= 24 ? `${Math.floor(v / 12)} years ${v % 12} months` : `${v} months`;

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <span className="text-sm text-foreground">{value}</span>
  </div>
);

export function FileBusinessTab({ domain }: { domain: FundingFileDomain }) {
  const app = domain.application;
  const owners = domain.parties.filter((p) => p.kind !== "business");
  const business = domain.parties.find((p) => p.kind === "business");

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-background p-3">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> Business
        </h4>
        <div className="mt-2">
          <Row label="Legal name" value={business?.displayName ?? "Not recorded"} />
          <Row label="Entity type" value={app?.entityType ?? "—"} />
          <Row label="State" value={app?.state ?? "—"} />
          <Row label="Time in business" value={months(app?.timeInBusinessMonths ?? null)} />
        </div>
        {owners.length > 0 && (
          <>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Owners</p>
            <ul className="mt-1 space-y-1">
              {owners.map((o) => (
                <li key={o.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-foreground">{o.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {o.ownershipPct === null ? o.kind : `${o.ownershipPct}%`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" /> Financials
        </h4>
        {!app ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No application recorded yet. Every figure here comes from one, so there is nothing to show.
          </p>
        ) : (
          <div className="mt-2">
            <Row label="Requested" value={money(app.requestedAmount)} />
            <Row label="Monthly revenue" value={money(app.monthlyRevenue)} />
            <Row label="Existing monthly debt" value={money(app.existingDebtMonthly)} />
            <Row label="Stated credit score" value={app.creditScoreStated === null ? "—" : String(app.creditScoreStated)} />
            <Row label="Product family" value={app.productFamily ?? "—"} />
            <Row label="Use of funds" value={app.useOfFunds ?? "—"} />
            <p className="mt-2 text-[10px] text-muted-foreground">
              From application v{app.version} ({app.source}). These are what the applicant stated, not
              what a bank statement proves — verification is the documents' job.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
