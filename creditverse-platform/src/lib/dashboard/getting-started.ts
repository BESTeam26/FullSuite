/**
 * The first-run checklist for an organization administrator, derived from
 * the organization's real state — never from a flag someone ticked. A step is
 * done when the record that proves it exists. Pure so the rules are tested.
 */
import type { ProductKey } from "@/lib/bes-domain";

export interface GettingStartedState {
  enabledModules: ProductKey[];
  brandingSet: boolean;
  /** Members other than the person looking, plus pending invitations. */
  teammates: number;
  clients: number;
  creditReports: number;
  letterTemplates: number;
  kpisChosen: number;
  fundingFiles: number;
}

export interface GettingStartedStep {
  key: string;
  title: string;
  detail: string;
  href: string;
  done: boolean;
}

export function gettingStartedSteps(s: GettingStartedState): GettingStartedStep[] {
  const creditOps = s.enabledModules.includes("creditOps");
  const fundingOps = s.enabledModules.includes("fundingOps");
  const steps: GettingStartedStep[] = [
    {
      key: "branding",
      title: "Brand your workspace",
      detail: "Add your logo and colour so your team and clients see your business, not a template.",
      href: "/app/settings?section=profile",
      done: s.brandingSet,
    },
    {
      key: "team",
      title: "Invite your team",
      detail: "Each person gets a role; the role decides what they can open and do.",
      href: "/app/settings?section=team",
      done: s.teammates > 0,
    },
  ];
  if (creditOps) {
    steps.push(
      {
        key: "client",
        title: "Add your first client",
        detail: "A client record holds their reports, disputes, letters and progress in one place.",
        href: "/app/clients",
        done: s.clients > 0,
      },
      {
        key: "report",
        title: "Import a credit report",
        detail: "Open the client, then Import & Analysis. PDF or CSV — every item is shown for review first.",
        href: "/app/clients",
        done: s.creditReports > 0,
      },
      {
        key: "letters",
        title: "Set up your Letter Library",
        detail: "Your approved letter templates. The builder only uses letters that are in the library.",
        href: "/app/settings?section=letters",
        done: s.letterTemplates > 0,
      },
    );
  }
  if (fundingOps) {
    steps.push({
      key: "funding",
      title: "Open your first funding file",
      detail: "A funding file carries the application, documents, lender matches and offers.",
      href: "/app/funding-files",
      done: s.fundingFiles > 0,
    });
  }
  steps.push({
    key: "kpis",
    title: "Choose the figures you track",
    detail: "Pick the KPIs your Reports and Home cards show, and set targets if you use them.",
    href: "/app/settings?section=kpis",
    done: s.kpisChosen > 0,
  });
  return steps;
}

export function gettingStartedProgress(steps: GettingStartedStep[]): { done: number; total: number; complete: boolean } {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}
