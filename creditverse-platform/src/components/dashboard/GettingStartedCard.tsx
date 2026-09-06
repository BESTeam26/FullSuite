/**
 * First-run guides on an organization's Home.
 *
 * Two of them, because two different people arrive at a new workspace: the
 * owner who signed up and has a company to configure, and somebody who was
 * invited into a company that is already configured and whose only setup is
 * their own profile. An administrator sees the first; everyone else sees the
 * second (rule 3 — setup is not a processor's job, so it is not offered).
 *
 * Both read the organization's or the person's real records to decide what is
 * done — never a "finished onboarding" flag, which lies the moment a step is
 * undone or a second administrator does it instead. Both disappear on their
 * own once the required steps are complete. Collapsing is a per-viewer
 * convenience kept in the browser.
 *
 * Each guide costs one round trip, not one per fact (rule 14).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Circle, Rocket } from "lucide-react";
import type { ProductKey } from "@/lib/bes-domain";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions } from "@/lib/auth/use-permission";
import { useMemberFirstRun, useOrganizationFirstRun } from "@/lib/data/use-first-run";
import {
  gettingStartedProgress,
  gettingStartedSteps,
  memberFirstRunSteps,
  type GettingStartedStep,
  type MemberFirstRunState,
} from "@/lib/dashboard/getting-started";
import { cn } from "@/lib/utils";

interface Props {
  organizationId: string;
  enabledModules: ProductKey[];
}

const storageKey = (scope: string) => `bes.getting-started.collapsed.${scope}`;

function readCollapsed(scope: string): boolean {
  try { return localStorage.getItem(storageKey(scope)) === "1"; } catch { return false; }
}

export function GettingStartedCard({ organizationId, enabledModules }: Props) {
  const auth = useAuth();
  const { can, loading } = usePermissions();
  const isAdmin = !loading && can(["settings.manage", "team.manage"]);
  /* BES staff supporting a customer are looking at somebody else's workspace.
     Its setup is not theirs to finish, and nor is this the place to be nudged
     about their own photo — that belongs on their own Home. */
  const isMemberHere = auth.orgMemberships.some((m) => m.organization_id === organizationId);
  const org = useOrganizationFirstRun(isAdmin ? organizationId : null);
  const member = useMemberFirstRun(!loading && !isAdmin && isMemberHere);

  if (loading) return <Skeleton />;

  if (isAdmin) {
    if (org.isLoading) return <Skeleton />;
    if (!org.data) return null;
    return (
      <Guide
        scope={organizationId}
        title="Getting started"
        subtitle={(done, total) => `${done} of ${total} steps done. Finish these and this guide goes away on its own.`}
        steps={gettingStartedSteps({ ...org.data, enabledModules })}
      />
    );
  }

  if (!isMemberHere) return null;
  if (member.isLoading) return <Skeleton />;
  if (!member.data) return null;
  return <MemberGuide state={member.data} />;
}

/**
 * The same welcome for somebody who was invited onto the BES team rather than
 * into a customer organization. Their setup is identical — it is their own
 * profile — so it is the same guide, not a second one.
 */
export function MemberFirstRunCard() {
  const member = useMemberFirstRun(true);
  if (member.isLoading) return <Skeleton />;
  if (!member.data) return null;
  return <MemberGuide state={member.data} />;
}

function MemberGuide({ state }: { state: MemberFirstRunState }) {
  return (
    <Guide
      scope="me"
      title="Welcome — finish setting yourself up"
      subtitle={(done, total) => `${done} of ${total} done. Your colleagues will see who they are working with.`}
      steps={memberFirstRunSteps(state)}
    />
  );
}

function Skeleton() {
  return <div className="mb-6 h-14 rounded-xl border border-border bg-card" aria-busy="true" />;
}

interface GuideProps {
  /** What the collapsed preference belongs to: an organization, or the person. */
  scope: string;
  title: string;
  subtitle: (done: number, total: number) => string;
  steps: GettingStartedStep[];
}

function Guide({ scope, title, subtitle, steps }: GuideProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(scope));
  const progress = gettingStartedProgress(steps);
  if (progress.complete) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey(scope), next ? "1" : "0"); } catch { /* per-viewer convenience only */ }
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
            <span id="getting-started-title" className="block text-sm font-bold text-foreground">{title}</span>
            <span className="block text-xs text-muted-foreground">{subtitle(progress.done, progress.total)}</span>
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
