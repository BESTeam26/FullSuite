#!/usr/bin/env node
/**
 * D-023 — one human, several partner files, and only BES may connect them.
 *
 * Dee's ruling, 2026-09-24:
 *
 *   "Duplicate detection is scoped within one Partner database only. Do not
 *    globally merge client records across different Partners… Same human
 *    across Partners does not imply shared tenancy. Person similarity is not
 *    authorization."
 *
 * The temptation this guards against is a helpful one: the import KNOWS the
 * two files look like the same person, so it feels wasteful not to join them
 * up. Every assertion below is a way that knowledge could leak into
 * somebody's view, and must not.
 *
 * Every scenario runs against the live database inside a transaction that is
 * rolled back, as a real authenticated user — a policy tested as a superuser
 * proves nothing, because a superuser is exempt from it.
 *
 * Run: node supabase/scripts/identity-link-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

let pass = 0;
const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
/* A plain agent: "can see this partner" has to be EARNED by an assignment
   here, not granted by rank, or the probe proves nothing about scope. */
const AGENT = one(`select user_id from agency_memberships
                    where role='agency_user' and status='active'
                      and coalesce(scope::text,'assigned') = 'assigned' limit 1`).user_id;
const CONTACT = one(`select c.user_id from partner_contacts c
                      where c.user_id is not null and c.status='active' limit 1`);

const A = "aaaa0001-0000-4000-8000-00000000d023";
const B = "aaaa0002-0000-4000-8000-00000000d023";
const CA = "cccc0001-0000-4000-8000-00000000d023";
const CB = "cccc0002-0000-4000-8000-00000000d023";

/**
 * Two partners, and the SAME person under each — same email, same phone,
 * same name, same date of birth. Everything a matcher could want.
 */
const FIXTURE = `
  insert into outsourcing_groups (id, agency_id, name, contact_email) values
    ('${A}', '${AGENCY}', 'D023 Partner A', 'a@example.test'),
    ('${B}', '${AGENCY}', 'D023 Partner B', 'b@example.test');
  insert into clients (id, agency_id, outsourcing_group_id, mode, provenance,
                       first_name, last_name, email, phone, date_of_birth, status) values
    ('${CA}', '${AGENCY}', '${A}', 'outsourcing_only', 'outsourcing_only',
     'Jane', 'Smith', 'jane.d023@example.test', '5551234567', '1990-01-01', 'active'),
    ('${CB}', '${AGENCY}', '${B}', 'outsourcing_only', 'outsourcing_only',
     'Jane', 'Smith', 'jane.d023@example.test', '5551234567', '1990-01-01', 'active');
  select public.client_note_cross_partner_identity('${CB}', '${B}');
`;

const seePartner = (user, group) =>
  `insert into partner_assignments (agency_id, group_id, user_id, assignment_role, started_on, created_by)
     values ('${AGENCY}','${group}','${user}','account_manager', current_date, '${OWNER}')
   on conflict do nothing;`;

const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      `begin; ${setup}
       set local role authenticated;
       do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
       ${action} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* already gone */ }
    return { ok: false, message: String(e.message ?? e).replace(/\s+/g, " ").slice(0, 160) };
  }
};
const links = `select count(*)::int as n from client_identity_links
                where client_a = '${CA}' and client_b = '${CB}';`;

console.log("\nD-023 — partner-scoped clients, BES-only identity link\n");

console.log("THE FILES STAY APART");

check("1 — the same person under two partners is TWO client records",
  one(`begin; ${FIXTURE}
       select count(*)::int as n from clients
        where email = 'jane.d023@example.test' and outsourcing_group_id in ('${A}','${B}');
       rollback;`),
  { n: 2 });

check("2 — the partner-local matcher does not reach into the other partner",
  /* Asked AS Partner B, with a person who exists under Partner A and shares
     every identifier. A null answer is the rule working: B's import creates
     B's own file. */
  one(`begin; ${FIXTURE}
       select (public.client_match_for_import('${B}', 'clickup', 'no-such-task', null,
                 'jane.d023@example.test', '5551234567', 'Jane Smith', '1990-01-01') is null) as refused;
       rollback;`),
  { refused: true });

console.log("\nBES NOTICES, PRIVATELY");

check("3 — the link is recorded, once, with what matched",
  one(`begin; ${FIXTURE}
       select matched_on, (group_a <> group_b) as across_partners
         from client_identity_links where client_a = '${CA}' and client_b = '${CB}';
       rollback;`),
  { matched_on: "email", across_partners: true });

check("4 — running it again does not record it twice",
  one(`begin; ${FIXTURE}
       select public.client_note_cross_partner_identity('${CA}', '${A}');
       ${links} rollback;`),
  { n: 1 });

console.log("\nWHO MAY READ IT");

check("5 — a partner portal contact sees no link at all",
  as(CONTACT.user_id, FIXTURE, links).rows?.[0], { n: 0 });

check("6 — a BES agent who can see only ONE of the two partners sees nothing",
  /* The dangerous near-miss. Showing this to somebody scoped to Partner A
     would tell them their client is also Partner B's client — a fact about
     Partner B's book, leaked by the table meant to protect it. */
  as(AGENT, FIXTURE + seePartner(AGENT, A), links).rows?.[0], { n: 0 });

check("7 — …and sees it once they are authorized for BOTH",
  as(AGENT, FIXTURE + seePartner(AGENT, A) + seePartner(AGENT, B), links).rows?.[0], { n: 1 });

console.log("\nTHE LINK IS A NOTE, NOT A DOOR");

check("8 — seeing the link does not let the agent read the other partner's client",
  /* Authorized for A only, and the link exists. The other partner's client
     row must still be invisible: person similarity is not authorization. */
  as(AGENT, FIXTURE + seePartner(AGENT, A),
     `select count(*)::int as n from clients where id = '${CB}';`).rows?.[0],
  { n: 0 });

check("9 — nobody can invent a link by hand",
  /* There is no INSERT policy: links are written by the importer's definer
     function, so a link cannot be fabricated to imply a connection. */
  as(AGENT, FIXTURE + seePartner(AGENT, A) + seePartner(AGENT, B),
     `insert into client_identity_links (agency_id, client_a, client_b, group_a, group_b, matched_on)
      values ('${AGENCY}', '${CA}', '${CB}', '${A}', '${B}', 'phone');`).ok,
  false);

check("10 — and the noticing function is not callable by an ordinary session",
  as(AGENT, FIXTURE,
     `select public.client_note_cross_partner_identity('${CA}', '${A}');`).ok,
  false);

console.log(`\n${pass} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 ? 0 : 1);
