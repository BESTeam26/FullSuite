/**
 * The organization's home. Every figure is derived from rows RLS returned for
 * this organization: its open work, its workspaces, its enabled modules, its
 * clients where entitled. Nothing here is a sample number.
 *
 * The route carries the permanent Organization ID (BES-XXXXXX). Reaching it
 * selects that organization IF this user can see it (membership, or BES staff);
 * an unknown or unauthorized id renders a plain "not available" and offers the
 * way back — never another organization's data.
 */
import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Building2, LayoutGrid, ListTodo, Users, FileText, Landmark, Workflow, ArrowRight, Hash } from "lucide-react";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { useOrganizationWork } from "@/lib/data/use-work";
import { useWorkspaces } from "@/lib/data/use-workspaces";
import { useOrganizationTrial } from "@/lib/data/use-organization-trial";
import { isOverdue } from "@/lib/workspaces/workspace-domain";
import { PRODUCT_LABELS, type ProductKey } from "@/lib/bes-domain";
import { StatCard, ContentCard, DivisionTable, StatusPill } from "@/components/dashboard/DivisionLayout";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";

const MODULE_LINKS: Partial<Record<ProductKey, { href: string; icon: typeof FileText; blurb: string }>> = {
  creditOps: { href: "/app/operations", icon: FileText, blurb: "Credit repair operations" },
  fundingOps: { href: "/app/metro2", icon: Landmark, blurb: "Funding pipeline" },
  workspaces: { href: "/app/workspaces", icon: LayoutGrid, blurb: "Your own boards and work items" },
  crm: { href: "/app/bes-crm", icon: Workflow, blurb: "BES delivery projects and published updates" },
};

export default function OrganizationDashboard() {
  const { orgPublicId = "" } = useParams();
  const agency = useAgency();
  const auth = useAuth();
  const state = agency.activateOrganizationByPublicId(orgPublicId);
  const org = agency.activeOrganization;
  const isThisOrg = !!org && org.publicId === orgPublicId;

  // Route → context happens in render via the resolver; the effect only marks
  // the end of a switch for the dev-mode timing readout.
  useEffect(() => {
    if (isThisOrg && typeof performance !== "undefined" && performance.getEntriesByName("bes:org-switch:start").length) {
      performance.mark("bes:org-switch:end");
      const m = performance.measure("bes:org-switch", "bes:org-switch:start", "bes:org-switch:end");
      if (import.meta.env.DEV) console.debug(`[bes] organization switch rendered in ${Math.round(m.duration)} ms`);
      performance.clearMarks("bes:org-switch:start"); performance.clearMarks("bes:org-switch:end"); performance.clearMeasures("bes:org-switch");
    }
  }, [isThisOrg, orgPublicId]);

  const work = useOrganizationWork(isThisOrg ? org.id : null);
  const { workspaces } = useWorkspaces(isThisOrg ? org.id : null);
  const { trial } = useOrganizationTrial(isThisOrg ? org.id : null);

  const overdue = useMemo(() => work.items.filter((w) => w.dueAt && isOverdue({ dueAt: w.dueAt, completedAt: null } as never)).length, [work.items]);
  const mine = useMemo(() => work.items.filter((w) => w.assignedTo === auth.user?.id).length, [work.items, auth.user?.id]);

  if (state === "loading") return <p className="p-8 text-center text-sm text-muted-foreground">Loading organization…</p>;
  if (state === "unknown" || !isThisOrg) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Building2 className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">This organization is not available to you</p>
          <p className="mt-1 text-xs text-muted-foreground">Either the ID is wrong or you are not a member. Nothing from it is shown.</p>
          <Link to="/app" className="mt-4 inline-block text-xs font-semibold text-primary underline-offset-2 hover:underline">Back to your home</Link>
        </div>
      </div>
    );
  }
  if (!auth.isAgencyStaff && agency.viewMode !== "subaccount") return <Navigate to="/app" replace />;

  const enabled = org.entitlements.filter((e) => e.enabled);
  const initials = org.name.replace(/^\[TEST\]\s*/, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          {org.branding?.logoUrl ? (
            <img src={org.branding.logoUrl} alt="" className="h-11 w-11 rounded-xl object-contain" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: org.branding?.primaryColor || "hsl(var(--primary))" }}>{initials}</div>
          )}
          <div>
            <h1 className="text-lg font-bold text-foreground">{org.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-mono text-foreground"><Hash className="h-3 w-3" />{org.publicId}</span>
              <span>{org.principal.name} · {org.principal.email}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {enabled.length === 0 ? <StatusPill status="No modules enabled" /> : enabled.map((e) => <StatusPill key={e.key} status={e.label} />)}
        </div>
      </div>

      {trial && (
        <div
          className={
            trial.status === "blocked"
              ? "mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
              : "mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-foreground"
          }
          role="status"
        >
          {trial.status === "active" && (
            <>Introductory trial active until <strong>{new Date(trial.endsAt).toLocaleDateString()}</strong>.{trial.blockedReason === "name_match_review" ? " BES is reviewing this organization because a similar business is already on record." : ""}</>
          )}
          {trial.status === "blocked" && (
            <>A free trial is not available for this business because it is already on record with BES. Contact BES to activate your organization.</>
          )}
          {trial.status === "expired" && <>Your introductory trial has ended. Contact BES to activate your organization.</>}
          {trial.status === "converted" && <>Your organization is active.</>}
        </div>
      )}
      <div className="mb-3 flex items-center gap-2">
        <DataSourceBadge source={work.source} />
        <span className="text-xs text-muted-foreground">Figures are derived from this organization's own records.</span>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open work items" value={work.isLoading ? "…" : work.items.length} icon={ListTodo} />
        <StatCard label="Assigned to you" value={work.isLoading ? "…" : mine} icon={Users} />
        <StatCard label="Overdue" value={work.isLoading ? "…" : overdue} icon={ListTodo} />
        <StatCard label="Workspaces" value={workspaces.length} icon={LayoutGrid} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ContentCard title="Open work">
            {work.error ? (
              <p className="text-sm text-red-700">Could not load work: {work.error}</p>
            ) : work.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : work.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No open work items for this organization.</p>
            ) : (
              <DivisionTable columns={["Item", "Stage", "Due"]} rows={work.items.slice(0, 12).map((w) => [w.title, <StatusPill status={w.stage} />, w.dueAt ? new Date(w.dueAt).toLocaleDateString() : "—"])} />
            )}
          </ContentCard>
        </div>
        <ContentCard title="Your modules">
          {enabled.length === 0 ? (
            <p className="text-xs text-muted-foreground">No modules are enabled for this organization yet.</p>
          ) : (
            <ul className="space-y-2">
              {enabled.map((e) => {
                const link = MODULE_LINKS[e.key];
                const Icon = link?.icon ?? FileText;
                const body = (
                  <>
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{PRODUCT_LABELS[e.key]}</span>
                      {link && <span className="block text-[11px] text-muted-foreground">{link.blurb}</span>}
                    </span>
                    {link && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </>
                );
                return (
                  <li key={e.key}>
                    {link ? (
                      <Link to={link.href} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link>
                    ) : (
                      <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ContentCard>
      </div>
    </div>
  );
}
