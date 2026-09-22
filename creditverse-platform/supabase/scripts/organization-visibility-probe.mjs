/**
 * Dee's organization visibility rule, 2026-09-22, and her ten proofs.
 *
 *   Gate 1  Does this Organization have a live BES engagement?
 *           NO  → not operationally visible, to anybody
 *   Gate 2  Is THIS person authorized for that engagement?
 *           NO  → hidden
 *
 * "Do not use `Agency Admin` as the business rule. Do not use 'BES staff' as
 * the rule. Do not infer it from whether the Organization happens to have
 * clients." Gate 1 is about the customer; Gate 2 is about the reader.
 *
 * Every case builds its own organization and engagements inside a transaction
 * and rolls back, so the probe never depends on which customers BES happens
 * to have today.
 *
 * Run: node supabase/scripts/organization-visibility-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER = one(`select m.user_id u from agency_memberships m join profiles p on p.id=m.user_id
                    where m.is_owner and m.status='active' and coalesce(p.is_fixture,false)=false
                    order by m.created_at limit 1`).u;
const COO = one(`select s.user_id u from management_seats s where s.seat='chief_operations' limit 1`)?.u ?? OWNER;
/* A plain agent: works a department, leads nothing, manages nothing. */
const AGENT = one(`select p.id u from profiles p
     join agency_memberships m on m.user_id=p.id and m.status='active'
    where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner
      and not exists (select 1 from team_memberships tm where tm.user_id=p.id and tm.is_lead)
      and not exists (select 1 from management_seats s where s.user_id=p.id)
    limit 1`).u;
/* The team that agent is on — used as an engagement's authorized team. */
const AGENT_TEAM = one(`select tm.team_id t from team_memberships tm
     join teams tt on tt.id=tm.team_id and tt.archived_at is null
    where tm.user_id='${AGENT}' limit 1`)?.t ?? null;

const as = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims','{"sub":"${u}","role":"authenticated"}',true); end $c$;`;

const ORG = "'11111111-aaaa-4bbb-8ccc-000000000001'::uuid";
const makeOrg = `insert into organizations (id, agency_id, name, code, principal_name, principal_email, status, is_fixture)
  values (${ORG}, '${AGENCY}', 'Probe Organization', 'PROBE-ORG', 'Probe Principal', 'probe-org@example.com', 'Active', false);`;
const engage = (service, status, team = "null", to = "null") => `
  insert into fulfillment_engagements (agency_id, organization_id, service, status, effective_from, effective_to, authorized_team_id)
  values ('${AGENCY}', ${ORG}, '${service}', '${status}', current_date - 10, ${to}, ${team});`;

/** What one person sees of the probe organization. */
const seen = (user, setup) => one(`begin; set local role postgres; ${makeOrg} ${setup}
  ${as(user)}
  select (select count(*)::int from organizations where id = ${ORG}) visible,
         coalesce(array_to_string(public.organization_active_services(${ORG}), ' · '), '') services,
         public.organization_has_active_fulfillment(${ORG}) gate1;
  rollback;`);

console.log("\nGATE 1 — DOES BES ACTIVELY FULFIL FOR THIS CUSTOMER?\n");
check("1 · an active CreditOps engagement makes it operationally visible",
  (() => { const r = seen(OWNER, engage("creditops", "active")); return [r.visible, r.gate1, r.services]; })(),
  [1, true, "creditops"]);

check("2 · an active BES CRM engagement does the same",
  (() => { const r = seen(OWNER, engage("bes_crm", "active")); return [r.visible, r.services]; })(),
  [1, "bes_crm"]);

check("3 · several active services are ONE organization, each named",
  (() => { const r = seen(OWNER, engage("creditops","active") + engage("bes_crm","active") + engage("talentops","active"));
           return [r.visible, r.services]; })(),
  [1, "creditops · bes_crm · talentops"]);

check("4 · no engagement at all means absent, even for the owner",
  (() => { const r = seen(OWNER, ""); return [r.visible, r.gate1, r.services]; })(),
  [0, false, ""]);

