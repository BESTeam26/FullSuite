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

/**
 * The two application security roles (0234, Dee's permanent model). Ownership
 * is a FLAG on the membership, and manager / team lead / agent are POSITIONS,
 * not authority. The retired enum values may still arrive from old rows or
 * old sessions, so `isAdminRole` below normalizes rather than trusting the
 * union to be exhaustive at runtime.
 */
export type AgencyRole = "agency_admin" | "agency_user";

/** A retired value read from an old row fails SAFE: owner was an admin, every
    rank below admin is a user. */
export const isAdminRole = (role: string | null | undefined): boolean =>
  role === "agency_admin" || role === "agency_owner";

export type Readiness = "ready" | "locked_not_ready";

export interface AgencyRouteSpec {
  key: string;
  label: string;
  /** Exact route path under /app. */
  path: string;
  readiness: Readiness;
  /**
   * Who the door is for. Rank is retired (0234):
   *   "user"   — everyone active at the agency
   *   "lead"   — an admin, an ops.manage holder, or somebody who LEADS a team
   *   "manage" — an admin, or an Agency User granted ops.manage
   *   "admin"  — admins only
   */
  access: "user" | "lead" | "manage" | "admin";
  /** An extra named permission, where the gate alone is not the question. */
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
  /* Owner, or an admin granted the capability. `accessTo` hides it from
     everybody else, and RequireAgencyRoute refuses the URL — the door and the
     menu read the same spec. */
  { key: "access-preview", path: "/app/access-preview", label: "Access preview",
    access: "admin", permission: "access.preview_as_user", readiness: "ready" },
  /* ── Everyone on the team ─────────────────────────────────────────── */
  { key: "home", label: "Home", path: "/app", readiness: "ready", access: "user" },
  { key: "my_work", label: "My Work", path: "/app/my-work", readiness: "ready", access: "user" },
  { key: "team_workspace", label: "Team Workspace", path: "/app/team-workspace", readiness: "ready", access: "user" },
  { key: "my_time", label: "My Time", path: "/app/my-time", readiness: "ready", access: "user" },
  { key: "eod", label: "End of Day", path: "/app/eod", readiness: "ready", access: "user" },
  { key: "calendar", label: "Calendar", path: "/app/calendar", readiness: "ready", access: "user" },
  { key: "announcements", label: "Announcements", path: "/app/announcements", readiness: "ready", access: "user" },
  { key: "education", label: "Knowledge Base", path: "/app/education", readiness: "ready", access: "user" },
  { key: "files", label: "Files", path: "/app/files", readiness: "ready", access: "user" },

  /* WAS `locked_not_ready`, on the true statement that there was no
     notifications model. There is one now — a `notifications` table with a
     recipient, read state, and triggers that route assignment, handoff,
     mention, direct message, announcement and attention (0005, 0006, 0218).

     Leaving it locked was not cosmetic staleness. `locked` means the route
     guard REFUSES the URL for everybody, including the owner — and the Topbar
     bell links here unconditionally. So clicking the bell showed
     "Notifications is not available yet" on a page full of real rows: exactly
     the "a visible link must not lead to a refusal" failure the shared
     `accessTo` exists to prevent, caused by a readiness flag nobody revisited
     when the feature landed. */
  { key: "notifications", label: "Notifications", path: "/app/notifications", readiness: "ready", access: "user" },

  /* ── Team leads and up ────────────────────────────────────────────── */
  { key: "attention", label: "Attention Center", path: "/app/attention", readiness: "ready", access: "lead" },
  { key: "team_eod", label: "Team EOD", path: "/app/team-eod", readiness: "ready", access: "lead" },

