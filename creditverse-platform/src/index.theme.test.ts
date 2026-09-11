/**
 * Every colour utility the app uses must actually exist, and no class string
 * may put a white foreground on a light surface.
 *
 * This test exists because the same bug has now happened twice. A component
 * writes `bg-gradient-navy text-white`; nothing defines `bg-gradient-navy`; the
 * class silently does nothing; and the result is white text on the light
 * workspace — invisible, with no error anywhere. `bg-gradient-emerald` did the
 * same thing across 32 components before it was noticed, and index.css still
 * carries the note about it.
 *
 * Tailwind will not catch this: an unknown class is not an error, it is just
 * absent. So the check is here, and it is a comparison of two lists.
 *
 * Deliberately NOT checked: a bare `text-white` that inherits its surface from
 * an ancestor. The dark marketing shell, the sign-in page and the file viewer
 * overlay all do that legitimately, and a file-by-file scanner cannot tell
 * which ancestor painted the background. Guessing there produces dozens of
 * false alarms and trains people to ignore the test. What IS checked is every
 * case the class string itself settles.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "_archive" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/** Comments mention class names to explain them; they do not render anything. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Class lists live in string literals — "…", '…', `…`, and the quoted branches
 * of a ternary inside a template. Scanning literals rather than `className=`
 * catches the conditional forms too, where the surface and the foreground are
 * decided together in one branch.
 */
function classStrings(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    if (!literal) continue;
    /* A template holds interpolations, and an interpolation often holds the
       two quoted branches of a ternary. Each branch is its own class list —
       merging them would read one branch's surface against the other's
       foreground and report a conflict that never renders. */
    for (const part of literal.split(/\$\{|\}/)) {
      const branches = [...part.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)].map(
        (b) => b[1] ?? b[2] ?? "",
      );
      if (branches.length > 0) out.push(...branches);
      else out.push(part);
    }
  }
  return out;
}

/** The ones Tailwind ships. Everything else has to be defined by this project. */
const TAILWIND_BUILTIN = new Set([
  "bg-gradient-to-r", "bg-gradient-to-l", "bg-gradient-to-t", "bg-gradient-to-b",
  "bg-gradient-to-br", "bg-gradient-to-bl", "bg-gradient-to-tr", "bg-gradient-to-tl",
]);

/** Surfaces this project paints light. White on any of them is unreadable. */
const LIGHT_SURFACE =
  /\bbg-(white|card|background|popover|muted|accent|secondary|[a-z]+-(50|100|200))\b/;

describe("custom colour utilities are defined", () => {
  const css = readFileSync(join(SRC, "index.css"), "utf8");
  const files = walk(SRC);
  const sources = files.map((f) => ({ file: f, code: stripComments(readFileSync(f, "utf8")) }));

  it("defines every bg-gradient-* the app uses", () => {
    const used = new Set<string>();
    for (const { file, code } of sources) {
      if (file.endsWith("index.css")) continue;
      for (const m of code.matchAll(/\bbg-gradient-[a-z-]+/g)) used.add(m[0]);
    }
    const undefined_ = [...used].filter((c) => !TAILWIND_BUILTIN.has(c) && !css.includes(`.${c}`));
    /* A gradient that does not exist leaves whatever foreground the component
       set sitting on the page background. That is how text goes invisible. */
    expect(undefined_).toEqual([]);
  });

  it("never pairs text-white with an undefined gradient in one class string", () => {
    const offenders: string[] = [];
    for (const { file, code } of sources) {
      if (file.endsWith(".css")) continue;
      for (const classes of classStrings(code)) {
        if (!/\btext-white\b/.test(classes)) continue;
        for (const g of classes.matchAll(/\bbg-gradient-[a-z-]+/g)) {
          if (!TAILWIND_BUILTIN.has(g[0]) && !css.includes(`.${g[0]}`)) {
            offenders.push(`${file.replace(SRC, "src")}: ${g[0]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never pairs text-white with a light surface in one class string", () => {
    const offenders: string[] = [];
    for (const { file, code } of sources) {
      if (file.endsWith(".css")) continue;
      for (const classes of classStrings(code)) {
        if (!/\btext-white\b/.test(classes)) continue;
        /* Opacity-modified light surfaces (bg-white/10, bg-white/[0.04]) are
           overlays on top of something dark, not light surfaces. Only bare
           ones are the bug. Both spellings of the alpha have to be stripped:
           matching only `/10` and not `/[0.04]` flagged a dark sign-in card as
           white-on-white, which is the kind of false alarm that gets a real
           guard switched off. */
        const bare = classes.replace(/\bbg-[a-z0-9-]+\/(?:\d+|\[[^\]]+\])/g, "");
        const hit = bare.match(LIGHT_SURFACE);
        if (hit) offenders.push(`${file.replace(SRC, "src")}: text-white on ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
