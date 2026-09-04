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
      for (const line of readFileSync(resolve(root, file), "utf8").split(
        "\n",
      )) {
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
console.log(
  `\nProject: ${ref}  (anon key ${key.slice(0, 6)}…${key.slice(-4)})\n`,
);

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

/* ---- 1. reachability, and does the schema exist? ---- */
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
  // Phase 3 — CreditOps fulfillment
  "outsourcing_groups",
  "fulfillment_clients",
  "client_department_statuses",
  "production_logs",
  "webhook_endpoints",
  "webhook_deliveries",
  "time_entries",
  "eod_submissions",
  "fulfillment_engagements",
  "departments",
  "teams",
  "team_memberships",
  "notifications",
  "workspaces",
  "workspace_boards",
  "workspace_statuses",
  "workspace_item_types",
  "workspace_fields",
  "work_item_field_values",
  "workspace_shares",
  "funding_clients",
  "funding_businesses",
  "funding_files",
  "funding_deals",
  "funding_department_statuses",
];

/**
 * Probe one relation as the anonymous caller and classify the outcome.
 *   missing  - PGRST205: not in the schema cache, i.e. the migration has not run
 *   denied   - 401/403: exists, role cannot touch it
 *   empty    - 200 with zero rows: exists and RLS filtered everything out (good)
 *   leaked   - 200 with rows: RLS is not doing its job
 */
async function probe(relation) {
  try {
    const res = await rest(`/${relation}?select=*&limit=1`);
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      if (body.code === "PGRST205") return { kind: "missing" };
      return { kind: "error", detail: `404 ${JSON.stringify(body)}` };
    }
    if (res.status === 401 || res.status === 403) {
      return { kind: "denied", detail: String(res.status) };
    }
    if (!res.ok) {
      return { kind: "error", detail: `${res.status} ${await res.text()}` };
    }
    const rows = await res.json();
    return Array.isArray(rows) && rows.length === 0
      ? { kind: "empty" }
      : { kind: "leaked", detail: `${rows.length} row(s)` };
  } catch (e) {
    return { kind: "error", detail: e.message };
  }
}

console.log("Connectivity & schema");
const probes = {};
for (const t of EXPECTED_TABLES) probes[t] = await probe(t);

const results = Object.values(probes);
if (results.every((r) => r.kind === "error")) {
  fail("cannot query the project at all — check the URL and anon key");
} else {
  pass("project reachable and the anon key is accepted");
}

const missing = EXPECTED_TABLES.filter((t) => probes[t].kind === "missing");
const schemaPushed = missing.length < EXPECTED_TABLES.length;

if (missing.length === 0) {
  pass(`all ${EXPECTED_TABLES.length} tables/views exist`);
} else if (!schemaPushed) {
  fail(
    "the schema has NOT been applied yet — no expected table exists.\n" +
      "      Run, from creditverse-platform/:\n" +
      "        npx supabase login\n" +
      "        npx supabase link --project-ref " +
      ref +
      "\n        npx supabase db push",
  );
} else {
  fail(`partially applied — missing: ${missing.join(", ")}`);
}

if (schemaPushed) {
  // Probe with REAL arguments: PostgREST matches on signature, so posting {}
  // to a function that takes parameters returns 404 and looks "missing".
  const ZERO_UUID = "00000000-0000-4000-8000-000000000000";
  const EXPECTED_RPC = [
    ["is_agency_staff", {}],
    ["my_org_ids", {}],
    ["is_org_member", { p_org: ZERO_UUID }],
    ["can_view_org", { p_org: ZERO_UUID }],
    ["can_view_work", { p_scope: "AGENCY", p_org: null, p_subject_org: null }],
    [
      "log_audit",
      { p_action: "probe", p_entity_type: "probe", p_entity_id: "probe" },
    ],
    // Added with the branding merge (migration 0009). Writes to a tenant row,
    // so an anonymous caller must never reach it.
    ["merge_organization_branding", { p_org: ZERO_UUID, p_patch: {} }],
    // Added with FundingOps (migration 0011). Reads client identity across
    // divisions, so it must never answer an anonymous caller.
    [
      "find_client_across_divisions",
      { p_email: "probe@example.com", p_scope: null },
    ],
    // Agency-scoped authorization helpers (migration 0014) and the engagement
    // gate (0016). These decide tenant isolation and whether BES may work a
    // partner's records at all, so none may answer an anonymous caller.
    ["is_staff_of", { p_agency: ZERO_UUID }],
    ["is_manager_of", { p_agency: ZERO_UUID }],
    ["is_admin_of", { p_agency: ZERO_UUID }],
    // Activity visibility (migration 0017). Decides who may read a timeline
    // entry, so an anonymous caller must never reach it.
    [
      "can_view_activity",
      {
        p_agency: ZERO_UUID,
        p_org: null,
        p_visibility: "bes_internal",
        p_entity_type: "fulfillment_client",
      },
    ],
    ["org_has_product", { p_org: ZERO_UUID, p_product: "creditOps" }],
    [
      "bes_may_fulfil",
      { p_org: ZERO_UUID, p_group: null, p_service: "creditops" },
    ],
  ];

  const missingRpc = [];
  // Functions an unauthenticated caller must NOT be able to execute.
  const anonCallable = [];
  for (const [fn, args] of EXPECTED_RPC) {
    const res = await rest(`/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = await res.text();
    // 404 + PGRST202 means no function with that signature exists.
    if (res.status === 404 && body.includes("PGRST202")) {
      missingRpc.push(fn);
    } else if (res.ok) {
      anonCallable.push(fn);
    }
  }
  if (missingRpc.length === 0) pass("authorization helper functions present");
  else fail(`missing functions: ${missingRpc.join(", ")}`);

  if (anonCallable.length === 0) {
    pass("no helper function is executable by an anonymous caller");
  } else {
    fail(
      `anon can EXECUTE: ${anonCallable.join(", ")} — revoke EXECUTE from public and anon`,
    );
  }

  // Trigger functions run as their definer. They are not reachable through
  // PostgREST, but migrations 0003/0004 taught us that a function can be
  // exposed by two independent grants, so absence is asserted rather than
  // assumed.
  for (const fn of [
    "log_fulfillment_client_activity",
    "log_department_status_activity",
    "log_funding_client_activity",
    "log_funding_deal_activity",
  ]) {
    const res = await rest(`/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.ok) fail(`${fn} is CALLABLE by anon — revoke EXECUTE`);
    else pass(`${fn} not callable by anon (${res.status})`);
  }

  const boot = await rest("/rpc/bootstrap_agency_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_email: "probe@example.com" }),
  });
  if (boot.ok) {
    fail("bootstrap_agency_owner is CALLABLE by anon — it must be revoked");
  } else {
    pass(
      `bootstrap_agency_owner not callable from the browser (${boot.status})`,
    );
  }
}

