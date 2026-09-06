/**
 * One DEAL — this funding file taken to one lender.
 *
 * Dee's canonical chain, 2026-09-06:
 *
 *   Client → Business → Funding File → Lender Search → Selected Lenders
 *          → Deal → Stipulations → Offers → Funded → Commission → Renewal
 *
 * A deal is not a file and a file is not a deal. One file may hold several
 * deals; a lender declining closes THAT deal and the file carries on. So this
 * page shows the deal and links up to its file, never the other way round.
 *
 * Note this is the DOMAIN record. `FundingDealWorkspace` is a different thing
 * and deliberately stays — it is the operational working record (queues,
 * checklist, SLA, work completion) that the Workspace shows for the people
 * doing the work. Domain screens are the work; the Workspace runs the people.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useDealDetail } from "@/lib/data/use-funding-deal";
import { usePermission } from "@/lib/auth/use-permission";
import { PROGRAM_FIT_LABEL } from "@/lib/funding/readiness-engine";
import { isOutstanding } from "@/lib/funding/stipulation-lifecycle";
import { DealStipulationsPanel } from "@/components/dashboard/fulfillment/funding-domain/DealStipulationsPanel";
import { FileActivityTab } from "@/components/dashboard/fulfillment/funding-domain/FileActivityTab";

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

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <span className="text-sm text-foreground">{value}</span>
  </div>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
    <div className="mt-2">{children}</div>
  </div>
);

export default function FundingDealDetail() {
  const { dealId = "" } = useParams();
  const deal = useDealDetail(dealId);
  const canReview = usePermission("fundingops.documents.review").allowed;
  const [tab, setTab] = useState("overview");

  if (deal.isLoading) {
    return (
      <p className="inline-flex items-center gap-1 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading deal…
      </p>
    );
  }
  if (deal.error) {
    return <p className="p-8 text-sm text-status-danger">Could not load this deal: {(deal.error as Error).message}</p>;
  }
  const d = deal.data;
  if (!d) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">
          This deal does not exist, or you are not authorized to see it.
        </p>
        <Link to="/app/funding-files" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Funding files
        </Link>
      </div>
    );
  }

  const outstanding = d.stipulations.filter((s) => isOutstanding(s.status)).length;
  const lastDecision = d.decisions[0] ?? null;

  return (
    <div className="space-y-4 p-6">
      <Link
        to={`/app/funding-files/${d.fileId}`}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {d.filePublicId ? `Funding file ${d.filePublicId}` : "Funding file"}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Briefcase className="h-5 w-5 text-primary" /> {d.lender}
            {d.program && <span className="text-base font-normal text-muted-foreground">· {d.program}</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            ${d.amount.toLocaleString()}
            {d.businessName ? ` · ${d.businessName}` : ""}
            {d.clientName ? ` · ${d.clientName}` : ""}
            {d.submittedAt ? ` · submitted ${formatDate(d.submittedAt)}` : " · selected, not submitted"}
          </p>
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${STATUS_TONE[d.status] ?? "border-border bg-muted text-muted-foreground"}`}>
          {d.status}
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 bg-muted/60">
          <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
          <TabsTrigger value="lender" className="text-[11px]">Lender &amp; Program</TabsTrigger>
          <TabsTrigger value="submission" className="text-[11px]">Submission</TabsTrigger>
          <TabsTrigger value="stips" className="text-[11px]">
            Stipulations{outstanding > 0 && <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-800">{outstanding}</span>}
          </TabsTrigger>
          <TabsTrigger value="offers" className="text-[11px]">
            Offers{d.offers.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-bold text-foreground">{d.offers.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="outcome" className="text-[11px]">Outcome</TabsTrigger>
          <TabsTrigger value="activity" className="text-[11px]">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 grid gap-3 lg:grid-cols-2">
          <Card title="This deal">
            <Row label="Lender" value={d.lender} />
            <Row label="Program" value={d.program ?? "—"} />
            <Row label="Amount" value={`$${d.amount.toLocaleString()}`} />
            <Row label="Status" value={d.status} />
            <Row label="Submitted" value={d.submittedAt ? formatDate(d.submittedAt) : "Not yet"} />
          </Card>
          <Card title="Where it stands">
            <Row label="Stipulations outstanding" value={String(outstanding)} />
            <Row label="Offers received" value={String(d.offers.length)} />
            <Row
              label="Last lender decision"
              value={lastDecision ? `${lastDecision.decision} · ${formatDate(lastDecision.decidedAt)}` : "None recorded"}
            />
            <Row label="Funded" value={d.funded ? formatDate(d.funded.fundedAt) : "No"} />
          </Card>
        </TabsContent>

        <TabsContent value="lender" className="mt-3 space-y-3">
          <Card title="Program Fit when this lender was chosen">
            {d.fitOutcome ? (
              <>
                <p className="text-sm font-semibold text-foreground">{PROGRAM_FIT_LABEL[d.fitOutcome]}</p>
                {d.fitCriteria.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {d.fitCriteria.map((c) => (
                      <li key={c.key} className="text-xs text-foreground">
                        <span className="font-semibold">{c.key}:</span> {c.result} — {c.reason}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[10px] text-muted-foreground">
                  This is the judgement as it stood at selection, against policy version{" "}
                  {d.policyVersionId ? "recorded on the deal" : "unknown"}. It is not re-derived, so a
                  policy that changed since cannot rewrite why this lender was chosen.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No fit was captured for this deal — it predates the snapshot, or was created outside
                lender search.
              </p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="submission" className="mt-3 space-y-3">
          <Card title="Submission">
            <Row label="Submitted" value={d.submittedAt ? formatDateTime(d.submittedAt) : "Not submitted"} />
            <Row label="Amount submitted" value={`$${d.amount.toLocaleString()}`} />
            <Row label="Rate" value={d.rate ?? "—"} />
            <Row label="Term" value={d.term ?? "—"} />
          </Card>
          <Card title="Lender decisions">
            {d.decisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No decision recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {d.decisions.map((x) => (
                  <li key={x.id} className="rounded border border-border/60 p-2">
                    <p className="text-xs font-bold text-foreground">
                      {x.decision} · {formatDate(x.decidedAt)}
                    </p>
                    {x.conditions && <p className="text-[11px] text-muted-foreground">Conditions: {x.conditions}</p>}
                    {x.note && <p className="text-[11px] text-muted-foreground">{x.note}</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground">
              A decline closes this deal. It does not close the funding file — another deal can still
              succeed.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="stips" className="mt-3">
          <DealStipulationsPanel deal={d} canEdit={canReview} />
        </TabsContent>

        <TabsContent value="offers" className="mt-3">
          {d.offers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No offer from this lender yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.offers.map((o) => (
                <li key={o.id} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-sm font-bold text-foreground">
                    {o.offerAmount === null ? "Amount not stated" : `$${o.offerAmount.toLocaleString()}`}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{o.status}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {o.termText ?? "term not stated"} · {o.pricingType}
                    {o.pricingValue !== null ? ` ${o.pricingValue}` : ""} · received {formatDate(o.receivedAt)}
                  </p>
                  {o.note && <p className="mt-1 text-[11px] text-muted-foreground">{o.note}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Offers are recorded as the lender stated them. Anything derived from those figures is
            calculated in code and never stored as if the lender had said it.
          </p>
        </TabsContent>

        <TabsContent value="outcome" className="mt-3">
          {d.funded ? (
            <Card title="Funded">
              <Row label="Gross funded" value={`$${d.funded.grossFunded.toLocaleString()}`} />
              <Row label="Net funded" value={`$${d.funded.netFunded.toLocaleString()}`} />
              <Row label="Funded on" value={formatDate(d.funded.fundedAt)} />
              <Row label="Disbursement reference" value={d.funded.disbursementReference ?? "—"} />
              <Row label="Confirmed" value={formatDate(d.funded.confirmedAt)} />
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground">
              {d.status === "Declined" || d.status === "Withdrawn"
                ? `This deal ended as ${d.status}. The funding file is unaffected.`
                : "This deal has not funded. Funding is confirmed from the file's Closing tab, with the disbursement figures."}
            </p>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
          {/* The deal's history is written against its funding file, which is
              the entity type `entity_visible()` knows. */}
          <FileActivityTab fileId={d.fileId} />
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-muted-foreground">
        Communications with this lender are not shown here: messages live in Channels and are not
        scoped to a deal. Wiring them to a deal is a design decision that has not been made.
      </p>
    </div>
  );
}
