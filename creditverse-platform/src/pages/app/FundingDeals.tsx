/**
 * Deals — the cross-file record pages of the FundingOps engine in one surface:
 * Submissions · Offers · Funded · Commissions · Renewals. Each tab is one
 * bounded query over its canonical table, fetched only while open. These are
 * records (one row per truth); the Workspace's queue views read the same rows.
 */
import { useMemo, useState } from "react";
import { Briefcase, Search } from "lucide-react";
import { CommissionsRecords } from "@/components/dashboard/fulfillment/funding-domain/records/CommissionsRecords";
import { FundedDealsRecords } from "@/components/dashboard/fulfillment/funding-domain/records/FundedDealsRecords";
import { OffersRecords } from "@/components/dashboard/fulfillment/funding-domain/records/OffersRecords";
import { RenewalsRecords } from "@/components/dashboard/fulfillment/funding-domain/records/RenewalsRecords";
import { SubmissionsRecords } from "@/components/dashboard/fulfillment/funding-domain/records/SubmissionsRecords";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import type { FundingRecordKind } from "@/lib/data/use-funding-records";
import { useOrgMembers } from "@/lib/data/use-workspaces";
import { cn } from "@/lib/utils";

const TABS: { key: FundingRecordKind; label: string; blurb: string }[] = [
  { key: "submissions", label: "Submissions", blurb: "Every submission, the policy version it was judged against, and the lender's decision." },
  { key: "offers", label: "Offers", blurb: "Lender terms exactly as stated, beside what arithmetic can say from them. Factor rate is never shown as APR." },
  { key: "funded", label: "Funded", blurb: "The immutable funded record: requested, accepted, gross and net kept apart." },
  { key: "commissions", label: "Commissions", blurb: "Per funded deal, per party — pending, approved, paid." },
  { key: "renewals", label: "Renewals", blurb: "Operational reminders over funded deals; a renewal is a new file with lineage, never automatic." },
];

export default function FundingDeals() {
  const auth = useAuth();
  const { activeOrganization } = useAgency();
  const live = auth.mode === "live";
  const [tab, setTab] = useState<FundingRecordKind>("submissions");
  const [query, setQuery] = useState("");
  const { members } = useOrgMembers(tab === "commissions" ? activeOrganization?.id ?? null : null);
  const memberNames = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.name])), [members]);
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Briefcase className="h-5 w-5 text-primary" /> Deals</h1>
        <p className="text-sm text-muted-foreground">Submissions, offers, funded deals, commissions and renewals across every funding file — the records themselves, one row each. Work queues over these rows live in the Workspace.</p>
      </div>

      {!live && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Deal records read the live database. Demo mode shows nothing here.</p>}

      {live && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Deal records" className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5 text-xs font-semibold">
              {TABS.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                  className={cn("rounded-md px-3 py-1.5 transition-colors", tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search client, business, lender or FND-"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{current.blurb}</p>

          {tab === "submissions" && <SubmissionsRecords open query={query} />}
          {tab === "offers" && <OffersRecords open query={query} />}
          {tab === "funded" && <FundedDealsRecords open query={query} />}
          {tab === "commissions" && <CommissionsRecords open query={query} memberNames={memberNames} />}
          {tab === "renewals" && <RenewalsRecords open query={query} />}
        </>
      )}
    </div>
  );
}
