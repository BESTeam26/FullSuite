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
  /** Hub modules the organization has decided about, either way. */
  hubChoices: number;
  /** Automatic touches switched on — birthday greetings and the like. */
  automations: number;
}

export interface GettingStartedStep {
  key: string;
  title: string;
  detail: string;
  href: string;
  done: boolean;
  /** A suggestion, not a chore: it never holds the guide open. */
  optional?: boolean;
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
      detail: "Each person gets a role; the role decides what they can open and do. They get an email asking them to activate.",
      href: "/app/settings?section=team",
      done: s.teammates > 0,
    },
    {
      key: "hub",
      title: "Choose what your company runs here",
      detail: "Announcements, People, Departments, Knowledge, Files and Tools are ready to switch on or off. This decides what your team sees in the sidebar.",
      href: "/app/settings?section=hub",
      done: s.hubChoices > 0,
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
  steps.push(
    {
      key: "kpis",
      title: "Choose the figures you track",
      detail: "Pick the KPIs your Reports and Home cards show, and set targets if you use them.",
      href: "/app/settings?section=kpis",
      done: s.kpisChosen > 0,
    },
    {
      key: "automations",
      title: "Turn on the automatic touches",
      detail: "Birthday greetings for your team and your clients, and the other messages that go out without anyone remembering.",
      href: "/app/settings?section=org-automations",
      done: s.automations > 0,
      optional: true,
    },
  );
  return steps;
}

/**
 * Progress counts only the steps that are actually required. An optional
 * suggestion must never be the reason a guide refuses to go away — otherwise
 * somebody who does not want birthday greetings is nagged forever.
 */
export function gettingStartedProgress(steps: GettingStartedStep[]): { done: number; total: number; complete: boolean } {
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return { done, total: required.length, complete: done === required.length };
}

/* ------------------------------------------------------------------ */
/* The other first run: somebody who was invited, not somebody who     */
/* signed up. They configure nothing — the workspace is already set    */
/* up around them — so their guide is only about themselves.           */
/* ------------------------------------------------------------------ */

export interface MemberFirstRunState {
  avatarSet: boolean;
  phoneSet: boolean;
  preferredNameSet: boolean;
  birthdayShared: boolean;
}

export function memberFirstRunSteps(s: MemberFirstRunState): GettingStartedStep[] {
  return [
    {
      key: "photo",
      title: "Add your photo",
      detail: "Your colleagues see who they are working with in comments, mentions and the company directory.",
      href: "/app/settings?section=account",
      done: s.avatarSet,
    },
    {
      key: "contact",
      title: "Add your phone number",
      detail: s.preferredNameSet
        ? "So your team can reach you without hunting for it."
        : "So your team can reach you — and set the name you actually go by while you are there.",
      href: "/app/settings?section=account",
      done: s.phoneSet,
    },
    {
      key: "birthday",
      title: "Share your birthday",
      detail: "Only the day and month, and only if you want it marked. You can leave it out.",
      href: "/app/settings?section=account",
      done: s.birthdayShared,
      optional: true,
    },
  ];
}
