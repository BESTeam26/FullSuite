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

/**
 * Dee, 2026-09-19, locking the Workforce IA: Time & Attendance is "ME" — my
 * clock, my attendance, my leave, my rewards. Everybody who works at BES gets
 * exactly these four; managing OTHER people lives in People & Teams
 * (`lib/people/people-sections.ts`). There is no team audience here any more.
 */
export type TimeAudience = "everyone";

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
    label: "My Attendance",
    description: "Your quarterly attendance score and how it was reached.",
    audience: "everyone",
  },
  {
    slug: "time-off",
    label: "My Time Off",
    /* Dee, 2026-09-19: the navigation entry stays "Time Off"; the page says
       what it actually covers, because paid rewards are not leave. */
    description: "Plan time away, and manage the paid rewards you have earned.",
    audience: "everyone",
  },
];

export interface TimeAudienceContext {
  /** Kept so callers read the same way as People & Teams; nothing here varies by it. */
  manages: boolean;
  leadsTeam: boolean;
}

/** Every section, for everyone: Time & Attendance is the person's own. */
export const visibleTimeSections = (_ctx: TimeAudienceContext): TimeSection[] => TIME_SECTIONS;

/**
 * The section a URL segment names, or null when it names none. `team` was a
 * section once (Team Management); it now redirects to People & Teams.
 */
export const timeSectionFor = (
  slug: string | undefined,
  ctx: TimeAudienceContext,
): TimeSection | null =>
  visibleTimeSections(ctx).find((s) => s.slug === (slug ?? "")) ?? null;
