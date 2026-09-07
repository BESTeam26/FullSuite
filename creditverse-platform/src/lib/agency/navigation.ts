/**
 * What each BES role may reach — ONE definition, read by the menu and by the
 * route guard.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Every agency staff member has been shown the whole platform: Organizations,
 * CreditOps, FundingOps, Billing, Compliance, Agency Settings. Only Reports
 * carried a permission. A new hire on their first day could open the billing
 * screen.
 *
 * ── HIDING A MENU ITEM IS NOT SECURITY ─────────────────────────────────────
 *
 * A hidden link is still a URL somebody can type. So the menu and the route
 * guard both call `accessTo()` — the same function, the same inputs, the same
 * answer. That is the point of this module: not that the menu is tidy, but
 * that the menu and the door agree.
 *
 * Real enforcement still lives in the database. RLS decides what rows anybody
 * gets; this decides what a person is shown and which doors open. Both, every
 * time (rule 3).
 */

export type AgencyRole =
  | "agency_owner" | "agency_admin" | "agency_manager" | "agency_team_lead" | "agency_agent";

/** Higher reaches more. Ordering only — not a permission in itself. */
const RANK: Record<AgencyRole, number> = {
  agency_agent: 0,
  agency_team_lead: 1,
  agency_manager: 2,
  agency_admin: 3,
  agency_owner: 4,
};

export type Readiness = "ready" | "locked_not_ready";

export interface AgencyRouteSpec {
  key: string;
  label: string;
  /** Exact route path under /app. */
  path: string;
  readiness: Readiness;
  /** The lowest role that may use this at all. */
  minRole: AgencyRole;
  /** An extra named permission, where the role alone is not the question. */
  permission?: string;
  /** Why it is locked. Shown to an owner, never invented. */
  lockedReason?: string;
}

/**
 * Every Agency HQ destination.
 *
 * A regular staff member's menu is the short list at the top: their work,
 * their day, the company calendar, and what they have been told. Everything
 * else is somebody's job, and a person who does not have that job does not
 * need the door.
 */
export const AGENCY_ROUTES: AgencyRouteSpec[] = [
  /* ── Everyone on the team ─────────────────────────────────────────── */
  { key: "home", label: "Home", path: "/app", readiness: "ready", minRole: "agency_agent" },
  { key: "my_work", label: "My Work", path: "/app/my-work", readiness: "ready", minRole: "agency_agent" },
  { key: "team_workspace", label: "Team Workspace", path: "/app/team-workspace", readiness: "ready", minRole: "agency_agent" },
  { key: "my_time", label: "My Time", path: "/app/my-time", readiness: "ready", minRole: "agency_agent" },
  { key: "eod", label: "End of Day", path: "/app/eod", readiness: "ready", minRole: "agency_agent" },
  { key: "calendar", label: "Calendar", path: "/app/calendar", readiness: "ready", minRole: "agency_agent" },
  { key: "announcements", label: "Announcements", path: "/app/announcements", readiness: "ready", minRole: "agency_agent" },
  { key: "education", label: "Knowledge Base", path: "/app/education", readiness: "ready", minRole: "agency_agent" },
  { key: "files", label: "Files", path: "/app/files", readiness: "ready", minRole: "agency_agent" },

  /* Deliberately empty: there is no notifications table, no recipient and no
     read state, so the page can only ever show nothing. It stays out of the
     staff menu until the model exists rather than sitting there looking
     broken. */
  {
    key: "notifications", label: "Notifications", path: "/app/notifications",
    readiness: "locked_not_ready", minRole: "agency_agent",
    lockedReason: "There is no notifications model yet — no recipient, no read state. The page can only show an empty list.",
  },

  /* ── Team leads and up ────────────────────────────────────────────── */
  { key: "attention", label: "Attention Center", path: "/app/attention", readiness: "ready", minRole: "agency_team_lead" },
  { key: "team_eod", label: "Team EOD", path: "/app/team-eod", readiness: "ready", minRole: "agency_team_lead" },

  /* ── Managers and up ──────────────────────────────────────────────── */
  { key: "people", label: "People", path: "/app/people", readiness: "ready", minRole: "agency_manager" },
  { key: "teams", label: "Teams", path: "/app/teams", readiness: "ready", minRole: "agency_manager" },
  { key: "workforce", label: "Workforce", path: "/app/workforce", readiness: "ready", minRole: "agency_manager" },
  { key: "reporting", label: "Reports", path: "/app/reporting", readiness: "ready", minRole: "agency_manager", permission: "reports.view" },
  { key: "partners", label: "BES Partners", path: "/app/bes-partners", readiness: "ready", minRole: "agency_manager" },
  { key: "creditops", label: "CreditOps", path: "/app/creditops", readiness: "ready", minRole: "agency_manager" },
  { key: "fundingops", label: "FundingOps", path: "/app/fundingops", readiness: "ready", minRole: "agency_manager" },
  { key: "bes_crm", label: "BES CRM", path: "/app/bes-crm", readiness: "ready", minRole: "agency_manager" },
  { key: "talentops", label: "TalentOps", path: "/app/talentops", readiness: "ready", minRole: "agency_manager" },

  /* ── Admins and the owner ─────────────────────────────────────────── */
  { key: "organizations", label: "Organizations", path: "/app/subaccounts", readiness: "ready", minRole: "agency_admin" },
  { key: "billing", label: "Billing & Revenue", path: "/app/billing", readiness: "ready", minRole: "agency_admin" },
  { key: "compliance", label: "Compliance & Legal", path: "/app/compliance", readiness: "ready", minRole: "agency_admin" },
  { key: "settings", label: "Agency Settings", path: "/app/settings", readiness: "ready", minRole: "agency_admin" },
  { key: "support", label: "Support", path: "/app/support", readiness: "ready", minRole: "agency_admin" },
];

