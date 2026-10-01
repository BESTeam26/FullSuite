/**
 * Dee, 2026-10-01: the EOD email carries a table of what the agent did, and
 * a lead's email a table of their people, from the stored report.
 */
import { describe, expect, it } from "vitest";
import { agentDaySections, reportDocuments, reportSections } from "./eod-email-sections";
import { sectionsText } from "../../../supabase/functions/_shared/email-sections.ts";

const snapshot = {
  files_worked: 2, actions_completed: 3, minutes_logged: 402,
  action_breakdown: [{ action: "Disputes Sent", count: 2 }, { action: "Follow-up Email", count: 1 }],
  files: [
    { subject: "Jesse Amezcua", actions: ["Disputes Sent", "Follow-up Email"], round: "Round 1", resulting_status: "In Dispute", notes: "Sent to EQ, TU, EX" },
    { subject: "Daniel Allen", actions: ["Disputes Sent"], round: "Round 2", resulting_status: null, notes: null },
  ],
};

describe("an agent's EOD email", () => {
  it("tables each client file with its actions, round, status and notes, then the production counts", () => {
    const [files, production] = agentDaySections("Alvaro", snapshot);
    expect(files.title).toBe("What Alvaro did today");
    expect(files.table?.columns).toEqual(["Client", "Actions taken", "Round", "Status", "Notes"]);
    expect(files.table?.rows).toEqual([
      ["Jesse Amezcua", "Disputes Sent, Follow-up Email", "Round 1", "In Dispute", "Sent to EQ, TU, EX"],
      ["Daniel Allen", "Disputes Sent", "Round 2", "—", ""],
    ]);
    expect(production.table?.rows).toEqual([
      ["Client files worked", "2"], ["Disputes Sent", "2"], ["Follow-up Email", "1"], ["Actions completed", "3"], ["Time logged", "6h 42m"],
    ]);
  });
  it("says so when nothing was completed, and never invents a zero for a missing measure", () => {
    const [files, production] = agentDaySections("Alvaro", { files: [] });
    expect(files.lines).toEqual(["No client files were completed today."]);
    expect(production.table?.rows[0]).toEqual(["Client files worked", "Not available"]);
  });
});

const teamDoc = {
  level: "team", scope: { name: "Processing Team" }, lead: { name: "Daniel" },
  categories: [{ key: "dispute", label: "Disputes" }, { key: "complaints", label: "Complaints" }],
  rows: [
    { name: "Alvaro D. Gile", role: "Processor", submitted: true, categories: { dispute: 12 }, total: 12, notes: "Clean day", blockers: null },
    { name: "Ivan L. Olympia", role: "Processor", submitted: false, categories: {}, total: 0, notes: null, blockers: "Portal down" },
  ],
  groups: [{ label: "Disputes", lines: [{ name: "Alvaro D. Gile", units: 12 }], total: 12 }],
  totals: { categories: { dispute: 12, complaints: 0 }, total: 12, members: 2, submitted: 1, not_submitted: 1 },
  attention: [{ name: "Ivan L. Olympia", blockers: "Portal down", help_needed: null }],
};

describe("a Team Lead's EOD email", () => {
  it("tables the agents with each category, the total and their words, then the summary, totals and attention", () => {
    const s = reportSections(teamDoc);
    expect(s.map((x) => x.title)).toEqual([
      "Team Lead EOD Report — Processing Team · Agent submissions", "EOD summary by work type", "Overall total", "Blockers / attention needed",
    ]);
    expect(s[0].table?.columns).toEqual(["Agent", "Role", "Submitted", "Disputes", "Complaints", "Total", "Notes / blockers"]);
    expect(s[0].table?.rows[0]).toEqual(["Alvaro D. Gile", "Processor", "Yes", "12", "0", "12", "Clean day"]);
    expect(s[0].table?.rows[1]).toEqual(["Ivan L. Olympia", "Processor", "No", "0", "0", "0", "Blocker: Portal down"]);
    expect(s[2].table?.rows).toEqual([["Disputes", "12"], ["Complaints", "0"], ["Total team output", "12"], ["Members", "2"], ["Submitted", "1"], ["Not submitted", "1"]]);
    expect(s[3].lines).toEqual(["Ivan L. Olympia: Portal down"]);
  });
  it("a department's email lists teams, not agents", () => {
    const s = reportSections({ ...teamDoc, level: "department", scope: { name: "Dispute Department" },
      rows: [{ name: "Processing Team", members: 2, submitted: 1, categories: { dispute: 12 }, total: 12 }] });
    expect(s[0].title).toBe("Department EOD Report — Dispute Department · Team submissions");
    expect(s[0].table?.columns).toEqual(["Team", "Members", "Submitted", "Disputes", "Complaints", "Total"]);
    expect(s[0].table?.rows[0]).toEqual(["Processing Team", "2", "1", "12", "0", "12"]);
  });
  it("reads both report shapes and renders as text for clients without HTML", () => {
    expect(reportDocuments({ documents: [teamDoc, teamDoc] })).toHaveLength(2);
    expect(reportDocuments(teamDoc)).toHaveLength(1);
    const text = sectionsText(reportSections(teamDoc));
    expect(text[0]).toContain("Alvaro D. Gile · Role: Processor · Submitted: Yes · Disputes: 12");
  });
});
