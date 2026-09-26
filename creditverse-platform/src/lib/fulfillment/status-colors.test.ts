/**
 * The colour must agree with the queue doctrine.
 *
 * A status pill is not decoration: it is the thing an agent reads before
 * deciding whether a file needs them. So the test that matters is not "is
 * Round 4 Sent amber" — it is whether the colour tells the same story the
 * engine does. `isWaitingDepartmentStatus`, `isActionableDepartmentStatus` and
 * `CLOSED_DEPARTMENT_STATUSES` already decide the three states of Dee's queue
 * doctrine (§23). These cases assert the palette cannot contradict them.
 *
 * That is deliberately a test of the RULE and not of the current vocabulary:
 * Dee has renamed CreditOps statuses four times this month, and a test that
 * pinned "Round 8 Sent is grey" would have to be edited each time while never
 * catching the failure that matters — a waiting file painted like finished
 * work, or an actionable one painted like something nobody has to touch.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLOSED_DEPARTMENT_STATUSES,
  CREDIT_STATUSES,
  CREDITOPS_DEPARTMENT_ORDER,
  departmentStatuses,
  isActionableDepartmentStatus,
  isWaitingDepartmentStatus,
} from "./department-domain";
import {
  FAMILY_TONES,
  MIN_CONTRAST,
  TOKEN_HEX,
  familyOf,
  statusChipTone,
  statusPillTone,
} from "./status-colors";

/** Every status the operation can actually hold, credit and department alike. */
const EVERY_STATUS = [
  ...CREDIT_STATUSES,
  ...CREDITOPS_DEPARTMENT_ORDER.flatMap((d) => departmentStatuses(d)),
];

/** Families that mean "somebody at BES can pick this up now". */
const ACTIONABLE_FAMILIES = new Set(["onboarding", "ready", "processing", "support", "complaints", "mailing", "attention"]);
/** Families that mean "not ours to move". */
const PARKED_FAMILIES = new Set(["waiting", "clientAction"]);
/** Families that mean "no further work". */
const FINISHED_FAMILIES = new Set(["done", "closed"]);

describe("every status gets a colour", () => {
  it("leaves nothing on the neutral fallback", () => {
    /* The bug Dee reported: nine statuses were named and fifty-one rendered as
       the same grey chip. A status reaching "neutral" is that bug returning. */
    const grey = EVERY_STATUS.filter((s) => familyOf(s) === "neutral");
    expect(grey).toEqual([]);
  });

  it("gives every family a pill and a chip", () => {
    for (const [family, tone] of Object.entries(FAMILY_TONES)) {
      expect(tone.pill, family).toMatch(/text-/);
      expect(tone.chip, family).toMatch(/text-/);
    }
  });
});

describe("the colour agrees with the queue doctrine", () => {
  const deptStatuses = CREDITOPS_DEPARTMENT_ORDER.flatMap((d) => departmentStatuses(d));

  it("never paints a waiting file as work or as finished", () => {
    /* `Round 8 Sent` is waiting externally, NOT completed (§23). Painting it
       green is the lie the reporting then repeats. */
    for (const s of deptStatuses.filter(isWaitingDepartmentStatus)) {
      expect(PARKED_FAMILIES.has(familyOf(s)), `${s} → ${familyOf(s)}`).toBe(true);
    }
  });

  it("never paints a closed file as open work", () => {
    for (const s of deptStatuses.filter((s) => CLOSED_DEPARTMENT_STATUSES.has(s.toUpperCase()))) {
      expect(FINISHED_FAMILIES.has(familyOf(s)), `${s} → ${familyOf(s)}`).toBe(true);
    }
  });

  it("never paints actionable work as parked or finished", () => {
    /* The inverse failure, and the more expensive one: a file an agent must
       work today, wearing the grey of something waiting on a bureau. */
    for (const s of deptStatuses.filter(isActionableDepartmentStatus)) {
      expect(ACTIONABLE_FAMILIES.has(familyOf(s)), `${s} → ${familyOf(s)}`).toBe(true);
    }
  });

  it("separates waiting on a bureau from waiting on the client", () => {
    /* Dee's doctrine keeps these apart because the second has an action
       attached — somebody has to chase. Same colour, same treatment, and the
       chasing stops happening. */
    expect(familyOf("WAITING CLIENT RESPONSE")).not.toBe(familyOf("ROUND SENT - AWAITING RESULTS"));
  });
});

