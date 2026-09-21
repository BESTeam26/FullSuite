/**
 * Performance, rolled up to whatever level somebody is responsible for.
 *
 * Dee, 2026-09-21: "I need a clean way to see every individual's performance
 * and the team, team leaders view and department view and division view."
 *
 * There was a Teams table and nothing above it, so a division manager had no
 * division and a department had no row at all. One grouping selector replaces
 * the choice between three tables that would otherwise have been three tabs —
 * the page is already the thing Dee called messy, and answering her with more
 * tabs would have made it messier.
 *
 * A group's score is the AVERAGE OF ITS PEOPLE, not a re-derivation from raw
 * facts. Two reasons. Every number then means the same thing wherever it
 * appears, so a department that reads 72 is exactly the people on its rows.
 * And a person counted once in their team is counted once in their department
 * — a re-derivation over shared work would double-count anybody on two teams.
 */
import { SCORE_KEYS, averageOf, type PersonScore, type ScoreKey } from "@/lib/people/performance-metrics";

export type RollupLevel = "division" | "department" | "team" | "person";

export const ROLLUP_LEVELS: { key: RollupLevel; label: string }[] = [
  { key: "division", label: "Division" },
  { key: "department", label: "Department" },
  { key: "team", label: "Team" },
  { key: "person", label: "Person" },
];

/** What a rollup needs to know about one person. Deliberately minimal. */
export interface RollupPerson {
  userId: string;
  name: string;
  /** Null when they sit outside that level — never invented. */
  division: string | null;
  department: string | null;
  teams: string[];
  score: PersonScore;
}

export interface RollupRow {
  key: string;
  label: string;
  people: number;
  /** How many of this group's people have a score for that measure. */
  measured: Record<ScoreKey, number>;
  scores: Record<ScoreKey, number | null>;
  overall: number | null;
}

/** The label a person contributes at this level; several for teams. */
const placesOf = (p: RollupPerson, level: RollupLevel): string[] => {
  if (level === "person") return [p.name];
  if (level === "division") return [p.division ?? UNPLACED];
  if (level === "department") return [p.department ?? UNPLACED];
  return p.teams.length > 0 ? p.teams : [UNPLACED];
};

export const UNPLACED = "Not placed";

/**
 * Group the scored people and average each group.
 *
 * Somebody on two teams appears under both — that is what a team's score
 * means, and a lead should see everybody they lead. At every other level a
 * person appears once.
 */
export function rollupBy(people: readonly RollupPerson[], level: RollupLevel): RollupRow[] {
  const groups = new Map<string, RollupPerson[]>();
  for (const p of people) {
    for (const place of placesOf(p, level)) {
      groups.set(place, [...(groups.get(place) ?? []), p]);
    }
  }

  return [...groups.entries()]
    .map(([label, members]): RollupRow => {
      const scores = members.map((m) => m.score);
      return {
        key: label,
        label,
        people: members.length,
        measured: Object.fromEntries(
          SCORE_KEYS.map((k) => [k, scores.filter((s) => s[k] !== null).length]),
        ) as Record<ScoreKey, number>,
        scores: Object.fromEntries(
          SCORE_KEYS.map((k) => [k, averageOf(scores, k)]),
        ) as Record<ScoreKey, number | null>,
        overall: averageOf(scores, "overall"),
      };
    })
    /* Best first, and the unplaced group last however it scored — it is a
       configuration gap, not a ranking. */
    .sort((a, b) => {
      if (a.label === UNPLACED) return 1;
      if (b.label === UNPLACED) return -1;
      return (b.overall ?? -1) - (a.overall ?? -1);
    });
}

/**
 * Whether a group has enough behind it to read as a score.
 *
 * A row where nothing is measured shows 0% today, which reads as a damning
 * review of people who have not started. "Not measured yet" is the truth and
 * looks like the truth.
 */
export const isMeasured = (row: RollupRow): boolean =>
  SCORE_KEYS.some((k) => row.measured[k] > 0);
