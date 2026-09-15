/**
 * Every colour utility in the app must name a token Tailwind actually maps.
 *
 * Dee, 2026-09-15, from a screenshot of the Partner Portal: *"the text cant be
 * read."* The rail was painted with `bg-sidebar-background` — a class Tailwind
 * has never generated. `tailwind.config.ts` maps the sidebar palette as
 * `sidebar.DEFAULT`, so the utility is `bg-sidebar`; `bg-sidebar-background`
 * silently produced NOTHING.
 *
 * The result was the nastiest shape this kind of bug takes: it looked like it
 * worked. The dark active pill rendered (`bg-sidebar-accent` IS mapped), the
 * borders rendered, and only the rail's own background vanished — leaving
 * light-on-light text that is invisible rather than obviously broken.
 * TypeScript cannot read a className string, the build succeeds, and every
 * other test passes.
 *
 * So this reads the config and the source and fails on any utility naming a
 * shade that does not exist. Deliberately about MISSING tokens, never about
 * which colours a component chooses.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** The colour families and shades `tailwind.config.ts` declares. */
function mappedShades(): Map<string, Set<string>> {
  const config = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");
  const colours = config.slice(config.indexOf("colors:"));
  const families = new Map<string, Set<string>>();
  /* `family: { DEFAULT: …, shade: …, "two-words": … }` */
  const familyRe = /(\w[\w-]*):\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = familyRe.exec(colours)) !== null) {
    const shades = new Set<string>();
    for (const s of m[2].matchAll(/["']?([A-Za-z][\w-]*)["']?\s*:/g)) {
      shades.add(s[1] === "DEFAULT" ? "" : s[1]);
    }
    families.set(m[1], shades);
  }
  return families;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "_archive" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { sourceFiles(full, out); continue; }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("colour utilities name tokens that exist", () => {
  it("no component paints with a shade Tailwind does not map", () => {
    const families = mappedShades();
    /* Only families the config declares. Tailwind's own palette (slate, red,
       amber …) is not in there and is not this test's business. */
    const names = [...families.keys()].filter((f) => families.get(f)!.size > 0);
    const prefixes = "bg|text|border|ring|ring-offset|fill|stroke|from|via|to|divide|outline|decoration|placeholder|caret";
    const re = new RegExp(`\\b(?:${prefixes})-(${names.join("|")})(?:-([a-z][a-z0-9-]*))?\\b`, "g");

    const bad: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      for (const hit of readFileSync(file, "utf8").matchAll(re)) {
        const [whole, family, shade = ""] = hit;
        /* An opacity suffix (`/80`) is not a shade; Tailwind resolves it. */
        const clean = shade.replace(/\/.*$/, "");
        if (!families.get(family)!.has(clean)) {
          bad.push(`${file.replace(`${ROOT}/`, "")}: ${whole}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("recognises the exact bug it was written for", () => {
    /* A guard on the guard: if the matcher stopped catching this shape, the
       test above would pass for the wrong reason. */
    const sidebar = mappedShades().get("sidebar");
    expect(sidebar).toBeDefined();
    expect(sidebar!.has("")).toBe(true);            // bg-sidebar
    expect(sidebar!.has("accent")).toBe(true);      // bg-sidebar-accent
    expect(sidebar!.has("background")).toBe(false); // the class that did nothing
  });
});
