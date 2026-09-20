/**
 * People & Teams, as data.
 *
 * Dee, 2026-09-19, locking the Workforce IA: two systems only —
 *
 *   "Me"                      → Time & Attendance (Overview · My Time ·
 *                               My Attendance · My Time Off)
 *   "My people / BES people"  → People & Teams
 *
 * People & Teams is the ONE management workspace. Team Management and Teams
 * are gone as destinations; their working pieces are sections here. The
 * sections nest under the parent in the global sidebar and appear as tabs on
 * the page — the same rows drive both, so the menu and the page cannot
 * disagree.
 *
 * ── ROLE-ADAPTIVE, NOT ROLE-NAMED ──────────────────────────────────────────
 *
 * Dee: "those tabs are role-adaptive, so an executive isn't staring at
 * everything all the time." A section names the AUDIENCE it answers to:
 *
 *   Agent            → nothing. They use Time & Attendance and End of Day.
 *   Team Lead        → Overview · Members · Schedule · Attendance · Time Off ·
 *                      EOD · Performance, over the teams they lead.
 *   Division Manager → the same operational sections over their division,
 *                      plus the Org Chart (organizational visibility).
 *   Executive/admin  → everything, including Structure and Positions.
 *
 * `leadsTeam` is a real `team_memberships.is_lead` relationship; `manages` is
 * the admin role or the explicit ops.manage capability; `administers` is the
 * admin role. Data scope inside each section comes from the database
 * (`managed_people()` and the row policies), never from this file.
 *
 * This decides what is RENDERED. Row Level Security refuses the same person
 * at the database whether or not a link was drawn.
 *
 * ── GROUPED, BECAUSE ELEVEN IS NOT A LIST ──────────────────────────────────
 *
 * Dee, 2026-09-20: "team members, compensation, payroll, and all under people
 * and teams are a bit chaotic and messy and not clear to me, not friendly
 * navigation." An executive sees every section, and eleven equal tabs in one
 * wrapping row read as a pile rather than a menu. Each section now names the
 * QUESTION it answers, and the tabs are drawn in those four clusters.
 *
 * The order inside the clusters is Dee's locked order (§20c), unchanged — the
 * groups fall on contiguous runs of it, so nothing moved. Grouping is
 * presentation; the destinations, their slugs and their audiences are the
 * same rows they were.
 */

export type PeopleAudience =
  /** Anybody who leads a team or holds management capability. */
  | "lead"
  /** Management capability (admin, or ops.manage) — sees the organization. */
  | "manages"
  /** Agency admins: structure and positions are administration. */
  | "admin"
  /** The payroll capability (payroll.view / payroll.manage) — never implied by anything else. */
  | "payroll";

/** The question a cluster of sections answers. Presentation only. */
export type PeopleGroup = "people" | "organization" | "operations" | "pay";

export const PEOPLE_GROUPS: { key: PeopleGroup; label: string }[] = [
  { key: "people", label: "Our people" },
  { key: "organization", label: "How we are organized" },
  { key: "operations", label: "Day to day" },
  { key: "pay", label: "Pay" },
];

export interface PeopleSection {
  /** The URL segment under /app/people. The overview is the root and has none. */
  slug: string;
  label: string;
  /** The line under the heading on that section's own page. */
  description: string;
  audience: PeopleAudience;
  group: PeopleGroup;
}

/** The locked order, from Dee's mockup. */
export const PEOPLE_SECTIONS: PeopleSection[] = [
  { slug: "", label: "Overview", audience: "lead", group: "people",
    description: "Manage our people, teams, positions and workforce operations — all in one place." },
  { slug: "members", label: "Team Members", audience: "lead", group: "people",
    description: "Everyone in your scope, where they sit and who they report to." },
  { slug: "structure", label: "Structure", audience: "admin", group: "organization",
    description: "Divisions, departments and teams — the one structure Work, EOD, production and partner assignment all read." },
  { slug: "positions", label: "Positions", audience: "admin", group: "organization",
    description: "Seats, who holds them, and who covers them." },
  { slug: "org-chart", label: "Org Chart", audience: "manages", group: "organization",
    description: "Who reports to whom, drawn from positions." },
  { slug: "schedule", label: "Schedule", audience: "lead", group: "operations",
    description: "The week, person by person: shifts, days off and approved leave." },
  { slug: "attendance", label: "Attendance", audience: "lead", group: "operations",
    description: "This quarter's attendance score for everyone in your scope." },
  { slug: "time-off", label: "Time Off", audience: "lead", group: "operations",
    description: "Leave requests waiting on a decision, and who is away." },
  { slug: "eod", label: "End of Day", audience: "lead", group: "operations",
    description: "Who reported, what they worked, and what is in their way." },
  { slug: "performance", label: "Performance", audience: "lead", group: "operations",
    description: "Your team's performance based on attendance, productivity, quality, and accountability." },
  { slug: "payroll", label: "Pay & Payroll", audience: "payroll", group: "pay",
    description: "What each person is paid, and the cutoffs that pay them — for payroll eyes only." },
];

export interface PeopleAudienceContext {
  /** Agency admin. */
  administers: boolean;
  /** Admin, or the explicit ops.manage capability. */
  manages: boolean;
  /** Leads at least one team — a relationship, not a role name. */
  leadsTeam: boolean;
  /** Holds payroll.view or payroll.manage. Dee: never visible merely for Finance or admin. */
  payroll: boolean;
}

const admits = (audience: PeopleAudience, ctx: PeopleAudienceContext): boolean => {
  switch (audience) {
    case "lead": return ctx.leadsTeam || ctx.manages || ctx.administers;
    case "manages": return ctx.manages || ctx.administers;
    case "admin": return ctx.administers;
    case "payroll": return ctx.payroll;
  }
};

/** The sections this person may open, in the locked order. Empty for an agent. */
export const visiblePeopleSections = (ctx: PeopleAudienceContext): PeopleSection[] =>
  PEOPLE_SECTIONS.filter((s) => admits(s.audience, ctx));

/** Whether this person is offered People & Teams at all. */
export const seesPeopleAndTeams = (ctx: PeopleAudienceContext): boolean =>
  visiblePeopleSections(ctx).length > 0;

/**
 * The section a URL segment names, or null when it names none — or one this
 * person may not open, which is deliberately the same answer.
 */
export const peopleSectionFor = (
  slug: string | undefined,
  ctx: PeopleAudienceContext,
): PeopleSection | null =>
  visiblePeopleSections(ctx).find((s) => s.slug === (slug ?? "")) ?? null;

/** Is this URL segment a section at all (any audience)? A profile id is not. */
export const isPeopleSectionSlug = (slug: string): boolean =>
  PEOPLE_SECTIONS.some((s) => s.slug === slug);

/**
 * The visible sections, clustered for drawing. Empty clusters are dropped, so
 * a Team Lead sees two headings and an executive four.
 */
export const groupedPeopleSections = (
  ctx: PeopleAudienceContext,
): { key: PeopleGroup; label: string; sections: PeopleSection[] }[] => {
  const visible = visiblePeopleSections(ctx);
  return PEOPLE_GROUPS
    .map((g) => ({ ...g, sections: visible.filter((s) => s.group === g.key) }))
    .filter((g) => g.sections.length > 0);
};
