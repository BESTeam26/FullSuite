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

/* Communication joined the list on 2026-09-16: ConversationPane had exactly
   the same `data ?? []` then length-check, so a failed fetch told somebody a
   conversation with hundreds of messages had never been started. */
const DIRS = ["src/pages/portal/pages", "src/components/portal", "src/components/communication"];

const sources = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f))
    .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(`${dir}/${f}`, "utf8") })),
);

/**
 * A file is in scope when it renders an "it is empty" branch ABOUT DATA IT
 * FETCHED. A component handed an already-resolved array as a prop cannot tell
 * a failure from an empty list and is not the place to try — the fetcher above
 * it is. Without this second half the guard flags Composer and MessageRow,
 * which render props and nothing else.
 */
const readsAQuery = (t: string) => /\.data\b|isLoading|isPending/.test(t);
const claimsEmptiness = (t: string) =>
  /length === 0|length \? |\.length\s*\?/.test(t)
  && /No |Nothing |none|caught up/i.test(t)
  && readsAQuery(t);

/** …and is allowed to, only if it can distinguish a failure from an empty answer. */
const knowsAboutFailure = (t: string) =>
  /hasRows|PanelState|PageLoadError|isError/.test(t);

describe("no conversation surface reports a failed request as an empty one", () => {
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
