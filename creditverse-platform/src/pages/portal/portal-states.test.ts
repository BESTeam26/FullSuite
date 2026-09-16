/**
 * No surface reports a failed request as an empty one.
 *
 * Dee, 2026-09-16: *"A failed API call must not render as '0 results' unless
 * zero is actually known. This is especially important because the
 * Partner-folder PostgREST bug previously rendered a backend error as empty
 * folders."*
 *
 * The regression is one character wide — `query.data ?? []` followed by a
 * length check — and it has shipped more than once. The unit tests beside
 * `QueryState` prove the components behave; this proves they are USED, by
 * reading the source of every surface that makes an emptiness claim.
 *
 * ── TWO THINGS THIS GUARD LEARNED THE HARD WAY ─────────────────────────────
 *
 * It must only judge a file that claims emptiness ABOUT DATA IT FETCHED. A
 * component handed an already-resolved array as a prop cannot tell a failure
 * from an empty list and is not the place to try; its parent is. Without that
 * it flagged Composer and MessageRow, which render props and nothing else.
 *
 * And it must recognise EVERY way a file already handles the failure. The first
 * version looked only for `isError`, so it counted `ClientHistoryTab` — which
 * checks a destructured `error` and gets this exactly right — and over-reported
 * the backlog by more than double.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Directories whose surfaces are held to this rule today. */
const DIRS = [
  "src/pages/portal/pages",
  "src/components/portal",
  "src/components/communication",
  "src/components/agency/partner",
  "src/components/agency/finance",
];

const filesIn = (dir: string): { file: string; text: string }[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) return filesIn(path);
    return /\.tsx$/.test(entry) && !/\.test\./.test(entry)
      ? [{ file: path, text: readFileSync(path, "utf8") }]
      : [];
  });

const sources = DIRS.flatMap(filesIn);

/** Does this file render an "it is empty" branch about data it fetched? */
const readsAQuery = (t: string) => /\.data\b|isLoading|isPending/.test(t);
const claimsEmptiness = (t: string) =>
  /length === 0|length \? |\.length\s*\?/.test(t)
  && /No |Nothing |none|caught up|yet/i.test(t)
  && readsAQuery(t);

/**
 * …and can it tell a failure from an empty answer, however it spells that?
 *
 * Four spellings are legitimate and all appear in this codebase:
 *   a query object          `q.isError`, or the helpers built on it
 *   a destructured error    `const { error } = useX()`  (ClientHistoryTab)
 *   a PROP carrying it      `servicesFailed`, `failed`  — the only way a
 *                           presentational component handed its rows can know
 *
 * The prop spelling is why this is case-insensitive on "failed": missing
 * `servicesFailed` made the guard report three files as broken that handle the
 * case correctly.
 */
const knowsAboutFailure = (t: string) =>
  /hasRows|PanelState|PageLoadError|isError|\berror \?|\berror &&|\w*[Ff]ailed\s*\?/.test(t);

describe("no surface reports a failed request as an empty one", () => {
  it("finds the sources to check", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it.each(sources.filter((s) => claimsEmptiness(s.text)).map((s) => [s.file, s.text]))(
    "%s distinguishes a failed load from a genuinely empty one",
    (_file, text) => {
      expect(knowsAboutFailure(text as string)).toBe(true);
    },
  );
});
