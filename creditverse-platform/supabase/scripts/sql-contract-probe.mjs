/**
 * The contract between the app's code and the database's functions.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The sibling probe (`postgrest-shapes-probe.mjs`) covers query STRINGS. This
 * covers the other half of the same blind spot: a call to a database function,
 * and what a database function does when nobody is watching. Both are invisible
 * to `tsc` and to `npm run build`, and both have cost real time this month:
 *
 *   · `invite_agency_member` gained a second signature when a parameter got a
 *     default. PostgREST then refused every call — "Could not choose the best
 *     candidate function" — and Dee saw it as a broken Add Member dialog.
 *
 *   · `ghl_outbound_dispatch` called `extensions.net.http_post`. Postgres reads
 *     a three-part name as database.schema.function, so the call had been
 *     failing silently EVERY MINUTE SINCE 2026-09-09 while cron logged success.
 *     Nothing sent, nothing raised, nothing noticed.
 *
 *   · `creditops_route_client` and `billing_period_due` were the same overload
 *     trap, caught only because the first one had already been paid for.
 *
 * So: four questions, asked of the live database, about the things a build can
 * never check.
 *
 *   1. Does every `.rpc()` the app makes name exactly ONE function?
 *   2. Does it pass arguments that function actually has, and all it requires?
 *   3. May `authenticated` execute it at all?
 *   4. Does every scheduled and SECURITY DEFINER function hold together —
 *      a pinned `search_path`, a real target, no three-part `net.` name?
 *
 * Deliberately narrow. It is not a schema test suite; it is the two failure
 * classes that bit, and it runs in seconds.
 *
 * Run: node supabase/scripts/sql-contract-probe.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

let pass = 0;
const failures = [];
const ok = (name) => { pass += 1; console.log(`  ok   ${name}`); };
const fail = (name, detail) => { failures.push(name); console.log(`  FAIL ${name}\n       ${detail}`); };

/* ── What the app calls ──────────────────────────────────────────────────── */

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "_archive" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue; }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/**
 * `.rpc("name")` or `.rpc("name", { p_a: …, p_b: … })`.
 *
 * The argument NAMES are what matters and they are literals; the values are
 * not read at all, so an expression, a cast or a template inside one changes
 * nothing here.
 */
const calls = [];
const skipped = [];

/**
 * The argument object of one `.rpc(...)` call, brace-balanced.
 *
 * A regex ending at the first `}` is wrong the moment an argument is itself an
 * object — `p_items: { kind, name }` — because the inner keys then read as
 * arguments to the function. That produced three confident, wrong failures on
 * this probe's first run (create_partner_with_contact, create_credit_report,
 * log_audit), which is the exact way a check loses the reader's trust.
 */
function argObjectAt(source, from) {
  let i = from;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] !== ",") return null;
  i += 1;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] !== "{") return null;
  const start = i;
  let depth = 0;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") { depth -= 1; if (depth === 0) return source.slice(start + 1, i); }
  }
  return null;
}

/** Top-level `key:` pairs only — anything inside a nested brace is a value. */
function topLevelKeys(body) {
  const keys = [];
  let depth = 0;
  let token = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "{" || ch === "[" || ch === "(") { depth += 1; token = ""; continue; }
    if (ch === "}" || ch === "]" || ch === ")") { depth -= 1; token = ""; continue; }
    if (depth !== 0) continue;
    if (ch === ":") { const k = token.trim(); if (/^[a-z0-9_]+$/.test(k)) keys.push(k); token = ""; continue; }
    if (ch === ",") { token = ""; continue; }
    token += ch;
  }
  return keys;
}

for (const file of sourceFiles(SRC)) {
  const source = readFileSync(file, "utf8");
  const re = /\.rpc\(\s*(?:"([a-z0-9_]+)"|'([a-z0-9_]+)'|`([a-z0-9_]+)`)(\s*as\s+never)?/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const name = m[1] ?? m[2] ?? m[3];
    const body = argObjectAt(source, re.lastIndex);
    /* A spread means the caller assembles arguments elsewhere; the names
       cannot be read from here and a guess would be worse than a skip. */
    if (body !== null && /\.\.\./.test(body)) { skipped.push({ name, file: relative(SRC, file) }); continue; }
    calls.push({ name, args: body === null ? [] : topLevelKeys(body), file: relative(SRC, file) });
  }
}

/* One call site per distinct (function, argument set): the same call made from
   three components is one contract, asked once. */
const unique = [...new Map(calls.map((c) => [`${c.name}(${[...c.args].sort().join(",")})`, c])).values()];

console.log(`\nSQL contracts\n\n${unique.length} distinct RPC calls, across ${new Set(calls.map((c) => c.file)).size} files\n`);

/* ── 1–3. Every call names one function, with arguments it has ───────────── */

/*
 * `proargnames` holds the OUT column names of a `returns table (...)` function
 * alongside its real parameters — so reading it whole makes every set-returning
 * function look as though the app forgot thirteen arguments. `proargmodes` is
 * the discriminator: null means every argument is IN, otherwise only 'i', 'b'
 * and 'v' are things a caller passes.
 *
 * The first run of this probe reported nine such "failures". Worth recording,
 * because a probe that cries wolf is one people learn to ignore, and that is a
 * worse outcome than not having written it.
 */
