import type { ComponentType } from "react";

/**
 * Which JavaScript chunk each workspace screen lives in, keyed by its route.
 *
 * WHY THIS FILE EXISTS
 *
 * Every `/app` screen is code-split, so clicking a menu tab used to mean:
 * download the chunk, parse it, mount it, and only then start its queries.
 * The download is dead time the person watches as a skeleton — and it happens
 * once per screen per session, which is exactly "every tab I click" for
 * someone working through the menu.
 *
 * A chunk that is already in the module cache resolves synchronously, so the
 * cure is to fetch it *before* the click: on hover, on keyboard focus, and on
 * idle. That needs the same `import()` the router uses — a prefetch pointing
 * at a different module would warm the wrong file and look like it worked
 * while changing nothing.
 *
 * So the `import()` calls live here, once, and there are two consumers:
 *   - `App.tsx` builds its `lazy()` components from `chunkFor(path)`
 *   - `prefetchRoute(path)` warms the same loader from the sidebar
 *
 * Adding a screen means adding it here and pointing the route at it. A screen
 * missing from this map still works — it simply is not prefetched.
 */

type Loader = () => Promise<{ default: ComponentType }>;

/** Adapt a module that exports a named component into a default-export loader. */
export const named =
  <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T): Loader =>
  () =>
    loader().then((m) => ({ default: m[key] as ComponentType }));

/* Screens that share one module share one loader, so warming any of them
   warms all of them — that is a feature, not an accident. */
const hq = () => import("@/pages/app/HqPages");
const hq2 = () => import("@/pages/app/HqPages2");

/**
 * Route path → chunk loader.
 *
 * Paths are absolute and match the router's own, so a reader can compare this
 * list against `App.tsx` line by line.
 */
export const ROUTE_CHUNKS: Record<string, Loader> = {
  "/app": () => import("@/pages/app/Dashboard"),

  // HQ operations
  "/app/subaccounts": named(
    () => import("@/components/dashboard/SubAccountsManager"),
    "SubAccountsManager",
  ),
  "/app/attention": named(hq, "AttentionCenter"),
  "/app/my-work": named(hq, "MyWorkPage"),
  "/app/notifications": named(hq, "NotificationsPage"),
  "/app/my-time": named(() => import("@/pages/app/MyTimePage"), "MyTimePage"),
  "/app/eod": named(() => import("@/pages/app/EodPage"), "EodPage"),
  "/app/team-eod": named(() => import("@/pages/app/TeamEodPage"), "TeamEodPage"),
  "/app/team-workspace": named(
    () => import("@/pages/app/AgencyTeamWorkspace"),
    "AgencyTeamWorkspace",
  ),
  "/app/channels": () => import("@/pages/app/Channels"),
  "/app/marketing": named(() => import("@/pages/app/SalesMarketing"), "SalesMarketing"),
  "/app/calendar": named(
    () => import("@/pages/app/AgencyOrOrgCalendar"),
    "AgencyOrOrgCalendar",
  ),

  // People and company
  "/app/people": named(() => import("@/pages/app/PeopleHubPage"), "PeopleHubPage"),
  "/app/people/:userId": () => import("@/pages/app/TeamMemberProfilePage"),
  "/app/teams": named(hq2, "TeamsPage"),
  "/app/announcements": named(hq2, "AnnouncementsPage"),
  "/app/support": named(hq2, "SupportPage"),
  "/app/billing": named(hq2, "BillingPage"),
  "/app/files": () => import("@/pages/app/CompanyFiles"),
  "/app/tools": () => import("@/pages/app/CompanyTools"),

  // Modules
  "/app/creditops": () => import("@/pages/app/CreditOps"),
  "/app/fundingops": () => import("@/pages/app/FundingOps"),
  "/app/bes-crm": () => import("@/pages/app/BesCrm"),
  "/app/talentops": () => import("@/pages/app/TalentOps"),
  "/app/workspaces": () => import("@/pages/app/Workspaces"),

  // Clients and cases
  "/app/clients": () => import("@/pages/app/Clients"),
  "/app/clients/:id": () => import("@/pages/app/ClientProfile"),
  "/app/creditops/cases": () => import("@/pages/app/CreditCases"),
  "/app/creditops/cases/:id": () => import("@/pages/app/ClientDetail"),
  "/app/dispute-dashboard": () => import("@/pages/app/DisputeDashboard"),
  "/app/operations": () => import("@/pages/app/OrganizationCreditOps"),

  // FundingOps
  "/app/funding-workspace": () => import("@/pages/app/OrganizationFundingOps"),
  "/app/funding-files": () => import("@/pages/app/FundingFiles"),
  "/app/funding-files/:fileId": () => import("@/pages/app/FundingFileDetail"),
  "/app/funding-dashboard": () => import("@/pages/app/FundingDashboard"),
  "/app/funding-deals": () => import("@/pages/app/FundingDeals"),
  "/app/funding-deals/:dealId": () => import("@/pages/app/FundingDealDetail"),
  "/app/lenders": () => import("@/pages/app/Lenders"),

  // Partners, money, governance
  "/app/bes-partners": () => import("@/pages/app/BesPartners"),
  "/app/bes-partners/:id": named(
    () => import("@/pages/app/PartnerProfilePage"),
    "PartnerProfilePage",
  ),
  "/app/commissions": () => import("@/pages/app/Commissions"),
  "/app/diy-referrals": () => import("@/pages/app/DiyReferrals"),
  "/app/finance": named(() => import("@/pages/app/AgencyFinance"), "AgencyFinance"),
  "/app/reporting": () => import("@/pages/app/Reporting"),
  "/app/compliance": () => import("@/pages/app/Compliance"),
  "/app/education": () => import("@/pages/app/Education"),
  "/app/settings": () => import("@/pages/app/Settings"),
  /* DIY management is entitled but not built; the menu still offers it, so the
     screen that says so should arrive as fast as any other. */
  "/app/diy-management": () => import("@/pages/DiyNotBuilt"),
  "/app/access-preview": named(
    () => import("@/pages/app/AccessPreviewPage"),
    "AccessPreviewPage",
  ),
  "/app/org/:orgPublicId": () => import("@/pages/app/OrganizationDashboard"),
};