export const routeFor = (path: string): AgencyRouteSpec | undefined =>
  AGENCY_ROUTES.find((r) => r.path === path);

/**
 * `allow`  — show it, open it.
 * `hide`   — keep it out of the menu; the door still says no.
 * `locked` — an owner/admin may SEE that it exists and is not ready.
 * `deny`   — the door says no.
 */
export type Access = "allow" | "hide" | "locked" | "deny";

export interface AccessContext {
  role: AgencyRole | null;
  /** Named permissions this person holds, from the canonical permission set. */
  can: (permission: string) => boolean;
}

/**
 * May this person reach this route?
 *
 * The menu asks this and hides anything that is not `allow` or `locked`. The
 * route guard asks the same question and refuses anything that is not
 * `allow`. One function, so the two can never disagree — which is the failure
 * that makes a hidden menu item feel like security when it is not.
 */
export function accessTo(spec: AgencyRouteSpec, ctx: AccessContext): Access {
  if (!ctx.role) return "deny";
  const rank = RANK[ctx.role];

  if (spec.readiness === "locked_not_ready") {
    /* An owner or admin is shown that it exists and is not finished. Nobody
       else sees it at all, and the door is shut for everyone — including the
       owner, because a page that cannot work does not work for them either. */
    return rank >= RANK.agency_admin ? "locked" : "hide";
  }

  if (rank < RANK[spec.minRole]) return "hide";
  if (spec.permission && !ctx.can(spec.permission)) return "hide";
  return "allow";
}

/** What the MENU should show. `locked` items are shown, marked, and inert. */
export function visibleRoutes(ctx: AccessContext): { spec: AgencyRouteSpec; access: Access }[] {
  return AGENCY_ROUTES
    .map((spec) => ({ spec, access: accessTo(spec, ctx) }))
    .filter((r) => r.access === "allow" || r.access === "locked");
}

/**
 * What the ROUTE should do. Only `allow` opens.
 *
 * Note the asymmetry with the menu, and that it is deliberate: `locked` is
 * visible but not enterable, and `hide` is neither. A person typing a URL for
 * something they cannot use is refused whether or not they could see the link.
 */
export function routeAllows(path: string, ctx: AccessContext): boolean {
  const spec = routeFor(path);
  /* A path with no spec is not an Agency HQ route; this module does not
     govern it and must not silently allow or refuse it. */
  if (!spec) return true;
  return accessTo(spec, ctx) === "allow";
}

/** Role ordering, exported so a caller can ask "is this person a manager?" */
export const atLeast = (role: AgencyRole | null, min: AgencyRole): boolean =>
  !!role && RANK[role] >= RANK[min];
