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
  /* `paused` carries the REASON a job is off, from `cron_job_pauses`.
     Five billing jobs went off on 2026-09-22 when Dee moved invoicing to
     GoHighLevel, and this probe called all five failures on every run
     afterwards — five red lines that were correct behaviour, sitting next to
     the one red line that was a real two-day outage. Dee: "A
     security/reliability gate that treats intentional shutdowns as failures
     trains everyone to ignore red."

     It cuts both ways. A job that is RUNNING while still carrying a pause
     note is a failure too: somebody re-armed it and left the note behind, and
     a stale exemption is how a genuinely-off job later passes unnoticed. */
  const jobs = q.query(`
    select j.jobname, j.active, j.command,
           substring(j.command from 'public\\.([a-z0-9_]+)\\s*\\(') as target,
           p.reason as paused, p.paused_on::text as paused_on
      from cron.job j
      left join public.cron_job_pauses p on p.jobname = j.jobname`);
  for (const job of jobs) {
    if (!job.target) { fail(`cron · ${job.jobname}`, `command calls no public function: ${job.command}`); continue; }
    const found = byName.get(job.target);
    if (!found) fail(`cron · ${job.jobname}`, `calls public.${job.target}(), which does not exist`);
    else if (job.active && job.paused)
      fail(`cron · ${job.jobname}`, `is running, but is still recorded as paused since ${job.paused_on} — delete the note or stop the job`);
    else if (!job.active && job.paused)
      ok(`cron · ${job.jobname} → paused on purpose since ${job.paused_on}: ${job.paused.split(".")[0]}`);
    else if (!job.active) fail(`cron · ${job.jobname}`, "is not active, and no reason is recorded in cron_job_pauses");
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

console.log("\nNo authorization path reads a deprecated scope column");
{
  /*
   * Phase 3 stopped authorization reading `agency_memberships.scope`,
   * `.scope_division` and `.scope_department_id`; Phase 4 drops them. This
   * guards the gap between the two — a new policy or function that starts
   * reading them again would make the drop a breaking change, silently.
   *
   * `access_profile_for_user` is the one permitted reader: it DISPLAYS the
   * stored value in the access-preview panel and decides nothing. Phase 4
   * removes that field from the payload.
   */
  const pols = q.query(`
    select tablename || '.' || policyname as name from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(scope_division|scope_department_id|am\\.scope|m\\.scope)'
     order by 1`);
  if (pols.length === 0) ok("no policy reads a deprecated scope column");
  else fail("policy reads a deprecated scope column", pols.map((p) => p.name).join(", "));

  const DISPLAY_ONLY = new Set(["access_profile_for_user"]);
  const fns = q.query(`
    select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~ '(scope_division|scope_department_id|am\\.scope[^_]|m\\.scope[^_])'
       and p.prosrc !~ 'a column nobody maintains'
     order by 1`).map((f) => f.name).filter((n) => !DISPLAY_ONLY.has(n));
  if (fns.length === 0) ok("no function reads one for an authorization decision");
  else fail("function reads a deprecated scope column", fns.join(", "));
}

console.log("\nEvery capability the interface asks for still exists");
{
  /*
   * A renamed key does not fail loudly — it fails OPEN for administrators and
   * SHUT for everybody else, permanently.
   *
   * `resolve_agency_capability` looks the key up in `permission_keys` only to
   * ask whether it is owner-gated. An unknown key is not owner-gated, so the
   * next branch — "owner or administrator by role" — answers true, and every
   * agent falls through to a per-member grant that can never be made, because
   * there is no key to grant.
   *
   * Found on 2026-09-16: 0209 renamed `communication.manage` to
   * `communication.channels.manage` / `.create` and deleted the old row, but
   * `Channels.tsx` kept asking for the deleted name. New conversation had been
   * silently owner-and-admin-only ever since, and no grant could have opened it.
   * Exactly Dee's §20: "No capabilities that work only for Owner/Admin but fail
   * for real agents."
   */
  const referenced = new Set();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/permission:\s*"([a-z0-9_.]+)"/g)) referenced.add(m[1]);
    for (const m of text.matchAll(/permission:\s*\[([^\]]+)\]/g))
      for (const k of m[1].matchAll(/"([a-z0-9_.]+)"/g)) referenced.add(k[1]);
    for (const m of text.matchAll(/agencyCan\(\s*"([a-z0-9_.]+)"/g)) referenced.add(m[1]);
    for (const m of text.matchAll(/\bcan\(\s*"([a-z0-9_.]+)"\s*\)/g)) referenced.add(m[1]);
  }
  const defined = new Set(q.query("select key from permission_keys").map((r) => r.key));
  const orphans = [...referenced].filter((k) => !defined.has(k)).sort();
  if (referenced.size < 20) fail("capability scan found almost nothing", `only ${referenced.size} keys — the patterns have drifted`);
  else ok(`${referenced.size} capability keys referenced in the interface`);
  if (orphans.length === 0) ok("every one of them is defined in permission_keys");
  else fail("interface asks for a capability that does not exist", orphans.join(", "));
}

{
  /* A table added without RLS is not a wrong answer — it is every answer,
     to everybody. Nothing in the suite asked this until D-023 added a table
     and the question came up: "how would we know?" Every public table is
     protected today, so the guard is a rule from the day it is written
     rather than a backlog with an exception list. */
  const bare = q.query(`select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     order by 1`).map((r) => r.name);
  if (bare.length === 0) ok("every table in public has row level security enabled");
  else fail("a table in public has no row level security", bare.join(", "));
}

console.log("\nEvery scheduled job's last run actually worked");
{
  /* The question nobody was asking. `attachment_purge_dispatch` failed every
     hour for two days, and `infra_watch` — the daily health check built to
     report exactly that — failed for two days beside it, because both of its
     notification inserts omitted a NOT NULL column. Neither was visible
     anywhere except `cron.job_run_details`, which is a table people query
     after they already suspect something.
     
     Asked of the LAST run of each job, not of a failure count: a job that
     failed overnight and recovered is not interesting, and a job whose most
     recent run errored is, however long it has been scheduled. Paused jobs
     have no recent runs and are skipped — their reason is in
     `cron_job_pauses`. */
  const runs = q.query(`
    select j.jobname, d.status, left(coalesce(d.return_message, ''), 120) as message
      from cron.job j
      left join public.cron_job_pauses p on p.jobname = j.jobname
      left join lateral (
        select status, return_message from cron.job_run_details r
         where r.jobid = j.jobid order by r.start_time desc limit 1
      ) d on true
     where j.active and p.jobname is null
     order by j.jobname`);
  const broken = runs.filter((r) => r.status && r.status !== "succeeded");
  if (runs.length === 0) fail("no active scheduled jobs found", "the query found nothing — has cron moved?");
  else if (broken.length === 0) ok(`the last run of all ${runs.length} active jobs succeeded`);
  else for (const b of broken) {
    fail(`cron · ${b.jobname} last run ${b.status}`, b.message.replace(/\s+/g, " "));
  }
}

console.log(`\n${pass} passed, ${failures.length} failed` +
  (skipped.length ? `, ${skipped.length} skipped because their arguments are assembled elsewhere` : ""));
if (failures.length) process.exitCode = 1;