  /* ── Managers and up ──────────────────────────────────────────────── */
  /* Team Members (Dee, 2026-09-10 §38): admins and managers see everyone,
     a Team Lead sees the members of the teams they lead — the page scopes the
     directory to that; an Agent has no company directory by default. */
  { key: "people", label: "Team Members", path: "/app/people", readiness: "ready", access: "lead" },
  { key: "teams", label: "Teams", path: "/app/teams", readiness: "ready", access: "lead" },
  { key: "reporting", label: "Reports", path: "/app/reporting", readiness: "ready", access: "manage", permission: "reports.view" },
  { key: "partners", label: "BES Partners", path: "/app/bes-partners", readiness: "ready", access: "manage" },
  /* ── Operational modules: ACCESS is the module key, never ops.manage ──
     §59 (release-blocking): an agent hired to work CreditOps enters CreditOps
     with the module grant and their assignments — being made a manager is not
     the price of doing the job. The named key opens the door; RLS scope and
     assignment decide which rows exist inside; ops.manage governs management
     surfaces only. Admins pass because the resolver answers true for them. */
  { key: "creditops", label: "CreditOps", path: "/app/creditops", readiness: "ready", access: "user", permission: "creditops.clients.view" },
  { key: "fundingops", label: "FundingOps", path: "/app/fundingops", readiness: "ready", access: "user", permission: "fundingops.files.view" },
  { key: "bes_crm", label: "BES CRM", path: "/app/bes-crm", readiness: "ready", access: "user", permission: "crm.projects.view" },
  { key: "talentops", label: "TalentOps", path: "/app/talentops", readiness: "ready", access: "user", permission: "talentops.view" },
  { key: "marketing", label: "Sales & Marketing", path: "/app/marketing", readiness: "ready", access: "user", permission: "marketing.workspace.view" },

  /* ── Admins and the owner ─────────────────────────────────────────── */
  { key: "organizations", label: "Organizations", path: "/app/subaccounts", readiness: "ready", access: "admin" },
  /* The agency's own money: what partners owe BES and what BES pays out.
     Separate from "Organization billing", which is SaaS subscription metering
     for customers — a different revenue stream and a different question. */
  /* Money is owner-gated (0299): `finance.dashboard.view` is false for an
     admin unless the owner granted it, and true for a granted billing
     specialist who is only an Agency User — so the ROLE gate has to step out
     of the way and let the capability decide, exactly as the module keys do. */
  { key: "finance", label: "Finance", path: "/app/finance", readiness: "ready", access: "user", permission: "finance.dashboard.view" },
  /* Agency-wide money, so it follows the same owner-gated capability as
     Finance (0299, Dee 2026-09-11: "same with Finance, I don't want this
     automatically shown to all admin unless I allow them"). One switch —
     "Financial dashboard" — governs both surfaces. */
  { key: "billing", label: "Organization billing", path: "/app/billing", readiness: "ready", access: "user", permission: "finance.dashboard.view" },
  { key: "compliance", label: "Compliance & Legal", path: "/app/compliance", readiness: "ready", access: "admin" },
  { key: "settings", label: "Agency Settings", path: "/app/settings", readiness: "ready", access: "admin" },
  { key: "support", label: "Support", path: "/app/support", readiness: "ready", access: "admin" },
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
  /** Leads at least one live team — a fact from team_memberships, not a rank. */
  leadsTeam: boolean;
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
  const admin = isAdminRole(ctx.role);
  /* The same grant the database consults in `is_manager_of` (0234): the
     manager RANK is retired, and management authority is the admin role or
     the explicit ops.manage capability. */
  const manages = admin || ctx.can("ops.manage");

  if (spec.readiness === "locked_not_ready") {
    /* An admin is shown that it exists and is not finished. Nobody else sees
       it at all, and the door is shut for everyone — a page that cannot work
       does not work for them either. */
    return admin ? "locked" : "hide";
  }

  const gate =
    spec.access === "user" ? true
    : spec.access === "lead" ? manages || ctx.leadsTeam
    : spec.access === "manage" ? manages
    : admin;
  if (!gate) return "hide";
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

/**
 * "Does this person hold management authority?" — the question `atLeast`
 * used to answer with a ladder. Same answer as `is_manager_of` in the
 * database: admin, or the explicit ops.manage grant.
 */
export const managesAgency = (ctx: Pick<AccessContext, "role" | "can">): boolean =>
  isAdminRole(ctx.role) || ctx.can("ops.manage");
