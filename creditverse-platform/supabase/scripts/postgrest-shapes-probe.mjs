/**
 * Every PostgREST embed the app uses, asked of the real API.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * On 2026-09-13 the CreditOps partner tree rendered empty for every folder
 * while twenty live partners sat in the database. The cause was one select
 * string: `outsourcing_groups → partner_contacts` is AMBIGUOUS — two
 * relationships connect those tables — and PostgREST refuses the whole request
 * with PGRST201 rather than choosing.
 *
 * Nothing could have caught it. The select is a STRING, so `tsc` sees nothing;
 * the unit tests mock the data layer, so they never issue it; the build was
 * clean. The first thing that knew was Dee's screen.
 *
 * So this asks the live API to PARSE each one. It does not read data and does
 * not need a session: a schema error (PGRST100/200/201) comes back before any
 * row-level check, and a permission error means the shape was accepted — which
 * is exactly the signal wanted.
 *
 * Deliberately narrow. It covers the failure class that bit, not testing in
 * general, and it runs in seconds.
 *
 * Run: node supabase/scripts/postgrest-shapes-probe.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const pick = (key) => env.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim();
const URL_BASE = pick("VITE_SUPABASE_URL");
const ANON = pick("VITE_SUPABASE_ANON_KEY");

if (!URL_BASE || !ANON) {
  console.error("No Supabase URL or anon key in .env.local");
  process.exit(1);
}

/** `.from("x")` followed by `.select(...)`, with the select's argument. */
const skipped = [];

function extractShapes(source, file) {
  const shapes = [];
  /* The gap must not contain another `.from(`, or a select belonging to the
     NEXT query gets attributed to this table — which reported a false
     ambiguity between `fulfillment_clients` and itself on the first run. */
  const re = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,400}?)\.select\(\s*(`[\s\S]*?`|"[^"]*"|'[^']*')/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const table = m[1];
    const literal = m[3].slice(1, -1);
    /* A select built by interpolation cannot be reconstructed from the source,
       and a half-reconstructed one fails to parse for a reason that says
       nothing about the app. Skipped and counted, never guessed at. */
    if (/\$\{/.test(literal)) { skipped.push({ table, file }); continue; }
    const raw = literal.replace(/\s+/g, " ").trim();
    /* Only embeds. A flat column list cannot be ambiguous, and asking about
       every one of them would make this slow and noisy. */
    if (!raw.includes("(")) continue;
    shapes.push({ table, select: raw, file });
  }
  return shapes;
}

const dir = join(ROOT, "src/lib/data");
const shapes = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .flatMap((f) => extractShapes(readFileSync(join(dir, f), "utf8"), f));

/* A constant-select used by several functions is one shape, asked once. */
const unique = [...new Map(shapes.map((s) => [`${s.table}::${s.select}`, s])).values()];

console.log(`\n${unique.length} embedded query shapes, across ${new Set(unique.map((s) => s.file)).size} files\n`);

/** The codes that mean "PostgREST could not make sense of this". */
const SCHEMA_ERRORS = new Set(["PGRST100", "PGRST200", "PGRST201", "PGRST202", "PGRST204"]);

let ok = 0;
const failures = [];

for (const shape of unique) {
  const url = `${URL_BASE}/rest/v1/${shape.table}?select=${encodeURIComponent(shape.select)}&limit=0`;
  let body;
  try {
    const res = await fetch(url, { headers: { apikey: ANON, accept: "application/json" } });
    body = await res.json().catch(() => null);
  } catch (e) {
    failures.push({ ...shape, code: "NETWORK", message: String(e) });
    continue;
  }

  const code = body && typeof body === "object" && !Array.isArray(body) ? body.code : null;
  if (code && SCHEMA_ERRORS.has(code)) {
    failures.push({ ...shape, code, message: body.message ?? body.details ?? "" });
  } else {
    /* Anything else — rows, or a 42501 permission refusal — means the shape
       parsed, which is the only question being asked. */
    ok += 1;
  }
}

for (const f of failures) {
  console.log(`  FAIL ${f.file} · ${f.table}`);
  console.log(`       ${f.code}: ${String(f.message).slice(0, 160)}`);
  console.log(`       select=${f.select.slice(0, 160)}`);
}

console.log(`\n${ok} shapes parsed, ${failures.length} refused by PostgREST` +
  (skipped.length ? `, ${skipped.length} skipped because they are built by interpolation` : ""));
if (failures.length) process.exitCode = 1;
