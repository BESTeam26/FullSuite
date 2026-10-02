/**
 * Everything BES is doing for this partner, across every module.
 *
 * Dee, 2026-09-13: "Replace the CRM-only projection with a true cross-module
 * Partner view." The old page showed BES CRM builds and nothing else, so a
 * partner buying CreditOps fulfilment and marketing opened it to an empty
 * list.
 *
 * One card per LIVE engagement — the same record that authorizes the work, so
 * a module cannot appear here without being authorized and cannot be
 * authorized without appearing. Each card says what that module can honestly
 * say about progress and nothing more: no work items, no internal assignee,
 * no health reason, no rates.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, CalendarDays, Loader2, Workflow } from "lucide-react";
import { useMyPartnerServices } from "@/lib/data/use-portal-conversations";
import { useMyPartnerActionsNeeded } from "@/lib/data/use-partner-portal-actions";
import { isProjectAction } from "@/lib/portal/project-progress";
import { PortalProjects } from "@/components/portal/PortalSections";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { PageLoadError } from "@/components/common/QueryState";

const MODULE_TONE: Record<string, string> = {
  creditops: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
  fundingops: "border-sky-500/40 bg-sky-500/10 text-sky-900",
  bes_crm: "border-violet-500/40 bg-violet-500/10 text-violet-900",
  talentops: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  sales_marketing: "border-pink-500/40 bg-pink-500/10 text-pink-900",
};

const STATUS_TONE: Record<string, string> = {
  Active: "text-status-success",
  Paused: "text-amber-700",
  Pending: "text-muted-foreground",
  Ended: "text-muted-foreground",
};

export function PortalServices() {
  /* The same query Messages reads to decide which channels to offer. One key,
     one request, whichever page the partner opens first (rule 14). */
  const services = useMyPartnerServices();
  /* The same list (and query key) as Actions Needed and the Overview badge —
     no second request for the same asks (rule 14). */
  const actions = useMyPartnerActionsNeeded();
  const approvals = (actions.data ?? []).filter(isProjectAction).length;

  if (services.isLoading) {
    return <p className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></p>;
  }

  if (services.isError) return <PageLoadError what="Your services" />;

  const rows = services.data ?? [];
  /* Approvals and items BES needs, said once at the top and answered on
     Actions Needed — one place to act, never two. */
  const approvalsBanner = approvals > 0 && (
    <Link to="/partner/actions"
      className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span><span className="font-semibold">{approvals} approval{approvals === 1 ? "" : "s"} or item{approvals === 1 ? "" : "s"}</span> waiting on you for your projects</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold">Open Actions Needed <ArrowRight className="h-3 w-3" /></span>
    </Link>
  );
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <Workflow className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">No active services</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          What BES is delivering for you appears here as soon as an engagement starts. Your history
          stays on your account whatever is running today.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
    {approvalsBanner}
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((s) => (
        <section key={s.engagementId} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <span className={cn("inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                MODULE_TONE[s.module] ?? "border-border bg-muted text-foreground")}>
                {s.moduleLabel}
              </span>
              <h2 className="mt-1.5 text-sm font-bold text-foreground">{s.serviceLabel}</h2>
            </div>
            <span className={cn("shrink-0 text-xs font-semibold", STATUS_TONE[s.status] ?? "text-foreground")}>
              {s.status}
            </span>
          </div>

          <dl className="mt-2 space-y-1">
            {s.startedOn && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3 w-3 shrink-0" />
                Started {formatDate(s.startedOn)}
                {s.endsOn && ` · ends ${formatDate(s.endsOn)}`}
              </div>
            )}
            {s.milestone && (
              <div className="flex items-center gap-1.5 text-[11px] text-foreground">
                <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground" />
                {s.milestone}
              </div>
            )}
          </dl>

          {s.linkKind === "clients" && (
            <Link to="/partner/clients"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              View clients <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </section>
      ))}
    </div>
    {/* The builds themselves: progress, milestones, deliverables and what BES
        needs (Dee, 2026-10-01 doctrine). The section hides itself when there
        is no build — it never claims "none" on a failed load. */}
    <PortalProjects />
    </div>
  );
}
