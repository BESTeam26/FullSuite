/**
 * CR-2 is a DATA capability, not a rule activation.
 *
 * Per-bureau storage makes `BureauRecord` constructible for the first time,
 * which means `detectConditions` — thirty-one conditions that have never been
 * product-active — could now be wired in with one import. Dee's refinement 2
 * is explicit that it must not be: a rule that has never run in production
 * stays dormant until it is reconciled under the new Rulebook.
 *
 * These are structural tests. They read the source tree, because the thing
 * being guarded is an IMPORT, and no unit test of behaviour can see one.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTEGRITY_RULES } from "./reporting-integrity-rules";
import { REASON_CONDITIONS_IN_USE } from "./condition-detector";

const SRC = join(process.cwd(), "src");

/** Every .ts/.tsx file under src/, excluding tests and the archive. */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "_archive") continue;
      sourceFiles(path, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(path);
  }
  return out;
}

const files = sourceFiles().map((path) => ({ path, text: readFileSync(path, "utf8") }));

/**
 * Files that CALL a function, excluding the one that declares it.
 *
 * The declaring file is found from the source rather than hardcoded, so moving
 * a function between modules cannot silently blind this guard.
 */
const callsIn = (needle: string) =>
  files
    .filter((f) => !new RegExp(`export (async )?function ${needle}\\b`).test(f.text))
    .filter((f) => new RegExp(`\\b${needle}\\s*\\(`).test(f.text))
    .map((f) => f.path.replace(`${process.cwd()}/`, ""));

describe("CR-2 enabled storage, not rules", () => {
  /* If this fails, someone wired the dormant detector into the product. That
     may well be the right thing to do one day — but it is CR-7's decision,
     taken rule by rule against the Rulebook, not a side effect of a migration
     that added a table. */
  it("leaves detectConditions with no product caller", () => {
    expect(callsIn("detectConditions")).toEqual([]);
  });

  it("leaves selectReason with no product caller either", () => {
    /* The reason engine sits directly downstream of the detector. Activating
       one without the other would produce conditions nothing reads; activating
       both would put 31 unreconciled conditions into letters. */
    expect(callsIn("selectReason")).toEqual([]);
  });

  it("keeps the detector's condition list unchanged in size", () => {
    /* A number, so adding a condition is a deliberate act with a failing test
       attached rather than a quiet widening. */
    expect(REASON_CONDITIONS_IN_USE).toHaveLength(31);
  });
});

describe("what CR-2 did activate, and nothing more", () => {
  it("activated exactly one catalogued rule", () => {
    /* BUREAU.VALUE_DIFFERS was the only rule blocked on per-bureau data. */
    const reachable = INTEGRITY_RULES.filter((r) => !r.blockedBy);
    expect(reachable.map((r) => r.id)).toContain("BUREAU.VALUE_DIFFERS");
    expect(INTEGRITY_RULES.filter((r) => r.blockedBy)).toHaveLength(0);
  });

  it("keeps that rule at observation level in the catalogue itself", () => {
    const rule = INTEGRITY_RULES.find((r) => r.id === "BUREAU.VALUE_DIFFERS")!;
    expect(rule.classification).toBe("observed_difference");
    expect(rule.route).toBe("none");
    expect(rule.humanReviewRequired).toBe(false);
    expect(rule.remedy).toBe("investigate_first");
  });

  it("still lets no rule in the catalogue claim an established violation", () => {
    expect(INTEGRITY_RULES.some((r) => (r.classification as string) === "established_violation")).toBe(false);
  });
});
