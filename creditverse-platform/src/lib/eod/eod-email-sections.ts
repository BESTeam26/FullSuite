/**
 * What an End of Day email shows as TABLES (Dee, 2026-10-01).
 *
 * An agent's email carries a table of what they did — each client file with
 * its actions, round and status — and their production counts. A lead's
 * email carries their people as rows, from the same stored report document
 * the screen draws (`eod_submissions.report`), with nothing recomputed here.
 *
 * Pure, shared with the `eod-email` Edge Function, and tested in vitest.
 * Relative imports only: Deno resolves these as files.
 */
import type { EmailSection } from "../../../supabase/functions/_shared/email-sections.ts";

type Row = Record<string, unknown>;
const str = (v: unknown, empty = "—"): string => (v === null || v === undefined || v === "" ? empty : String(v));
const num = (v: unknown): string => (v === null || v === undefined ? "Not available" : String(Number(v)));
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

const minutes = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "Not available";
  const h = Math.floor(n / 60), m = n % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * The agent's day. `snapshot` is `eod_day_activity` as it stood at
 * submission; its `files` are the client files completed, each with the
 * actions ticked inside it, the client's round and the resulting status.
 */
export function agentDaySections(employeeName: string, snapshot: Row | null | undefined): EmailSection[] {
  const snap = snapshot ?? {};
  const files = arr(snap.files);
  const breakdown = arr(snap.action_breakdown);
  const sections: EmailSection[] = [];

  sections.push({
    title: `What ${employeeName} did today`,
    table: {
      columns: ["Client", "Actions taken", "Round", "Status", "Notes"],
      rows: files.map((f) => [
        str(f.subject, "Unnamed"),
        arr(f.actions).map(String).join(", ") || "No actions recorded",
        str(f.round),
        str(f.resulting_status),
        str(f.notes, ""),
      ]),
    },
    lines: files.length === 0 ? ["No client files were completed today."] : undefined,
  });

  const counts: string[][] = [["Client files worked", num(snap.files_worked)]];
  for (const b of breakdown) counts.push([str(b.action), num(b.count)]);
  counts.push(["Actions completed", num(snap.actions_completed)]);
  counts.push(["Time logged", minutes(snap.minutes_logged)]);
  sections.push({ title: "Today's production", table: { columns: ["Measure", "Count"], rows: counts, numeric: [false, true] } });
  return sections;
}

const LEVEL_TITLE: Record<string, string> = {
  team: "Team Lead EOD Report", department: "Department EOD Report", division: "Division EOD Report", agency: "Organization EOD Report",
};
const UNIT: Record<string, string> = { team: "Agent", department: "Team", division: "Department", agency: "Division" };

/**
 * One stored report document as tables: the rows (agents for a team, teams
 * for a department, and so on up), the summary by work type, the totals,
 * and who needs attention. Categories are whatever the document says.
 */
export function reportSections(doc: Row | null | undefined): EmailSection[] {
  if (!doc) return [];
  const level = str(doc.level, "team");
  const scope = (doc.scope ?? {}) as Row;
  const lead = (doc.lead ?? {}) as Row;
  const cats = arr(doc.categories);
  const rows = arr(doc.rows);
  const groups = arr(doc.groups);
  const totals = (doc.totals ?? {}) as Row;
  const attention = arr(doc.attention);
  const unit = UNIT[level] ?? "Row";
  const title = `${LEVEL_TITLE[level] ?? "EOD Report"} — ${str(scope.name, "")}`.trim();
  const sections: EmailSection[] = [];

  const catCols = cats.map((c) => str(c.label));
  if (level === "team") {
    sections.push({
      title: `${title} · ${unit} submissions`,
      table: {
        columns: ["Agent", "Role", "Submitted", ...catCols, "Total", "Notes / blockers"],
        rows: rows.map((r) => {
          const c = (r.categories ?? {}) as Row;
          return [
            str(r.name), str(r.role, ""), r.submitted ? "Yes" : "No",
            ...cats.map((k) => num(c[str(k.key)] ?? 0)), num(r.total),
            [r.blockers ? `Blocker: ${str(r.blockers)}` : "", str(r.notes, "")].filter(Boolean).join(" · "),
          ];
        }),
        numeric: [false, false, false, ...cats.map(() => true), true, false],
      },
      lines: rows.length === 0 ? ["Nobody on this team today."] : undefined,
    });
  } else {
    sections.push({
      title: `${title} · ${unit} submissions`,
      table: {
        columns: [unit, "Members", "Submitted", ...catCols, "Total"],
        rows: rows.map((r) => {
          const c = (r.categories ?? {}) as Row;
          return [str(r.name), num(r.members), num(r.submitted), ...cats.map((k) => num(c[str(k.key)] ?? 0)), num(r.total)];
        }),
        numeric: [false, true, true, ...cats.map(() => true), true],
      },
      lines: rows.length === 0 ? [`No ${unit.toLowerCase()}s in this scope today.`] : undefined,
    });
  }

  if (groups.length > 0) {
    sections.push({
      title: "EOD summary by work type",
      table: {
        columns: ["Work type", "Who", "Units"],
        rows: groups.flatMap((g) => [
          ...arr(g.lines).map((l) => [str(g.label), str(l.name), num(l.units)]),
          [str(g.label), "Total", num(g.total)],
        ]),
        numeric: [false, false, true],
      },
    });
  }

  const tc = (totals.categories ?? {}) as Row;
  sections.push({
    title: "Overall total",
    table: {
      columns: ["Measure", "Count"],
      rows: [
        ...cats.map((c) => [str(c.label), num(tc[str(c.key)] ?? 0)]),
        [`Total ${level === "team" ? "team" : str(scope.name, "")} output`.replace(/\s+/g, " "), num(totals.total)],
        [unit === "Agent" ? "Members" : "People", num(totals.members)],
        ["Submitted", num(totals.submitted)],
        ["Not submitted", num(totals.not_submitted)],
      ],
      numeric: [false, true],
    },
  });

  if (attention.length > 0) {
    sections.push({
      title: "Blockers / attention needed",
      lines: attention.map((a) =>
        `${str(a.name, "Someone")}${a.unit ? ` (${str(a.unit)})` : ""}: ${[a.blockers, a.help_needed].filter(Boolean).map(String).join(" · ")}`),
    });
  }
  return sections;
}

/** `{documents:[…]}`, or a single bare document from before 2026-09-30. */
export function reportDocuments(raw: unknown): Row[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Row;
  if (Array.isArray(r.documents)) return r.documents as Row[];
  return [r];
}

export { LEVEL_TITLE as EOD_LEVEL_TITLE };
