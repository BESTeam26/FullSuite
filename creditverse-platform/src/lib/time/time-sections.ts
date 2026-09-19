/**
 * Time & Attendance, as data.
 *
 * Dee's brief, 2026-09-18: "Consolidate My Time, Attendance, Time Off, Team
 * Time and Leave Management into one collapsible FullSuite module in the
 * global sidebar, using the same interaction pattern as Finance. Do not keep
 * My Time, Attendance and Time Off as unrelated top-level navigation items."
 *
 * Rows rather than a switch statement, the same shape Finance uses: adding a
 * section is an entry here plus its screen, never a new permission system
 * (rule 18 — a module is data, not a code branch).
 *
 * ── CAPABILITY, NOT ROLE NAME ──────────────────────────────────────────────
 *
 * Dee: "Navigation must be capability-driven. Do not show Team Management
 * merely because somebody is an Agency Admin. Use actual role, team-lead
 * relationship, capabilities, organizational scope."
 *
 * So a section names the AUDIENCE it answers to, and the audience is resolved
 * from the same navigation context the route guard reads — `leadsTeam` is a
 * real team-lead relationship from `team_memberships.is_lead`, not a role
 * string. What is drawn and what the door opens cannot drift apart.
 *
 * This decides what is RENDERED. It is not the security: Row Level Security
 * refuses the same person at the database whether or not a link was drawn.
 */

export type TimeAudience =
  /** Anybody who works at BES: their own time, their own attendance. */
  | "everyone"
  /** Somebody who actually leads a team, or holds management capability. */
  | "lead";

export interface TimeSection {
  /** The URL segment under /app/time. The overview is the root and has none. */
  slug: string;
  label: string;
  /** The line under the heading on that section's own page. */
  description: string;
  audience: TimeAudience;
}

export const TIME_SECTIONS: TimeSection[] = [
  {
    slug: "",
    label: "Overview",
    description: "Your work time, attendance and leave in one place.",
    audience: "everyone",
  },
  {
    slug: "my-time",
    label: "My Time",
    description: "Start, stop, and keep moving.",
    audience: "everyone",
  },
  {
    slug: "attendance",
    label: "Attendance",
    description: "Your quarterly attendance score and how it was reached.",
    audience: "everyone",
  },
  {
    slug: "time-off",
    label: "Time Off",
    /* Dee, 2026-09-19: the navigation entry stays "Time Off"; the page says
       what it actually covers, because paid rewards are not leave. */
    description: "Plan time away, and manage the paid rewards you have earned.",
    audience: "everyone",
  },
  {
    slug: "team",
    label: "Team Management",
    description: "Your team's time, leave, attendance and availability.",
    audience: "lead",
  },
];

export interface TimeAudienceContext {
  /** Holds management capability over the workforce. */
  manages: boolean;
  /** Actually leads at least one team — a relationship, not a role name. */
  leadsTeam: boolean;
}

export const visibleTimeSections = (ctx: TimeAudienceContext): TimeSection[] =>
  TIME_SECTIONS.filter((s) => s.audience === "everyone" || ctx.manages || ctx.leadsTeam);

/**
 * The section a URL segment names, or null when it names none — or one this
 * person may not open, which is deliberately the same answer.
 */
export const timeSectionFor = (
  slug: string | undefined,
  ctx: TimeAudienceContext,
): TimeSection | null =>
  visibleTimeSections(ctx).find((s) => s.slug === (slug ?? "")) ?? null;

/** The tabs inside Team Management. Four tabs, not four sidebar entries. */
export const TEAM_TABS = [
  { key: "time", label: "Teams & Members" },
  { key: "leave", label: "Leave Requests" },
  { key: "attendance", label: "Attendance" },
  { key: "availability", label: "Availability" },
] as const;

export type TeamTab = (typeof TEAM_TABS)[number]["key"];
