import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * The build library must stay a COMPLETE picture of the workbook.
 *
 * The failure this guards against is not a wrong answer — it is a quiet
 * partial one. If a row is added to the tracker and the import is not
 * regenerated, the library silently describes 140 requirements while the
 * standard has 141, and nothing anywhere fails. So this compares the
 * committed migration against the committed sheets, every time.
 */
const root = resolve(__dirname, "../../..");
const sheets = join(root, "docs/bes-crm/sheets");
const migration = readFileSync(
  join(root, "supabase/migrations/20260908005100_crm_build_library_v1.sql"),
  "utf8",
);
const engines = readFileSync(
  join(root, "supabase/migrations/20260908004300_crm_build_library.sql"),
  "utf8",
);

/** Rows of the migration's VALUES list: one per requirement. */
const imported = [
  ...migration.matchAll(/^ {2}\('(phase-[^']+)', '([^']*)', '(.*?)', (?:'(?:[^']|'')*'|null), '([a-z_]+)', '([a-z_]+)', (true|false)\),?$/gm),
].map((m) => ({
  ref: m[1],
  section: m[2],
  title: m[3].replace(/''/g, "'"),
  engine: m[4],
  kind: m[5],
  optional: m[6] === "true",
}));

/** Tasks in the committed sheets. Line 0 is a banner, line 1 the header. */
const tasks = readdirSync(sheets)
  .filter((f) => f.startsWith("phase-"))
  .sort()
  .flatMap((file) => {
    const lines = readFileSync(join(sheets, file), "utf8").split("\n");
    return lines.slice(2).flatMap((line, i) => {
      // Task is the third field; only the count and presence matter here.
      const cells = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g) ?? [];
      const task = (cells[2] ?? "").replace(/^,/, "").replace(/^"|"$/g, "").trim();
      return task ? [{ ref: `${file}:${i + 3}`, task }] : [];
    });
  });

describe("the build library covers the whole workbook", () => {
  it("imports every task the sheets contain", () => {
    expect(imported.length).toBe(tasks.length);
  });

  it("is the 140 rows the workbook's own dashboard counts", () => {
    expect(tasks.length).toBe(140);
  });

  it("gives every requirement an engine", () => {
    expect(imported.filter((r) => !r.engine)).toEqual([]);
  });

  it("references only engines that exist", () => {
    const known = new Set(
      [...engines.matchAll(/\('([a-z_]+)',\s+'[^']+',\s+'/g)].map((m) => m[1]),
    );
    expect(known.size).toBeGreaterThan(10);
    const unknown = [...new Set(imported.map((r) => r.engine))].filter(
      (e) => !known.has(e),
    );
    expect(unknown).toEqual([]);
  });

  it("uses only kinds the table's own check constraint allows", () => {
    /* The constraint on crm_requirements specifically — the file declares
       several tables with a `kind` column, and matching the first one would
       be testing a different table's rules. */
    const ddl = engines.slice(
      engines.indexOf("create table public.crm_requirements"),
    );
    const allowed = new Set(
      (ddl.match(/kind in \(([^)]+)\)/)?.[1] ?? "")
        .split(",")
        .map((s) => s.trim().replace(/'/g, "")),
    );
    expect(allowed.size).toBeGreaterThan(5);
    expect([...new Set(imported.map((r) => r.kind))].filter((k) => !allowed.has(k))).toEqual([]);
  });

  it("references each source row exactly once", () => {
    const refs = imported.map((r) => r.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("points every reference at a row the sheets actually have", () => {
    const known = new Set(tasks.map((t) => t.ref));
    expect(imported.filter((r) => !known.has(r.ref)).map((r) => r.ref)).toEqual([]);
  });
});

describe("what the library says about scope", () => {
  it("marks the workbook's conditional items optional, and does not invent others", () => {
    const conditional = /\b(if included|if applicable|if scheduled|where required)\b/i;
    for (const r of imported) {
      if (conditional.test(r.title)) {
        expect(r.optional, `${r.title} should be optional`).toBe(true);
      }
    }
    // Something is optional, or the rule is not doing anything.
    expect(imported.filter((r) => r.optional).length).toBeGreaterThan(10);
  });

  it("keeps client-supplied inputs out of the build engines", () => {
    // What BES must COLLECT is not build work; it gates the build instead.
    const collected = imported.filter((r) => r.kind === "client_requirement");
    expect(collected.length).toBeGreaterThan(5);
    expect([...new Set(collected.map((r) => r.engine))]).toEqual(["project_setup"]);
  });

  it("files every QA requirement under the QA engine", () => {
    const qa = imported.filter((r) => r.kind === "qa");
    expect(qa.length).toBeGreaterThan(5);
    expect([...new Set(qa.map((r) => r.engine))]).toEqual(["qa_launch"]);
  });

  it("does not put credit-repair lifecycle work in the website engine", () => {
    // The whole point of engines: a partner buying a website must not receive
    // fulfilment work. This is the shape of that rule, checked on real rows.
    const website = imported.filter((r) => r.engine === "website_funnel");
    expect(website.length).toBeGreaterThan(5);
    expect(website.filter((r) => /credit repair|dispute|round/i.test(r.title))).toEqual([]);
  });
});
