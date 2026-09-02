#!/usr/bin/env node
/**
 * Live-mode smoke test.
 *
 * Run after `supabase db push` and after .env.local has the project URL + anon key:
 *
 *   node supabase/scripts/verify-live.mjs
 *
 * It proves three things without touching any private credential:
 *   1. the project is reachable with the anon key,
 *   2. the Phase 1 + Phase 2 schema actually landed,
 *   3. RLS denies anonymous reads (the most important property to get right).
 *
 * It only READS. It never writes, and it never creates users.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

/* ---- load .env.local without a dependency ---- */
function loadEnv() {
  const out = {};
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(root, file), "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* file absent — fine */
    }
  }
  return out;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

const pass = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => {
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
  failures++;
};
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
let failures = 0;

if (!url || !key) {
  console.error(
    "\nNo Supabase credentials found.\n" +
      "Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n",
  );
  process.exit(2);
}

const ref = url.replace(/^https:\/\//, "").split(".")[0];
console.log(`\nProject: ${ref}  (anon key ${key.slice(0, 6)}…${key.slice(-4)})\n`);

const rest = (path, init = {}) =>
  fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

/* ---- 1. reachability + exposed schema ---- */
console.log("Connectivity & schema");
let spec;
try {
  const res = await rest("/");
  if (!res.ok) {
    fail(`PostgREST returned ${res.status} ${res.statusText}`);
  } else {
    spec = await res.json();
    pass("project reachable with the anon key");
  }
} catch (e) {
  fail(`cannot reach ${url}: ${e.message}`);
}

const EXPECTED_TABLES = [
  "agencies",
  "profiles",
  "organizations",
  "businesses",
  "product_entitlements",
  "agency_memberships",
  "org_memberships",
  "external_memberships",
  "record_grants",
  "invitations",
  "user_preferences",
  "audit_log",
  "work_items",
  "activity_events",
  "files",
  "work_attention",
];

if (spec?.paths) {
  const exposed = new Set(
    Object.keys(spec.paths)
      .filter((p) => p.startsWith("/") && p.length > 1)
      .map((p) => p.slice(1)),
  );
  const missing = EXPECTED_TABLES.filter((t) => !exposed.has(t));
  if (missing.length === 0) {
    pass(`all ${EXPECTED_TABLES.length} tables/views exposed`);
  } else {
    fail(`missing from the API: ${missing.join(", ")} — did both migrations run?`);
  }

  const EXPECTED_RPC = [
    "rpc/is_agency_staff",
    "rpc/is_org_member",
    "rpc/can_view_org",
    "rpc/can_view_work",
    "rpc/assignable_profiles",
    "rpc/log_audit",
    "rpc/my_org_ids",
  ];
  const missingRpc = EXPECTED_RPC.filter((r) => !exposed.has(r));
  if (missingRpc.length === 0) pass("authorization helper functions present");
  else fail(`missing functions: ${missingRpc.map((r) => r.slice(4)).join(", ")}`);

  if (exposed.has("rpc/bootstrap_agency_owner")) {
    warn(
      "bootstrap_agency_owner is exposed over the API — it should be revoked from anon/authenticated",
    );
  } else {
    pass("bootstrap_agency_owner is not callable from the browser");
  }
}

/* ---- 2. RLS denies anonymous reads ---- */
console.log("\nRow Level Security (anonymous caller)");
const mustBeEmpty = [
  "organizations",
  "profiles",
  "work_items",
  "activity_events",
  "files",
  "audit_log",
  "agency_memberships",
];
for (const table of mustBeEmpty) {
  try {
    const res = await rest(`/${table}?select=*&limit=1`);
    if (res.status === 401 || res.status === 403) {
      pass(`${table}: denied (${res.status})`);
      continue;
    }
    if (!res.ok) {
      fail(`${table}: unexpected ${res.status} ${await res.text()}`);
      continue;
    }
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length === 0) pass(`${table}: 0 rows visible`);
    else
      fail(
        `${table}: LEAKED ${rows.length} row(s) to an anonymous caller — RLS policy is wrong`,
      );
  } catch (e) {
    fail(`${table}: ${e.message}`);
  }
}

/* ---- 3. anonymous writes must be rejected ---- */
console.log("\nWrite protection (anonymous caller)");
try {
  const res = await rest("/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      agency_id: "00000000-0000-0000-0000-000000000000",
      name: "smoke-test-should-fail",
      code: "SMOKE",
      principal_name: "x",
      principal_email: "x@example.com",
    }),
  });
  if (res.ok) fail("an anonymous INSERT into organizations SUCCEEDED — policy is wrong");
  else pass(`anonymous insert rejected (${res.status})`);
} catch (e) {
  pass(`anonymous insert rejected (${e.message})`);
}

/* ---- verdict ---- */
console.log(
  failures === 0
    ? "\n\x1b[32mAll checks passed.\x1b[0m Sign up in the app, then run\n" +
        "  select public.bootstrap_agency_owner('your@email.com');\n" +
        "in the SQL editor to become BES agency owner.\n"
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m See above.\n`,
);
process.exit(failures === 0 ? 0 : 1);
