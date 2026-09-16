/**
 * Every portal surface must be able to tell "failed" from "you have none".
 *
 * The unit tests beside `QueryState` prove the components behave. This proves
 * the components are actually USED — the defect was never in a helper, it was
 * in four pages that each open-coded `query.data ?? []` and then decided from
 * the length. A fifth page written the same way tomorrow would ship the same
 * bug past a green suite, so the guard reads the source.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIRS = ["src/pages/portal/pages", "src/components/portal"];

const sources = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f))
    .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(`${dir}/${f}`, "utf8") })),
);

/** A page makes a claim about the account when it renders an "it is empty" branch. */
const claimsEmptiness = (t: string) =>
  /length === 0|length \? |\.length\s*\?/.test(t) && /No |Nothing |none|caught up/i.test(t);

/** …and is allowed to, only if it can distinguish a failure from an empty answer. */
const knowsAboutFailure = (t: string) =>
  /hasRows|PanelState|PageLoadError|isError/.test(t);

describe("the portal never reports a failed request as an empty account", () => {
  it("finds the portal sources to check", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it.each(sources.filter((s) => claimsEmptiness(s.text)).map((s) => [s.file, s.text]))(
    "%s distinguishes a failed load from a genuinely empty one",
    (_file, text) => {
      expect(knowsAboutFailure(text as string)).toBe(true);
    },
  );
});