/**
 * The loader for a route, for `lazy()`.
 *
 * Throws for an unknown path rather than returning a loader that fails at
 * render time: a typo here is a build-order mistake, and it should surface
 * while the module graph is being built, not as a blank screen.
 */
export const chunkFor = (path: string): Loader => {
  const loader = ROUTE_CHUNKS[path];
  if (!loader) throw new Error(`No route chunk registered for ${path}`);
  return loader;
};

/**
 * Strip what identifies a screen's *contents* from what identifies its *code*.
 *
 * `/app/funding-deals?view=funded` and `/app/funding-deals` are the same
 * chunk, and `/app/clients/abc123` is the `:id` screen. Query and hash never
 * change which module loads; a single dynamic segment usually does.
 */
export const chunkKeyFor = (href: string): string | null => {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/app";
  if (ROUTE_CHUNKS[path]) return path;

  // Otherwise the same shape with exactly one segment replaced by a parameter:
  // /app/clients/abc123 -> /app/clients/:id
  const segments = path.split("/");
  const match = Object.keys(ROUTE_CHUNKS).find((registered) => {
    const parts = registered.split("/");
    if (parts.length !== segments.length) return false;
    let parameters = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) parameters++;
      else if (parts[i] !== segments[i]) return false;
    }
    return parameters === 1;
  });
  return match ?? null;
};

/* Loaders already started. `import()` is itself idempotent — the bundler
   returns the same promise — but remembering avoids re-entering the map and
   makes "was this warmed?" answerable in a test. */
const warmed = new Set<string>();

/**
 * Start downloading a screen's chunk without rendering it.
 *
 * Safe to call on every hover: a chunk is fetched at most once, a failure is
 * swallowed (the real navigation will surface it through the error boundary),
 * and nothing here can change what the person sees.
 */
export const prefetchRoute = (href: string): void => {
  const key = chunkKeyFor(href);
  if (!key || warmed.has(key)) return;
  warmed.add(key);
  try {
    void ROUTE_CHUNKS[key]().catch(() => warmed.delete(key));
  } catch {
    warmed.delete(key);
  }
};

/** Whether a route's chunk has already been requested. Exposed for tests. */
export const isWarmed = (href: string): boolean => {
  const key = chunkKeyFor(href);
  return key !== null && warmed.has(key);
};

/** Test seam: forget what has been warmed. */
export const resetWarmed = (): void => warmed.clear();
