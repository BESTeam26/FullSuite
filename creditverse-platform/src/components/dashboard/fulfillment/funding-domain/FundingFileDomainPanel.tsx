/**
 * Deal detail for one funding FILE — the domain half of the FundingOps work
 * file (Addendum B): Overview · Application · Documents · Lenders & Offers.
 * History is the activity timeline beside it: dispositions and decisions are
 * written there by the database functions.
 *
 * The panel gates its controls on the interface access model; the policies
 * decide what actually happens (rule 1).
 */
import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { FileText, Loader2, Lock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth/auth-context";
import { useFundingFileDomain } from "@/lib/data/use-funding-domain";
import { useFundingOpsAccess } from "@/lib/fulfillment/fundingops-access";
import type { FundingFile } from "@/lib/fulfillment/fundingops-domain";
import { assessReadiness, READINESS_LEVEL_LABEL, type ReadinessLevel } from "@/lib/funding/readiness-engine";
import { documentTypeLabel } from "@/lib/funding/document-vocabulary";
import { ApplicationTab } from "./ApplicationTab";
import { DocumentsTab } from "./DocumentsTab";
import { LendersOffersTab } from "./LendersOffersTab";
import { MoveFileControl } from "./MoveFileControl";
import { OffersTab } from "./OffersTab";
import { ClosingTab } from "./ClosingTab";
import { RenewalTab } from "./RenewalTab";
import { cn } from "@/lib/utils";
import { usePermission } from "@/lib/auth/use-permission";

interface Props {
  file: FundingFile;
  clientId: string;
  organizationId: string | null;
}

const READINESS_TONE: Record<ReadinessLevel, string> = {
  ready_for_placement: "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  potential_fit: "border-emerald-500/30 bg-emerald-500/5 text-emerald-800",
  conditional: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  not_currently_ready: "border-red-500/30 bg-red-500/10 text-red-700",
  insufficient_information: "border-border bg-muted text-muted-foreground",
};

export function FundingFileDomainPanel({ file, clientId, organizationId }: Props) {
  const auth = useAuth();
  const access = useFundingOpsAccess();
  const live = auth.mode === "live";
  const domain = useFundingFileDomain(live ? file.id : null);
  const [tab, setTab] = useState("overview");
  const canEdit = live && access.canEditStageProgress;
  /* The organization's permission keys (0064/0065): the database enforces them inside each function; here they only decide what to offer. */
  const may = {
    edit: usePermission("fundingops.files.edit").allowed,
    docs: usePermission("fundingops.documents.review").allowed,
    submit: usePermission("fundingops.submissions.create").allowed,
    offers: usePermission("fundingops.offers.manage").allowed,
    confirm: usePermission("fundingops.funding.confirm").allowed,
    commissions: usePermission("fundingops.commissions.view").allowed,
  };
  const actorId = auth.user?.id ?? null;

  if (!live) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Funding File — {file.purpose}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Application, documents and lender matching read the live database. Demo mode shows nothing here.</p>
      </section>
    );
  }

  const d = domain.data;
  const satisfiedTypes = d ? d.requests.filter((r) => r.status === "satisfied").map((r) => r.documentType) : [];
  const readiness = d
    ? assessReadiness({
        timeInBusinessMonths: d.application?.timeInBusinessMonths ?? null,
        monthlyRevenue: d.application?.monthlyRevenue ?? null,
        creditScore: d.application?.creditScoreStated ?? null,
        existingMonthlyDebt: d.application?.existingDebtMonthly ?? null,
        documentsReceived: satisfiedTypes,
      })
    : null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid={`deal-detail-${file.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
            <FileText className="h-4 w-4 text-primary" /> Funding File — {file.purpose}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            ${file.requestedAmount.toLocaleString()} requested{d ? ` · ${d.stage} · ${d.secondaryStatus} · waiting on ${d.waitingOn}` : ` · stage ${file.stage}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {readiness && (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", READINESS_TONE[readiness.level])} title="Meets the configured requirements — not a lender decision.">
              {READINESS_LEVEL_LABEL[readiness.level]}
            </span>
          )}
          {!canEdit && (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              <Lock className="h-3 w-3" /> View only
            </span>
          )}
        </div>
      </div>

      {domain.isLoading && (
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading deal detail…</p>
      )}
      {domain.error && <p role="alert" className="mt-3 text-xs text-status-danger">Could not load the deal detail.</p>}

      {d && readiness && (
        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList className="h-8 bg-muted/60">
            <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
            <TabsTrigger value="application" className="text-[11px]">Application</TabsTrigger>
            <TabsTrigger value="documents" className="text-[11px]">
              Documents{d.requests.some((r) => r.status === "open") && <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-800">{d.requests.filter((r) => r.status === "open").length}</span>}
            </TabsTrigger>
            <TabsTrigger value="lenders" className="text-[11px]">Matches &amp; Submissions</TabsTrigger>
            <TabsTrigger value="offers" className="text-[11px]">Offers{d.offers.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-bold text-foreground">{d.offers.length}</span>}</TabsTrigger>
            <TabsTrigger value="closing" className="text-[11px]">Closing</TabsTrigger>
            <TabsTrigger value="renewal" className="text-[11px]">Renewal</TabsTrigger>
          </TabsList>

          <div className="mt-3">
            <MoveFileControl fileId={file.id} stage={d.stage} secondaryStatus={d.secondaryStatus} waitingOn={d.waitingOn} canEdit={canEdit && may.edit} />
          </div>

          <TabsContent value="overview" className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Application" value={d.application ? `v${d.application.version}` : "None yet"} hint={d.application ? `${d.application.source} · ${formatDate(d.application.createdAt)}` : "Record one on the Application tab"} />
              <Stat label="Document requests" value={`${d.requests.filter((r) => r.status === "satisfied").length}/${d.requests.length} satisfied`} hint={`${d.instances.filter((i) => i.disposition === "pending_review").length} upload(s) pending review`} />
              <Stat label="Submissions" value={String(d.deals.length)} hint={d.deals.length ? d.deals.map((x) => x.status).join(", ") : "No submissions yet"} />
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Readiness factors</p>
              <ul className="mt-2 space-y-1">
                {readiness.factors.map((f) => (
                  <li key={f.key} className="flex items-start gap-2 text-xs">
                    <span className={cn("mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full", f.status === "pass" ? "bg-emerald-500" : f.status === "fail" ? "bg-red-500" : "bg-muted-foreground/50")} />
                    <span className="text-foreground"><span className="font-semibold">{f.label}.</span> {f.reason}</span>
                  </li>
                ))}
              </ul>
              {readiness.missingDocuments.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">Still needed: {readiness.missingDocuments.map(documentTypeLabel).join(", ")}.</p>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">Readiness means the file meets the configured requirements. It is not a lender decision and not an approval.</p>
            </div>
          </TabsContent>

          <TabsContent value="application" className="mt-3">
            <ApplicationTab fileId={file.id} application={d.application} canEdit={canEdit && may.edit} actorId={actorId} />
          </TabsContent>
          <TabsContent value="documents" className="mt-3">
            <DocumentsTab fileId={file.id} agencyId={d.agencyId} organizationId={organizationId} domain={d} canEdit={canEdit && may.docs} actorId={actorId} />
          </TabsContent>
          <TabsContent value="lenders" className="mt-3">
            <LendersOffersTab fileId={file.id} clientId={clientId} domain={d} canEdit={canEdit && may.submit} />
          </TabsContent>
          <TabsContent value="offers" className="mt-3"><OffersTab fileId={file.id} domain={d} canEdit={canEdit && may.offers} /></TabsContent>
          <TabsContent value="closing" className="mt-3"><ClosingTab fileId={file.id} domain={d} organizationId={organizationId} actorId={actorId} canCommission={may.commissions} canEdit={canEdit && may.offers} canConfirm={canEdit && may.confirm} /></TabsContent>
          <TabsContent value="renewal" className="mt-3"><RenewalTab fileId={file.id} domain={d} canEdit={canEdit && may.edit} /></TabsContent>
        </Tabs>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