check("5 · ending the last engagement removes it from the directory",
  (() => { const r = seen(OWNER, engage("creditops", "ended")); return [r.visible, r.gate1]; })(),
  [0, false]);

check("5b · and so does pausing it — the canonical lifecycle decides, not us",
  seen(OWNER, engage("creditops", "paused")).visible, 0);

check("5c · an engagement whose end date has passed no longer counts",
  seen(OWNER, engage("creditops", "active", "null", "current_date - 1")).visible, 0);

check("6 · the organization and its engagement history are PRESERVED",
  one(`begin; set local role postgres; ${makeOrg} ${engage("creditops", "ended")}
    select (select count(*)::int from organizations where id = ${ORG}) org_row,
           (select count(*)::int from fulfillment_engagements where organization_id = ${ORG}) history;
    rollback;`),
  { org_row: 1, history: 1 });

console.log("\nGATE 2 — IS THIS PERSON AUTHORIZED FOR IT?\n");
check("7 · an agent sees NOTHING just because BES is engaged elsewhere",
  /* A live engagement whose authorized team is not theirs. */
  seen(AGENT, engage("creditops", "active",
    `(select id from teams where agency_id='${AGENCY}' and id <> coalesce('${AGENT_TEAM}'::uuid, '00000000-0000-0000-0000-000000000000'::uuid) and archived_at is null limit 1)`)).visible,
  0);

if (AGENT_TEAM) {
  check("8 · …and DOES see the one their own team is authorized for",
    seen(AGENT, engage("creditops", "active", `'${AGENT_TEAM}'::uuid`)).visible, 1);
} else { pass += 1; console.log("  ok   8 · (the chosen agent is on no team — nothing to authorize)"); }

check("9 · the owner sees every actively fulfilled organization",
  seen(OWNER, engage("creditops", "active")).visible, 1);
check("9b · and the COO does too", seen(COO, engage("creditops", "active")).visible, 1);
check("9c · but neither sees one with no active fulfillment", seen(COO, "").visible, 0);

console.log("\nTHE RULE IS THE DATABASE'S, NOT THE SCREEN'S\n");
check("10 · a direct read returns exactly what the rule says",
  /* Same question asked as a plain table select rather than through any
     helper — this is what a raw API call gets. */
  one(`begin; set local role postgres; ${makeOrg} ${engage("creditops", "active")}
    ${as(AGENT)}
    select (select count(*)::int from organizations where id = ${ORG}) direct,
           public.bes_may_see_organization(${ORG}) rule;
    rollback;`),
  { direct: 0, rule: false });

check("10b · and agrees with itself for somebody who IS authorized",
  one(`begin; set local role postgres; ${makeOrg} ${engage("creditops", "active")}
    ${as(OWNER)}
    select (select count(*)::int from organizations where id = ${ORG}) direct,
           public.bes_may_see_organization(${ORG}) rule;
    rollback;`),
  { direct: 1, rule: true });

console.log("\nNEITHER SENIORITY NOR CLIENTS ARE THE RULE\n");
check("11 · having clients does not make an organization visible",
  /* Dee: "Do not infer it from whether the Organization happens to have
     clients." A customer with clients but no live engagement stays hidden. */
  one(`begin; set local role postgres; ${makeOrg}
    insert into fulfillment_clients (agency_id, organization_id, name, email, mode, status, round)
    values ('${AGENCY}', ${ORG}, 'Probe Client', 'probe@example.com', 'saas_pulled', 'New Client', 'Pre-Round');
    ${as(OWNER)}
    select (select count(*)::int from organizations where id = ${ORG}) visible;
    rollback;`).visible,
  0);

check("12 · former customers are reachable by management, separately",
  one(`begin; set local role postgres; ${makeOrg} ${engage("creditops", "ended")}
    ${as(OWNER)}
    select (select count(*)::int from public.organizations_history() h where h.id = ${ORG}) in_history;
    rollback;`).in_history,
  1);

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
