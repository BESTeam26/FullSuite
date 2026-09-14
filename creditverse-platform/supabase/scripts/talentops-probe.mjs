/**
 * TalentOps partner isolation, against the live database.
 *
 * Dee, 2026-09-13: "Keep Partner assignments authoritative for who may work
 * inside a Partner workspace… If either person can see unrelated Partner work,
 * treat that as a security defect, not a UI filter issue."
 *
 * So the test is not "does the list look right" — it is whether the DATABASE
 * refuses. Every scenario runs as a REAL authenticated user inside a
 * transaction that is rolled back.
 *
 * Run: node supabase/scripts/talentops-probe.mjs
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

const AGENCY  = one("select id from agencies order by created_at limit 1").id;
const OWNER   = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
const ALLIANA = one("select id from profiles where email='yanacatcha.bes@gmail.com'").id;
/* A second real agent who is NOT assigned to Alliana's partners — standing in
   for JM until JM accepts their invitation. */
const OTHER = one(`select m.user_id from agency_memberships m
                    join profiles p on p.id = m.user_id
                   where m.role = 'agency_user' and m.status = 'active'
                     and m.user_id <> '${ALLIANA}' and coalesce(p.is_fixture,false) = false
                   limit 1`)?.user_id;
const BMF     = one("select id from outsourcing_groups where name='Business Made Fair'").id;
const KA      = one("select id from outsourcing_groups where name='K&A Consulting Group'").id;
const BIZHUB  = one("select id from outsourcing_groups where name='Bizhub'").id;

const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      `begin; ${setup}
       set local role authenticated;
       do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
       ${action} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* already gone */ }
    return { ok: false, message: String(e.message ?? e) };
  }
};

/* Workspaces for all three partners, plus the capability Alliana needs. She is
   an `agent` access profile, so the key is granted per-member the way a real
   grant would be. */
const SETUP = `
  do $s$ begin
    perform public.ensure_talentops_workspace('${AGENCY}', '${BMF}');
    perform public.ensure_talentops_workspace('${AGENCY}', '${KA}');
    perform public.ensure_talentops_workspace('${AGENCY}', '${BIZHUB}');
  end $s$;
  insert into agency_member_permissions (membership_id, key, allowed)
  select m.id, 'talentops.view', true from agency_memberships m
   where m.user_id in ('${ALLIANA}', '${OTHER}')
  on conflict (membership_id, key) do update set allowed = true;
  insert into partner_assignments (agency_id, group_id, user_id, assignment_role, started_on, created_by)
  select '${AGENCY}', '${BIZHUB}', '${OTHER}', 'assigned', current_date, '${OWNER}'
   where not exists (select 1 from partner_assignments
                      where group_id='${BIZHUB}' and user_id='${OTHER}' and ended_on is null);