describe("the classes actually exist in this project's Tailwind", () => {
  it("never uses a shade of a colour the theme has flattened", () => {
    /* THE BUG THIS EXISTS FOR, 2026-09-26.
     *
     * `attention` was `bg-red-600 text-white`. It measured 4.8:1 in the
     * contrast test above and rendered as WHITE TEXT ON A WHITE PILL, because
     * `tailwind.config.ts` redefines `red` as a single colour — so `bg-red-600`
     * is not a class Tailwind emits, it was purged from the build, and only
     * `text-white` survived.
     *
     * The contrast test could not catch it: it measured the hex I had written
     * down by hand, which is a statement of intent, not of what ships. This
     * one reads the actual config and asserts the class can exist at all.
     *
     * `green` and `red` are the live traps today, but the test derives the
     * list rather than naming them, so redefining another palette tomorrow
     * fails here instead of on Dee's screen.
     */
    /* From the project root: vitest runs there, and `import.meta.url` is not
       a file URL once the test has been transformed. */
    const config = readFileSync(resolve(process.cwd(), "tailwind.config.ts"), "utf8");
    const block = config.slice(config.indexOf("colors: {"));

    /* Top-level keys inside `colors`. A key mapped to a STRING has no shades;
       a key mapped to an OBJECT has only the shade names written there. */
    const flattened = new Set<string>();
    let depth = 0;
    for (let i = block.indexOf("{"); i < block.length; i++) {
      if (block[i] === "{") depth++;
      else if (block[i] === "}") { depth--; if (depth === 0) break; }
      else if (depth === 1) {
        const m = /^([A-Za-z_][\w-]*)\s*:\s*["{]/.exec(block.slice(i));
        if (m) flattened.add(m[1]);
      }
    }
    expect(flattened.has("red"), "sanity: the config still redefines red").toBe(true);

    for (const [family, tone] of Object.entries(FAMILY_TONES)) {
      for (const cls of `${tone.pill} ${tone.chip}`.split(/\s+/)) {
        const m = /^(?:bg|text|border)-([a-z]+)-\d+/.exec(cls);
        if (!m) continue;
        expect(
          flattened.has(m[1]),
          `${family}: "${cls}" uses shade ${m[1]}-N, but tailwind.config.ts ` +
          `redefines "${m[1]}" — that class is purged and will not render`,
        ).toBe(false);
      }
    }
  });
});

describe("one map, everywhere", () => {
  it("resolves a status identically however it is spelled or spaced", () => {
    for (const s of ["In Dispute", "  in dispute  ", "IN DISPUTE"]) {
      expect(familyOf(s)).toBe("processing");
    }
  });

  it("draws the pill and the chip from the same family", () => {
    /* The department chip is the quiet version of the SAME decision. If the
       two could diverge, a row could say "Dispute" in green beside a purple
       status pill. */
    for (const s of EVERY_STATUS) {
      expect(statusPillTone(s)).toBe(FAMILY_TONES[familyOf(s)].pill);
      expect(statusChipTone(s)).toBe(FAMILY_TONES[familyOf(s)].chip);
    }
  });

  it("keeps the chip quieter than the pill, so the status still wins the row", () => {
    /* Dee: "don't make everything colorful. Status should remain the strongest
       color signal on each row." A chip with a solid background would compete. */
    for (const family of Object.keys(FAMILY_TONES) as (keyof typeof FAMILY_TONES)[]) {
      if (family === "neutral") continue;
      expect(FAMILY_TONES[family].chip, family).toMatch(/\/\d+\b/);
      expect(FAMILY_TONES[family].pill, family).not.toMatch(/bg-\S+\/\d+\b/);
    }
  });

  it("keeps every pill above the contrast floor, measured rather than assumed", () => {
    /* Rule 15. The first draft of this palette put white on sky-500 (~2.9:1)
       and slate-400 (~2.3:1); both read fine in a screenshot of one row and
       badly in a table somebody scans all day. A shade number is a poor proxy
       — slate-500 is darker than sky-500 at the same number — so this measures
       the colour instead of counting the token. */
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };

    for (const [family, tone] of Object.entries(FAMILY_TONES)) {
      if (family === "neutral") continue; // themed tokens, not fixed hexes
      const bgToken = tone.pill.match(/bg-([a-z]+-\d+)\b/)?.[1];
      const fgToken = tone.pill.match(/text-([a-z]+-\d+)\b/)?.[1];
      expect(bgToken, `${family} has no measurable background`).toBeTruthy();
      const bg = TOKEN_HEX[bgToken!];
      expect(bg, `${bgToken} is missing from TOKEN_HEX`).toBeTruthy();
      const fg = fgToken ? TOKEN_HEX[fgToken] : "#ffffff";
      expect(fg, `${fgToken} is missing from TOKEN_HEX`).toBeTruthy();
      expect(ratio(bg, fg), `${family}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it("never returns an empty class, which would render an unstyled chip", () => {
    for (const s of [...EVERY_STATUS, "", "   ", "something nobody has invented yet"]) {
      expect(statusPillTone(s).length).toBeGreaterThan(0);
      expect(statusChipTone(s).length).toBeGreaterThan(0);
    }
  });
});
