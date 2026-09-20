/**
 * What an invitation will actually produce — derived, in one place, from what
 * the person filling in the wizard chose.
 *
 * Dee's invite mockup, 2026-09-20, shows a live preview beside the form. That
 * preview has to be the TRUTH, not a marketing panel: every line below is
 * derived from the same three inputs the writers use (role, access profile,
 * placement), so a preview that says "no payroll" cannot be followed by an
 * invitation that grants it.
 *
 * Role = experience · placement = scope · capability = action (AD-008).
 */
export type Responsibility =
  | "agent" | "team_lead" | "department_manager" | "division_manager" | "chief_operations" | "agency_admin";

export interface ResponsibilityChoice {
  value: Responsibility;
  label: string;
  hint: string;
  /** The seat this responsibility places them in, if any (management_seats). */
  seat: "chief_operations" | "division_manager" | "department_manager" | null;
  /** Leading their team is a fact of the team, not a seat. */
  leadsTeam: boolean;
}

export const RESPONSIBILITIES: ResponsibilityChoice[] = [
  { value: "agent", label: "Agent (Individual Contributor)", seat: null, leadsTeam: false,
    hint: "Their own work: the team's queue, the partners assigned to them or their team, and the clients under those partners." },
  { value: "team_lead", label: "Team Lead", seat: null, leadsTeam: true,
    hint: "Leads this team: its people, its queue, its assigned partners, and the QA and coaching that go with leading it." },
  { value: "department_manager", label: "Department Manager", seat: "department_manager", leadsTeam: false,
    hint: "The whole department — every team in it — without needing membership in each one." },
  { value: "division_manager", label: "Division Manager", seat: "division_manager", leadsTeam: false,
    hint: "The whole division: its departments, teams, partners and clients. No partner assignment needed." },
  { value: "chief_operations", label: "Chief Operations", seat: "chief_operations", leadsTeam: false,
    hint: "Operations across every service division. Payroll and Finance are NOT included — those are granted explicitly." },
  { value: "agency_admin", label: "Agency Admin (administration)", seat: null, leadsTeam: false,
    hint: "The full agency management experience. Not a seat: ownership is transferred, never invited, and money stays a capability." },
];

/** A division's module door, by the canonical capability key. */
export const MODULE_BY_SERVICE: Record<string, { key: string; label: string; extra?: string[] }> = {
  creditops: { key: "creditops.clients.view", label: "CreditOps", extra: ["creditops.clients.edit"] },
  bes_crm: { key: "crm.projects.view", label: "BES CRM" },
  talentops: { key: "talentops.view", label: "TalentOps", extra: ["talentops.tasks.manage"] },
  fundingops: { key: "fundingops.files.view", label: "FundingOps" },
  sales_marketing: { key: "marketing.workspace.view", label: "Sales & Marketing", extra: ["marketing.tasks.manage"] },
};

export interface InvitePlanInput {
  responsibility: Responsibility;
  /** The division's `service`, which is what decides the module door. */
  service: string | null;
  departmentName: string | null;
  teamName: string | null;
}

export interface InvitePlan {
  role: "agency_admin" | "agency_user";
  profile: "manager" | "team_lead" | "agent" | "custom" | null;
  seat: "chief_operations" | "division_manager" | "department_manager" | null;
  leadsTeam: boolean;
  moduleKeys: string[];
  moduleLabel: string | null;
  /** What they will be able to do, in the order a reader cares about. */
  includes: string[];
  /** What this invitation does NOT give — the half people forget to check. */
  excludes: string[];
}

export function invitePlan({ responsibility, service, departmentName, teamName }: InvitePlanInput): InvitePlan {
  const choice = RESPONSIBILITIES.find((r) => r.value === responsibility) ?? RESPONSIBILITIES[0];
  const mod = service ? MODULE_BY_SERVICE[service] : undefined;
  const admin = responsibility === "agency_admin";
  const chief = responsibility === "chief_operations";

  /* An administrator reaches the modules by role; everybody else is let
     through one door at a time, and a seat is not a door (§16). */
  const moduleKeys = admin ? [] : mod ? [mod.key, ...(mod.extra ?? [])] : [];

  const includes: string[] = [];
  if (chief) includes.push("Every service division's operations");
  else if (responsibility === "division_manager") includes.push(`The whole ${mod?.label ?? "division"} division`);
  else if (responsibility === "department_manager") includes.push(`The whole ${departmentName ?? "department"} department`);
  else if (responsibility === "team_lead") includes.push(`${teamName ?? "Their team"} — its people, queue and partners`);
  else if (!admin) includes.push(`${departmentName ?? "Their department"} queue`);
  if (!admin && !chief) {
    includes.push("Team-assigned partners", "Directly assigned partners (if any)", "Clients under those partners");
  }
  includes.push("My Work", "My Time and End of Day", "Communication", "Knowledge Base", "Calendar");
  if (admin) includes.push("People & Teams, agency settings, partners and organizations");

  const excludes: string[] = [];
  if (responsibility === "agent") excludes.push("Other departments' queues", "People & Teams management");
  if (responsibility === "team_lead") excludes.push("Other teams in the department", "People & Teams administration");
  if (responsibility === "department_manager") excludes.push("Other departments in the division");
  if (responsibility === "division_manager") excludes.push("Other divisions");
  if (!admin && !mod && !chief) excludes.push("Any operational module until one is granted");
  /* Money is never implied — not by admin, not by a seat (AD-008). */
  excludes.push("Payroll and compensation", "Company finance");
  if (!admin) excludes.push("Agency settings");

  return {
    role: admin ? "agency_admin" : "agency_user",
    profile: admin ? null
      : responsibility === "agent" ? "agent"
        : responsibility === "team_lead" ? "team_lead"
          : "manager",
    seat: choice.seat,
    leadsTeam: choice.leadsTeam,
    moduleKeys,
    moduleLabel: mod?.label ?? null,
    includes,
    excludes,
  };
}