`;

console.log("\nTalentOps — partner isolation\n");

console.log("The partner list is the partners you are assigned");
{
  const r = as(ALLIANA, SETUP, `select partner_name from public.talentops_partners() order by 1;`);
  const names = r.ok ? r.rows.map((x) => x.partner_name) : [];
  check("Alliana sees Business Made Fair and K&A", names, ["Business Made Fair", "K&A Consulting Group"]);
  check("Alliana does NOT see Bizhub", names.includes("Bizhub"), false);

  /* Bizhub's only live service is BES_CRM, so it is correctly NOT a TalentOps
     partner. The rule being asserted is that an agent assigned elsewhere sees
     none of Alliana's accounts — the partner list is not a roster of everyone. */
  const r2 = as(OTHER, SETUP, `select partner_name from public.talentops_partners() order by 1;`);
  const other = r2.ok ? r2.rows.map((x) => x.partner_name) : [];
  check("an agent assigned elsewhere sees none of her accounts",
    other.some((n) => n === "Business Made Fair" || n === "K&A Consulting Group"), false);
}

console.log("\nAnd the workspace itself refuses, not just the list");
{
  const r = as(ALLIANA, SETUP, `
    select (select count(*)::int from workspaces w
             where w.module='talentops' and w.partner_group_id='${BIZHUB}') as bizhub,
           (select count(*)::int from workspaces w
             where w.module='talentops' and w.partner_group_id='${BMF}') as bmf;`);
  check("Bizhub's workspace row is not readable by Alliana", r.ok ? r.rows[0]?.bizhub : "error", 0);
  check("her own partner's workspace is", r.ok ? r.rows[0]?.bmf : "error", 1);
}

console.log("\nTasks follow the workspace");
{
  /* Created as the OWNER, not as superuser: `log_work_activity()` refuses to
     record an event with no actor, which is correct — an activity row with no
     author is worse than none. So the probe creates work the way a person
     does, then switches identity to read it. */
  const r = as(OWNER, SETUP, `
    insert into work_items (agency_id, scope, related_type, title, stage, workspace_id, board_id, partner_group_id, created_by)
    select '${AGENCY}', 'AGENCY', 'project', 'Probe · Bizhub inbox review', 'Queued', w.id,
           (select b.id from workspace_boards b where b.workspace_id = w.id limit 1), '${BIZHUB}', '${OWNER}'
      from workspaces w where w.module='talentops' and w.partner_group_id='${BIZHUB}';
    insert into work_items (agency_id, scope, related_type, title, stage, workspace_id, board_id, partner_group_id, created_by)
    select '${AGENCY}', 'AGENCY', 'project', 'Probe · BMF follow-ups', 'Queued', w.id,
           (select b.id from workspace_boards b where b.workspace_id = w.id limit 1), '${BMF}', '${OWNER}'
      from workspaces w where w.module='talentops' and w.partner_group_id='${BMF}';
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${ALLIANA}","role":"authenticated"}', true); end $c$;
    select title from work_items where title like 'Probe · %' order by 1;`);
  const titles = r.ok ? r.rows.map((x) => x.title) : [];
  check("Alliana sees her partner's UNASSIGNED task — a backlog she can pick up from",
    titles, ["Probe · BMF follow-ups"]);
  check("and not the other partner's", titles.some((t) => t.includes("Bizhub")), false);
}

console.log("\nAn assignment that has ENDED takes the access with it");
{
  const r = as(ALLIANA, `${SETUP}
    update partner_assignments set ended_on = current_date
     where group_id='${KA}' and user_id='${ALLIANA}' and ended_on is null;`,
    `select count(*)::int as n from public.talentops_partners() where partner_name = 'K&A Consulting Group';`);
  check("K&A disappears once the assignment ends", r.ok ? r.rows[0]?.n : "error", 0);
}

console.log("\nWithout a TalentOps capability, nothing");
{
  /* BOTH keys, because `may_reach_talentops` reads either one for a read:
     somebody who may WORK in the module can obviously see it. Revoking only
     `talentops.view` stopped closing the door the moment real people were
     granted `talentops.tasks.manage` — the probe was asserting a precondition,
     not the rule. */
  const revokeAll = `
    update agency_member_permissions set allowed = false
     where key in ('talentops.view', 'talentops.tasks.manage')
       and membership_id in (select id from agency_memberships where user_id = '${ALLIANA}');`;
  const r = as(ALLIANA, `${SETUP} ${revokeAll}`,
    `select (select count(*)::int from workspaces w where w.module='talentops') as ws;`);
  check("no TalentOps capability at all means no workspace", r.ok ? r.rows[0]?.ws : "error", 0);

  /* And the half that matters for a working agent: view alone lets you read
     the module, but not create work in it. */
  const readOnly = as(ALLIANA, `${SETUP} ${revokeAll}
    insert into agency_member_permissions (membership_id, key, allowed)
    select m.id, 'talentops.view', true from agency_memberships m where m.user_id = '${ALLIANA}'
    on conflict (membership_id, key) do update set allowed = true;`,
    `select public.may_reach_talentops(
       (select id from workspaces where module='talentops' and partner_group_id='${BMF}'), false) as may_read,
     public.may_reach_talentops(
       (select id from workspaces where module='talentops' and partner_group_id='${BMF}'), true) as may_work;`);
  check("view alone: may read", readOnly.ok ? readOnly.rows[0]?.may_read : "error", true);
  check("view alone: may NOT work", readOnly.ok ? readOnly.rows[0]?.may_work : "error", false);
}

console.log("\nProvisioning is idempotent");
{
  const r = as(OWNER, "", `
    do $$ declare a uuid; b uuid; begin
      a := public.ensure_talentops_workspace('${AGENCY}', '${BMF}');
      b := public.ensure_talentops_workspace('${AGENCY}', '${BMF}');
      if a <> b then raise exception 'provisioned twice'; end if;
    end $$;
    select 1 as ok;`);
  check("opening a partner folder twice makes one workspace", r.ok, true);

  const r2 = as(OWNER, SETUP, `
    select count(*)::int as n from workspace_statuses s
      join workspaces w on w.id = s.workspace_id
     where w.module='talentops' and w.partner_group_id='${BMF}';`);
  check("with Dee's seven statuses", r2.ok ? r2.rows[0]?.n : "error", 7);
}

console.log("\nSERVICE decides the module; ASSIGNMENT decides the people");
{
  /* The rule Bizhub proved. JM does EA work there, and the partner was
     invisible in TalentOps because the FUNCTION carried a short list of
     service codes — not because the model was wrong. The catalogue's own
     `module` column is the mapping now (0342). */
  const JM_STANDIN = OTHER;

  const r = as(JM_STANDIN, SETUP, `select partner_name from public.talentops_partners() order by 1;`);
  check("a partner with a live TalentOps-family service appears",
    (r.ok ? r.rows.map((x) => x.partner_name) : []).includes("Bizhub"), true);

  /* An assignment is NOT what puts a partner in the module. Strip the service
     and the partner leaves TalentOps even though the assignment remains. */
  const r2 = as(JM_STANDIN, `${SETUP}
    update partner_services set status = 'paused'
     where group_id = '${BIZHUB}' and service_type = 'EXECUTIVE_ASSISTANT';`,
    `select count(*)::int as n from public.talentops_partners() where partner_name = 'Bizhub';`);
  check("pause the service and it leaves TalentOps, assignment untouched",
    r2.ok ? r2.rows[0]?.n : "error", 0);

  const stillThere = as(OWNER, `${SETUP}
    update partner_services set status = 'paused'
     where group_id = '${BIZHUB}' and service_type = 'EXECUTIVE_ASSISTANT';`,
    `select count(*)::int as n from partner_assignments
      where group_id = '${BIZHUB}' and user_id = '${JM_STANDIN}' and ended_on is null;`);
  check("and the history of who worked it is preserved",
    stillThere.ok ? stillThere.rows[0]?.n : "error", 1);

  /* Removing the person removes THEIR scope, not the partner's module. */
  const r3 = as(JM_STANDIN, `${SETUP}
    update partner_assignments set ended_on = current_date
     where group_id = '${BIZHUB}' and user_id = '${JM_STANDIN}' and ended_on is null;`,
    `select count(*)::int as n from public.talentops_partners() where partner_name = 'Bizhub';`);
  check("end the assignment and THEY lose it", r3.ok ? r3.rows[0]?.n : "error", 0);

  const r4 = as(OWNER, `${SETUP}
    update partner_assignments set ended_on = current_date
     where group_id = '${BIZHUB}' and user_id = '${JM_STANDIN}' and ended_on is null;`,
    `select count(*)::int as n from public.talentops_partners() where partner_name = 'Bizhub';`);
  check("but the partner is still in TalentOps for everyone else",
    r4.ok ? r4.rows[0]?.n : "error", 1);

  /* Both modules at once: adding TalentOps must not disturb BES CRM. */
  const r5 = as(OWNER, "", `
    select count(*)::int as n from partner_services ps
      join partner_service_types st on st.code = ps.service_type
     where ps.group_id = '${BIZHUB}' and ps.status = 'active' and st.module = 'bes_crm';`);
  check("its BES CRM service is untouched", r5.ok ? r5.rows[0]?.n : "error", 1);

  /* And the mapping is the catalogue, not a list in a function. */
  const r6 = as(OWNER, "", `
    select count(*)::int as n from partner_service_types
     where category = 'Staffing' and module is distinct from 'talentops';`);
  check("every Staffing service maps to TalentOps by catalogue",
    r6.ok ? r6.rows[0]?.n : "error", 0);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