const CATALOGUE = q.query(`
  select p.proname as name,
         p.oid::int as oid,
         coalesce(array_to_string(array(
           select p.proargnames[i]
             from generate_subscripts(p.proargnames, 1) i
            where p.proargmodes is null or p.proargmodes[i] in ('i', 'b', 'v')
         ), ','), '') as argnames,
         p.pronargdefaults as ndefaults,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_may,
         (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('public', p.oid, 'EXECUTE')) as anon_may
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
`);
const byName = new Map();
for (const row of CATALOGUE) {
  if (!byName.has(row.name)) byName.set(row.name, []);
  byName.get(row.name).push(row);
}

/**
 * The three functions a SIGNED-OUT person is meant to reach.
 *
 * Each is a token flow: somebody follows a link from their email before they
 * have an account. The token is the authorization — each function resolves it
 * itself and returns nothing for a token that is wrong, used or expired — and
 * the grant is to `anon` only, never to PUBLIC.
 *
 * Named here rather than skipped, so that adding a fourth is a decision
 * somebody writes down instead of a probe quietly going green.
 */
const SIGNED_OUT_BY_DESIGN = new Set([
  "invitation_preview",         // an invitee reading their invitation
  "signature_request_preview",  // a signer opening /sign/:token
  "sign_document",              // and signing it
]);

console.log("Every RPC the app makes resolves to exactly one function");
for (const call of unique) {
  const label = `${call.name}(${call.args.join(", ")}) · ${call.file}`;
  const candidates = byName.get(call.name) ?? [];

  if (candidates.length === 0) { fail(label, "no function of that name exists in `public`"); continue; }
  if (candidates.length > 1) {
    /* The `invite_agency_member` bug exactly: PostgREST cannot choose, so
       EVERY call fails, including the ones that were working yesterday. */
    fail(label, `${candidates.length} overloads exist — PostgREST cannot choose between them ` +
      `(${candidates.map((c) => `(${c.argnames || "no named args"})`).join(" · ")})`);
    continue;
  }

  const fn = candidates[0];
  const params = fn.argnames ? fn.argnames.split(",").filter(Boolean) : [];
  const unknown = call.args.filter((a) => !params.includes(a));
  if (unknown.length > 0) {
    fail(label, `passes ${unknown.map((u) => `\`${u}\``).join(", ")}, which the function does not take ` +
      `(it takes ${params.length ? params.join(", ") : "nothing"})`);
    continue;
  }

  /* Parameters with defaults come LAST, so the required ones are the leading
     slice — the same rule Postgres itself applies. */
  const required = params.slice(0, Math.max(0, params.length - Number(fn.ndefaults ?? 0)));
  const missing = required.filter((p) => !call.args.includes(p));
  if (missing.length > 0) {
    fail(label, `does not pass required ${missing.map((x) => `\`${x}\``).join(", ")}`);
    continue;
  }

  if (!fn.auth_may) {
    fail(label, "`authenticated` has no EXECUTE on it — every signed-in caller is refused");
    continue;
  }
  /* Migrations 0003/0004's lesson: a function is reachable through TWO grants,
     Supabase's to `anon` and Postgres's default to PUBLIC. Revoking one leaves
     the door open, and every one of these is a door the app itself opens. */
  if (fn.anon_may && !SIGNED_OUT_BY_DESIGN.has(call.name)) {
    fail(label, "is executable by `anon` or PUBLIC — a signed-out caller can reach it");
    continue;
  }
  ok(label);
}

/* ── 4. What the database does when nobody is watching ───────────────────── */

console.log("\nA scheduled job points at something that exists");
{
  const jobs = q.query(`
    select j.jobname, j.active, j.command,
           substring(j.command from 'public\\.([a-z0-9_]+)\\s*\\(') as target
      from cron.job j`);
  for (const job of jobs) {
    if (!job.target) { fail(`cron · ${job.jobname}`, `command calls no public function: ${job.command}`); continue; }
    const found = byName.get(job.target);
    if (!found) fail(`cron · ${job.jobname}`, `calls public.${job.target}(), which does not exist`);
    else if (!job.active) fail(`cron · ${job.jobname}`, "is not active");
    else ok(`cron · ${job.jobname} → public.${job.target}()`);
  }
}

console.log("\nNo three-part `net.` name, which Postgres reads as a database");
{
  /* `extensions.net.http_post` parses as database.schema.function and fails at
     run time only — inside a function body, where nothing surfaces it. */
  const bad = q.query(`
    select p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~ 'extensions\\.net\\.http_(post|get)'
     order by 1`);
  if (bad.length === 0) ok("every outbound call uses `net.http_post`");
  else fail("three-part net name", `${bad.map((b) => b.name).join(", ")} would fail silently at run time`);
}

console.log("\nEvery SECURITY DEFINER function pins its search_path");
{
  /* An unpinned definer runs with the CALLER's search_path, so a table it
     names can be a different table than the author meant. */
  const unpinned = q.query(`
    select p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) as c
          where c like 'search_path=%')
     order by 1`);
  if (unpinned.length === 0) ok("no unpinned SECURITY DEFINER function in `public`");
  else fail("unpinned SECURITY DEFINER", `${unpinned.length}: ${unpinned.map((u) => u.name).join(", ")}`);
}

console.log(`\n${pass} passed, ${failures.length} failed` +
  (skipped.length ? `, ${skipped.length} skipped because their arguments are assembled elsewhere` : ""));
if (failures.length) process.exitCode = 1;
