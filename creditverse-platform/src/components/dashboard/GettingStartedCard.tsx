/**
 * First-run guide on an organization's Home, for administrators only.
 *
 * Reads the organization's real records to decide what is done; disappears on
 * its own once every step is complete. Collapsing it is a per-viewer
 * convenience kept in the browser. Members without an administration
 * permission never see it — setup is not their job (rule 3).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Circle, Rocket } from "lucide-react";
import type { ProductKey } from "@/lib/bes-domain";
import { usePermissions } from "@/lib/auth/use-permission";
import { useAuth } from "@/lib/auth/auth-context";
import { useTeamMembers } from "@/lib/data/use-team-members";
import { useLetterTemplates } from "@/lib/data/use-letters";
import { useOrganizationKpiSettings } from "@/lib/data/use-reporting-engine";
import { useOrganizationReportCount } from "@/lib/data/use-credit-reports";
import { gettingStartedProgress, gettingStartedSteps } from "@/lib/dashboard/getting-started";
import { cn } from "@/lib/utils";

interface Props {
  organizationId: string;
  enabledModules: ProductKey[];
  brandingSet: boolean;
  clients: number;
  fundingFiles: number;
}

const storageKey = (orgId: string) => `bes.getting-started.collapsed.${orgId}`;

function readCollapsed(orgId: string): boolean {
  try { return localStorage.getItem(storageKey(orgId)) === "1"; } catch { return false; }
}

export function GettingStartedCard({ organizationId, enabledModules, brandingSet, clients, fundingFiles }: Props) {
  const auth = useAuth();
  const { can, loading } = usePermissions();
  const isAdmin = !loading && can(["settings.manage", "team.manage"]);
  const team = useTeamMembers(isAdmin ? organizationId : null);
  const letters = useLetterTemplates();
  const kpis = useOrganizationKpiSettings(isAdmin ? organizationId : null);
  const reports = useOrganizationReportCount(isAdmin && enabledModules.includes("creditOps") ? organizationId : null);
  const [collapsed, setCollapsed] = useState(() => readCollapsed(organizationId));

  if (!isAdmin) return null;
  const pending = team.isLoading || letters.isLoading || kpis.isLoading || reports.isLoading;
  if (pending) return <div className="mb-6 h-14 rounded-xl border border-border bg-card" aria-busy="true" />;

  const steps = gettingStartedSteps({
    enabledModules,
    brandingSet,
    teammates: team.members.filter((m) => m.userId !== auth.user?.id).length + team.invitations.length,
    clients,
    creditReports: reports.data ?? 0,
    letterTemplates: letters.templates.length,
    kpisChosen: (kpis.data ?? []).filter((k) => k.enabled).length,
    fundingFiles,
  });
  const progress = gettingStartedProgress(steps);
  if (progress.complete) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey(organizationId), next ? "1" : "0"); } catch { /* per-viewer convenience only */ }
  };

  return (
    <section aria-labelledby="getting-started-title" className="mb-6 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card shadow-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><Rocket className="h-4 w-4" /></span>
          <span>
            <span id="getting-started-title" className="block text-sm font-bold text-foreground">Getting started</span>
            <span className="block text-xs text-muted-foreground">{progress.done} of {progress.total} steps done. Finish these and this guide goes away on its own.</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
            <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </span>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </span>
      </button>
      {!collapsed && (
        <ol className="grid gap-2 border-t border-border/60 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.key}>
              <Link
                to={step.href}
                aria-disabled={step.done}
                className={cn(
                  "flex h-full items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  step.done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                {step.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-semibold", step.done ? "text-muted-foreground line-through decoration-emerald-600/50" : "text-foreground")}>
                    {i + 1}. {step.title}
                  </span>
                  <span className="block text-[11px] leading-relaxed text-muted-foreground">{step.detail}</span>
                </span>
                {!step.done && <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