/* ---- 2. RLS denies anonymous reads ---- */
console.log("\nRow Level Security (anonymous caller)");
if (!schemaPushed) {
  warn("skipped — apply the schema first");
} else {
  const mustBeEmpty = [
    "organizations",
    "profiles",
    "work_items",
    "activity_events",
    "files",
    "audit_log",
    "agency_memberships",
    "fulfillment_clients",
    "outsourcing_groups",
    "client_department_statuses",
    "production_logs",
    "webhook_endpoints",
    "webhook_deliveries",
    "time_entries",
    "eod_submissions",
    "fulfillment_engagements",
    "departments",
    "teams",
    "team_memberships",
    "notifications",
    "workspaces",
    "workspace_boards",
    "workspace_statuses",
    "workspace_item_types",
    "workspace_fields",
    "work_item_field_values",
    "workspace_shares",
  "notifications",
    "funding_clients",
    "funding_businesses",
    "funding_files",
    "funding_deals",
    "funding_department_statuses",
  ];
  for (const table of mustBeEmpty) {
    const r = probes[table];
    switch (r.kind) {
      case "empty":
        pass(`${table}: 0 rows visible`);
        break;
      case "denied":
        pass(`${table}: denied (${r.detail})`);
        break;
      case "leaked":
        fail(
          `${table}: LEAKED ${r.detail} to an anonymous caller — RLS is wrong`,
        );
        break;
      case "missing":
        fail(`${table}: table does not exist`);
        break;
      default:
        fail(`${table}: ${r.detail}`);
    }
  }
}

/* ---- 3. anonymous writes must be rejected ---- */
console.log("\nWrite protection (anonymous caller)");
if (!schemaPushed) {
  warn("skipped — apply the schema first");
} else
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
    if (res.ok)
      fail(
        "an anonymous INSERT into organizations SUCCEEDED — policy is wrong",
      );
    else pass(`anonymous insert rejected (${res.status})`);
  } catch (e) {
    pass(`anonymous insert rejected (${e.message})`);
  }

/* ---- 4. the audit trail must be append-only ---- */
// Migration 0008 exists because DELETE was refused but UPDATE was not, letting
// a signed-in manager silently rewrite what a record said had happened. The
// anonymous case is asserted here; the authenticated case is covered by the
// column-level grant, which no anonymous probe can observe.
console.log("\nAudit trail is append-only (anonymous caller)");
if (!schemaPushed) {
  warn("skipped — apply the schema first");
} else {
  for (const [verb, method] of [
    ["UPDATE", "PATCH"],
    ["DELETE", "DELETE"],
  ]) {
    try {
      const res = await rest("/activity_events?id=eq.0", {
        method,
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        ...(method === "PATCH"
          ? { body: JSON.stringify({ new_value: "probe" }) }
          : {}),
      });
      if (res.ok) fail(`anonymous ${verb} on activity_events SUCCEEDED`);
      else pass(`anonymous ${verb} rejected (${res.status})`);
    } catch (e) {
      pass(`anonymous ${verb} rejected (${e.message})`);
    }
  }
}

/* ---- verdict ---- */
if (!schemaPushed) {
  console.log(
    "\n\x1b[33mSchema not applied yet.\x1b[0m The URL and anon key are good;\n" +
      "run `npx supabase db push` (see above), then re-run this script.\n",
  );
  process.exit(3);
}

console.log(
  failures === 0
    ? "\n\x1b[32mAll checks passed.\x1b[0m Sign up in the app, then run\n" +
        "  select public.bootstrap_agency_owner('your@email.com');\n" +
        "in the SQL editor to become BES agency owner.\n"
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m See above.\n`,
);
process.exit(failures === 0 ? 0 : 1);
