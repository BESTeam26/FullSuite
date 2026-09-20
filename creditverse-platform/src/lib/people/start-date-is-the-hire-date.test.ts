/**
 * A start date is the hire date, never the account date.
 *
 * `agency_memberships.created_at` (`since` on the client) is when the row was
 * made. `hired_on` is when the person actually started. They are usually
 * close, so the confusion hides — until somebody who has been here since 2016
 * activates their invitation and the People panel reports a start date of
 * today, restating ten years of service as one day. Aaron, 2026-09-20.
 *
 * The Agent ID takes its date from `hired_on` too, so a screen that shows
 * `since` under this label also contradicts the badge next to it.
 *
 * A source guard rather than a render test: the mistake is choosing the wrong
 * field, and that is visible in the source of whichever screen next shows a
 * start date.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* Vitest runs from the project root, as the other source guards assume. */
const SRC = "src";

const sourceFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === "_archive" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

/** "Start date" / "Start Date" followed, within the same expression, by `.since`. */
const OFFENDER = /["']Start ?[Dd]ate["'][^\n]{0,160}\.since\b/;

describe("a start date is the hire date", () => {
  it("no screen labels the account date as a start date", () => {
    const guilty = sourceFiles(SRC)
      .filter((f) => OFFENDER.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1));
    expect(guilty).toEqual([]);
  });

  it("the guard would catch the original mistake", () => {
    expect(OFFENDER.test('{fact("Start date", formatDate(member.since))}')).toBe(true);
    expect(OFFENDER.test('{row("Start Date", me ? formatDate(me.hiredOn ?? me.since) : null)}')).toBe(true);
    /* Honest labels for the account date are fine. */
    expect(OFFENDER.test('{fact("Member since", formatDate(member.since))}')).toBe(false);
    expect(OFFENDER.test('{fact("Start date", formatDate(member.hiredOn))}')).toBe(false);
  });
});
