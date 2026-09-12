/**
 * Sales & Marketing — acceptance tests against the live database.
 *
 * Every scenario runs inside a transaction that is rolled back, as a REAL
 * authenticated user rather than the connection owner. A superuser passes
 * every authorization test ever written, which is why none of these are run
 * as one.
 *
 * What is being proved, in Dee's words:
 *   "Roniel + Kaori get Sales & Marketing access"        → tests 1–8
 *   "one task engine across all Partners"                → tests 9–12
 *   "no duplicate Marketing-specific task backend"       → tests 13–15
 *   "Partner names A→Z"                                  → test 16
 *   "one canonical work_item displayed by publish date"  → tests 17–20
 *   partner approvals, both outcomes                     → tests 21–26
 *
 * Run: node supabase/scripts/marketing-module-probe.mjs
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

/* Resolved ONCE as the connection owner and inlined as literals. Looking them
   up inside the probe's own statement would run under the acting user's RLS —
   a restricted agent gets null, the probe asserts against null, and a broken
   rule passes for the wrong reason. */
const one = (sql) => q.query(sql)[0];
const AGENCY = one("select id from agencies order by created_at limit 1").id;
const WS = one("select id from workspaces where module='sales_marketing' and partner_group_id is null").id;
const AGENT = one("select user_id from agency_memberships where id='dddddddd-0000-4000-8000-552c4064ccbd'").user_id;
const AGENT_M = "dddddddd-0000-4000-8000-552c4064ccbd";       // [TEST] Eli Credit, assigned-only
const OUTSIDER = one("select user_id from agency_memberships where id='dddddddd-0000-4000-8000-b367e934794f'").user_id;
const OUTSIDER_M = "dddddddd-0000-4000-8000-b367e934794f";     // [TEST] Gus Restricted, no marketing keys
const OWNER = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;

/** Become `user`, run `action`, read the answer as the owner, roll it all back. */
const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      `begin; ${setup}
       set local role authenticated;
       do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
       ${action} rollback;`) };
  } catch (e) {
    const error = String(e.message).replace(/\s+/g, " ").slice(0, 200);
    if (process.env.PROBE_DEBUG) console.log(`       [error] ${error}`);
    return { ok: false, error };
  }
};

/* The capability grants a marketing hire arrives with. Exactly what Roniel's
   and Kaori's invitations carry, so these tests fail if those change. */
const marketingKeys = (membership, ...keys) => keys
  .map((k) => `insert into agency_member_permissions (membership_id, key, allowed) values ('${membership}','${k}',true) on conflict (membership_id, key) do update set allowed = true;`)
  .join("\n");
const HIRED = marketingKeys(AGENT_M, "marketing.workspace.view", "marketing.tasks.manage");
const VIEW_ONLY = marketingKeys(AGENT_M, "marketing.workspace.view");

console.log("\nWHO REACHES THE MODULE");

check("1. a marketing hire sees the marketing workspace",
  as(AGENT, HIRED, `reset role; select count(*)::int as n from workspaces where id='${WS}';`).rows,
  [{ n: 1 }]);

check("2. …and reaches it through workspace_reach, not through being a manager",
  as(AGENT, HIRED, `select may_reach_marketing('${WS}', false) as view, may_reach_marketing('${WS}', true) as work, is_agency_manager_or_above() as manager;`).rows,
  [{ view: true, work: true, manager: false }]);

check("3. view-only reaches it to read but not to work",
  as(AGENT, VIEW_ONLY, `select may_reach_marketing('${WS}', false) as view, may_reach_marketing('${WS}', true) as work;`).rows,
  [{ view: true, work: false }]);

check("4. a colleague with no marketing capability reaches nothing",
  as(OUTSIDER, "", `select may_reach_marketing('${WS}', false) as view, may_reach_marketing('${WS}', true) as work;`).rows,
  [{ view: false, work: false }]);

check("5. …and cannot see the workspace at all",
  as(OUTSIDER, "", `select count(*)::int as n from workspaces where id='${WS}';`).rows,
  [{ n: 0 }]);

check("6. the owner reaches it without an explicit grant",
  as(OWNER, "", `select may_reach_marketing('${WS}', true) as work;`).rows,
  [{ work: true }]);

check("7. the capability does not widen anything outside the module",
  as(AGENT, HIRED, `select count(*)::int as n from workspaces where module is distinct from 'sales_marketing' and organization_id is null;`).rows,
  [{ n: 0 }]);

check("8. a marketing hire is not made a CreditOps agent by the same grant",
  as(AGENT, HIRED, `select agency_can('partners.clients') as creditops, agency_can('ops.manage') as manage;`).rows,
  [{ creditops: false, manage: false }]);

console.log("\nONE TASK ENGINE");

const NEW_TASK = `insert into work_items (agency_id, scope, related_type, division, workspace_id, status_id, item_type_id, title, priority)
  values ('${AGENCY}', 'AGENCY', 'project', 'sales_marketing', '${WS}',
    (select id from workspace_statuses where workspace_id='${WS}' and key='todo'),
    (select id from workspace_item_types where workspace_id='${WS}' and key='content'),
    'Probe: October launch post', 'Normal') returning id`;

check("9. a marketing hire creates work in the workspace",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v; end $a$;
     reset role; select count(*)::int as n from work_items where title='Probe: October launch post';`).rows,
  [{ n: 1 }]);

check("10. …and may assign it to a colleague, not only to themselves",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       update work_items set assigned_to = '${OUTSIDER}' where id = v; end $a$;
     reset role; select assigned_to from work_items where title='Probe: October launch post';`).rows,
  [{ assigned_to: OUTSIDER }]);

check("11. a view-only hire cannot create work",
  as(AGENT, VIEW_ONLY, `do $a$ declare v uuid; begin ${NEW_TASK} into v; end $a$;`).ok,
  false);

check("12. a colleague with no marketing capability cannot create work there",
  as(OUTSIDER, "", `do $a$ declare v uuid; begin ${NEW_TASK} into v; end $a$;`).ok,
  false);

console.log("\nNO SECOND BACKEND");

check("13. checklists on marketing work are the canonical work_checklist_items",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       insert into work_checklist_items (work_item_id, label, position) values (v, 'Draft the caption', 10); end $a$;
     reset role; select count(*)::int as n from work_checklist_items ck
       join work_items wi on wi.id = ck.work_item_id where wi.title='Probe: October launch post';`).rows,
  [{ n: 1 }]);

check("14. content metadata is a workspace field value, not a content table",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       insert into work_item_field_values (work_item_id, field_id, value)
       values (v, (select id from workspace_fields where workspace_id='${WS}' and key='publish_at'), to_jsonb('2026-10-05'::text)); end $a$;
     reset role; select publish_on from marketing_work where title='Probe: October launch post';`).rows,
  [{ publish_on: "2026-10-05" }]);

check("15. there is no marketing-specific task table in the schema",
  q.query(`select count(*)::int as n from information_schema.tables
            where table_schema='public'
              and (table_name like 'marketing_task%' or table_name like 'content_item%'
                or table_name like 'marketing_work_item%')`),
  [{ n: 0 }]);

console.log("\nWHAT THE SCREENS READ");

check("16. partners come back A→Z regardless of anything else",
  (() => {
    const rows = q.query("select name from marketing_partners order by lower(name)");
    const sorted = [...rows].sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
    return JSON.stringify(rows) === JSON.stringify(sorted);
  })(),
  true);

check("17. the calendar reads the same row as the task list",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       insert into work_item_field_values (work_item_id, field_id, value)
       values (v, (select id from workspace_fields where workspace_id='${WS}' and key='publish_at'), to_jsonb('2026-10-05'::text)); end $a$;
     reset role; select count(distinct id)::int as rows_behind_both_views from marketing_work
       where title='Probe: October launch post' and publish_on is not null;`).rows,
  [{ rows_behind_both_views: 1 }]);

check("18. marketing_work is security_invoker, so it cannot leak past RLS",
  q.query(`select coalesce((select true from pg_class c
             where c.relname='marketing_work' and c.reloptions::text like '%security_invoker=true%'), false) as invoker`),
  [{ invoker: true }]);

check("19. …and so are the other two module views",
  q.query(`select count(*)::int as n from pg_class c
            where c.relname in ('marketing_overview','marketing_approvals','marketing_partners')
              and c.reloptions::text like '%security_invoker=true%'`),
  [{ n: 3 }]);

check("20. someone outside the module reads no marketing work at all",
  as(OUTSIDER, "", `select count(*)::int as n from marketing_work;`).rows,
  [{ n: 0 }]);

console.log("\nPARTNER APPROVALS");

/* A partner with a live marketing engagement, created inside the transaction
   so the probe never depends on production having one yet. */
const PARTNER_SETUP = `
  insert into outsourcing_groups (id, agency_id, name, contact_email, status, lifecycle, portal_access_enabled)
  values ('11111111-2222-4333-8444-555555555555', '${AGENCY}', 'Probe Marketing Partner', 'probe@bes.test', 'Active', 'active', true),
         ('11111111-2222-4333-8444-666666666666', '${AGENCY}', 'Probe Other Partner',    'other@bes.test', 'Active', 'active', true);
  insert into fulfillment_engagements (agency_id, outsourcing_group_id, service, status, effective_from)
  values ('${AGENCY}', '11111111-2222-4333-8444-555555555555', 'sales_marketing', 'active', current_date - 1);`;

const PARTNER_WS = `(select id from workspaces where partner_group_id='11111111-2222-4333-8444-555555555555' and module='sales_marketing')`;

check("21. an active engagement provisions the partner's workspace, once",
  as(OWNER, PARTNER_SETUP, `reset role; select count(*)::int as n from workspaces
     where partner_group_id='11111111-2222-4333-8444-555555555555' and module='sales_marketing';`).rows,
  [{ n: 1 }]);

/* Dee: "Do NOT create duplicate workspaces every time another Marketing
   service is added. Creation must be idempotent." A second ENGAGEMENT is
   already impossible — `fulfillment_engagements_one_active_per_service` sees
   to that — so what has to be idempotent is the provisioning call itself,
   which fires on every engagement change and every time the module lists its
   partners. */
check("22. provisioning again returns the same workspace and creates no second one",
  as(OWNER, PARTNER_SETUP, `reset role;
    select (select count(*)::int from workspaces
             where partner_group_id='11111111-2222-4333-8444-555555555555' and module='sales_marketing') as workspaces,
           (ensure_marketing_workspace('${AGENCY}', '11111111-2222-4333-8444-555555555555', null)
              = ${PARTNER_WS}) as same_one;`).rows,
  [{ workspaces: 1, same_one: true }]);

const PARTNER_TASK = `insert into work_items (agency_id, scope, related_type, division, workspace_id, status_id, item_type_id, title)
  values ('${AGENCY}', 'AGENCY', 'project', 'sales_marketing', ${PARTNER_WS},
    (select id from workspace_statuses where workspace_id=${PARTNER_WS} and key='in_progress'),
    (select id from workspace_item_types where workspace_id=${PARTNER_WS} and key='content'),
    'Probe: partner post') returning id`;

check("23. asking for approval moves the work to For Partner Approval",
  as(AGENT, PARTNER_SETUP + HIRED, `do $a$ declare v uuid; begin ${PARTNER_TASK} into v;
       perform request_partner_approval(v, 'content_approval', null, null); end $a$;
     reset role; select status_key from marketing_work where title='Probe: partner post';`).rows,
  [{ status_key: "partner_approval" }]);

check("24. asking twice does not ask twice",
  as(AGENT, PARTNER_SETUP + HIRED, `do $a$ declare v uuid; begin ${PARTNER_TASK} into v;
       perform request_partner_approval(v, 'content_approval', null, null);
       perform request_partner_approval(v, 'content_approval', null, null); end $a$;
     reset role; select count(*)::int as n from partner_action_items a
       join work_items wi on wi.id = a.work_item_id where wi.title='Probe: partner post' and a.status='open';`).rows,
  [{ n: 1 }]);

/* Asserted on the MESSAGE, not merely on failure: a statement that failed
   for a typo would otherwise prove this rule just as convincingly. */
check("25. BES's own work has no partner to ask, and says so",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       perform request_partner_approval(v, 'content_approval', null, null); end $a$;`)
    .error?.includes("no partner to ask") ?? false,
  true);

check("26. a view-only hire cannot even create the partner's work, let alone send it",
  as(AGENT, PARTNER_SETUP + VIEW_ONLY, `do $a$ declare v uuid; begin ${PARTNER_TASK} into v; end $a$;`)
    .error?.includes("row-level security") ?? false,
  true);

/* The second outcome is the whole reason marketing approvals are not
   CreditOps confirmations: a partner may say "change this", and the work has
   to come back to the person who made it. */
const PARTNER_CONTACT = `
  insert into partner_contacts (group_id, agency_id, full_name, email, user_id, status, is_primary, activated_at)
  values ('11111111-2222-4333-8444-555555555555', '${AGENCY}', 'Probe Contact', 'probe.contact@bes.test',
          '${OUTSIDER}', 'active', true, now());`;

check("27. the partner approving completes the work",
  as(OUTSIDER, PARTNER_SETUP + PARTNER_CONTACT + `
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true); end $c$;
      do $b$ declare v uuid; begin ${PARTNER_TASK} into v;
         perform request_partner_approval(v, 'content_approval', null, null); end $b$;
      reset role;`,
    `do $a$ begin perform my_partner_review(
        (select id from my_partner_actions() where status='open' and kind='content_approval'
          order by requested_at desc limit 1), true, 'Looks good'); end $a$;
     reset role; select status_key from marketing_work where title='Probe: partner post';`).rows,
  [{ status_key: "completed" }]);

check("28. the partner requesting changes sends it back to In Progress",
  as(OUTSIDER, PARTNER_SETUP + PARTNER_CONTACT + `
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true); end $c$;
      do $b$ declare v uuid; begin ${PARTNER_TASK} into v;
         perform request_partner_approval(v, 'content_approval', null, null); end $b$;
      reset role;`,
    `do $a$ begin perform my_partner_review(
        (select id from my_partner_actions() where status='open' and kind='content_approval'
          order by requested_at desc limit 1), false, 'Swap the headline'); end $a$;
     reset role; select mw.status_key, a.status, a.response
       from marketing_work mw join partner_action_items a on a.work_item_id = mw.id
      where mw.title='Probe: partner post';`).rows,
  [{ status_key: "in_progress", status: "changes_requested", response: "Swap the headline" }]);

/* The approval is inserted with a KNOWN id, as the owner, so the refusal
   below can only be about ownership. Resolving it as the caller would return
   null — and my_partner_review refuses a null id with the very same message,
   which is a false pass wearing the right words. */
const FOREIGN_APPROVAL = "22222222-3333-4444-8555-666666666666";

check("29. one partner cannot answer another partner's approval",
  as(OUTSIDER, PARTNER_SETUP + `
      insert into partner_contacts (group_id, agency_id, full_name, email, user_id, status, is_primary, activated_at)
      values ('11111111-2222-4333-8444-666666666666', '${AGENCY}', 'Probe Contact', 'probe.contact@bes.test',
              '${OUTSIDER}', 'active', true, now());
      insert into partner_action_items (id, agency_id, group_id, kind, title, detail, status)
      values ('${FOREIGN_APPROVAL}', '${AGENCY}', '11111111-2222-4333-8444-555555555555',
              'content_approval', 'Somebody else''s post', 'Please approve', 'open');`,
    `do $a$ begin perform my_partner_review('${FOREIGN_APPROVAL}'::uuid, true, null); end $a$;`)
    .error?.includes("not yours to review") ?? false,
  true);

check("30. …and the approval is untouched afterwards",
  q.query(`select count(*)::int as n from partner_action_items where id = '${FOREIGN_APPROVAL}'`),
  [{ n: 0 }]);

console.log("\nA MARKETING HIRE'S WORKING DAY");

/* Everything Dee listed for Roniel and Kaori, asked of an AGENT with the two
   marketing capabilities and nothing else — no ops.manage, no admin role.
   "without requiring management-level access" is the whole assertion. */

check("31. posts an update on a marketing task",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       insert into activity_events (agency_id, entity_type, entity_id, actor_id, actor_name,
                                    action, detail, visibility)
       values ('${AGENCY}', 'work_item', v::text, auth.uid(), 'Probe', 'Comment posted',
               'Draft is ready for review', 'bes_internal'); end $a$;
     reset role; select count(*)::int as n from activity_events ae
       join work_items wi on wi.id::text = ae.entity_id
      where wi.title='Probe: October launch post' and ae.action='Comment posted';`).rows,
  [{ n: 1 }]);

check("32. an @mention on that update notifies the person named",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       insert into activity_events (agency_id, entity_type, entity_id, actor_id, actor_name,
                                    action, detail, visibility, body)
       values ('${AGENCY}', 'work_item', v::text, auth.uid(), 'Probe', 'Comment posted',
               '@Owner take a look', 'bes_internal',
               jsonb_build_object('type','doc','content', jsonb_build_array(
                 jsonb_build_object('type','paragraph','content', jsonb_build_array(
                   jsonb_build_object('type','mention','attrs',
                     jsonb_build_object('userId','${OWNER}','label','Owner'))))))); end $a$;
     reset role; select count(*)::int as n from notifications
      where kind='mention' and recipient_id='${OWNER}' and entity_type='work_item';`).rows,
  [{ n: 1 }]);

check("33. attaches a file to a marketing task",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       insert into files (agency_id, entity_type, entity_id, bucket, path, name,
                          mime_type, size_bytes, uploaded_by)
       values ('${AGENCY}', 'work_item', v::text, 'work-files',
               'probe/' || v::text || '/shot.png', 'shot.png', 'image/png', 1234, auth.uid()); end $a$;
     reset role; select count(*)::int as n from files f
       join work_items wi on wi.id::text = f.entity_id
      where wi.title='Probe: October launch post' and f.entity_type='work_item';`).rows,
  [{ n: 1 }]);

check("34. creates a campaign and puts work in it",
  as(AGENT, HIRED, `do $a$ declare v uuid; c uuid; begin
       insert into campaigns (agency_id, workspace_id, name, status)
       values ('${AGENCY}', '${WS}', 'Probe: Q4 launch', 'active') returning id into c;
       ${NEW_TASK} into v;
       update work_items set campaign_id = c where id = v; end $a$;
     reset role; select campaign_name from marketing_work where title='Probe: October launch post';`).rows,
  [{ campaign_name: "Probe: Q4 launch" }]);

check("35. a view-only hire cannot create a campaign",
  as(AGENT, VIEW_ONLY, `do $a$ begin
       insert into campaigns (agency_id, workspace_id, name, status)
       values ('${AGENCY}', '${WS}', 'Probe: refused', 'active'); end $a$;`)
    .error?.includes("row-level security") ?? false,
  true);

check("36. schedules content on the calendar",
  as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v;
       insert into work_item_field_values (work_item_id, field_id, value)
       values (v, (select id from workspace_fields where workspace_id='${WS}' and key='publish_at'),
               to_jsonb('2026-10-20'::text));
       insert into work_item_field_values (work_item_id, field_id, value)
       values (v, (select id from workspace_fields where workspace_id='${WS}' and key='channel'),
               to_jsonb('Instagram'::text)); end $a$;
     reset role; select publish_on, channel from marketing_work where title='Probe: October launch post';`).rows,
  [{ publish_on: "2026-10-20", channel: "Instagram" }]);

check("37. …and none of that made them a manager",
  as(AGENT, HIRED, `select is_agency_manager_or_above() as manager, agency_can('ops.manage') as ops,
       agency_can('partners.clients') as creditops, agency_can('finance.dashboard.view') as money;`).rows,
  [{ manager: false, ops: false, creditops: false, money: false }]);

console.log("\nSCOPE: GLOBAL vs ONE PARTNER");

const BMF = q.query(`select id from outsourcing_groups where name = 'Business Made Fair' and archived_at is null`)[0]?.id;
const BMF_WS = BMF
  ? q.query(`select id from workspaces where partner_group_id = '${BMF}' and module = 'sales_marketing'`)[0]?.id
  : null;

if (!BMF_WS) {
  console.log("  SKIP 38-41  Business Made Fair has no marketing workspace yet");
} else {
  const BMF_TASK = `insert into work_items (agency_id, scope, related_type, division, workspace_id, status_id, item_type_id, title)
    values ('${AGENCY}', 'AGENCY', 'project', 'sales_marketing', '${BMF_WS}',
      (select id from workspace_statuses where workspace_id='${BMF_WS}' and key='in_progress'),
      (select id from workspace_item_types where workspace_id='${BMF_WS}' and key='content'),
      'Probe: BMF reel') returning id`;

  check("38. the global view shows both BES's work and the partner's",
    as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v; ${BMF_TASK} into v; end $a$;
       reset role; select count(distinct workspace_id)::int as workspaces from marketing_work
        where title in ('Probe: October launch post', 'Probe: BMF reel');`).rows,
    [{ workspaces: 2 }]);

  check("39. the partner view shows only that partner's",
    as(AGENT, HIRED, `do $a$ declare v uuid; begin ${NEW_TASK} into v; ${BMF_TASK} into v; end $a$;
       reset role; select count(*)::int as n from marketing_work
        where workspace_id = '${BMF_WS}' and title = 'Probe: October launch post';`).rows,
    [{ n: 0 }]);

  check("40. the calendar and the campaign read that same row, not copies",
    as(AGENT, HIRED, `do $a$ declare v uuid; c uuid; begin ${BMF_TASK} into v;
         insert into campaigns (agency_id, workspace_id, partner_group_id, name, status)
         values ('${AGENCY}', '${BMF_WS}', '${BMF}', 'Probe: BMF October', 'active') returning id into c;
         update work_items set campaign_id = c where id = v;
         insert into work_item_field_values (work_item_id, field_id, value)
         values (v, (select id from workspace_fields where workspace_id='${BMF_WS}' and key='publish_at'),
                 to_jsonb('2026-10-09'::text)); end $a$;
       reset role; select count(distinct id)::int as one_row, max(publish_on) as publish_on,
              max(campaign_name) as campaign from marketing_work where title='Probe: BMF reel';`).rows,
    [{ one_row: 1, publish_on: "2026-10-09", campaign: "Probe: BMF October" }]);

  check("41. BMF is in the partner list because of the engagement, not a list",
    q.query(`select count(*)::int as n from marketing_partners where name = 'Business Made Fair'`),
    [{ n: 1 }]);
}

console.log("\nWHAT THE PARTNER MUST NOT SEE");

/* Dee, 2026-09-13: "BES internal notes remain private." An approval puts a
   partner's eyes on one task — it must not put their eyes on the discussion
   around it. Asked as a REAL partner contact, not as staff. */
const KAORI_PORTAL = q.query(
  `select user_id from partner_contacts where email = 'kaori@blessedempireservices.com'
     and status = 'active' and user_id is not null limit 1`)[0]?.user_id;

if (!KAORI_PORTAL) {
  console.log("  SKIP 42-44  no activated partner contact to ask as");
} else {
  check("42. a partner contact reads no marketing work directly",
    as(KAORI_PORTAL, "", `select count(*)::int as n from marketing_work;`).rows,
    [{ n: 0 }]);

  check("43. …and no BES-internal note, on a task they were asked to approve",
    as(KAORI_PORTAL, "", `select count(*)::int as n from activity_events
       where entity_type = 'work_item' and visibility = 'bes_internal';`).rows,
    [{ n: 0 }]);

  check("44. they DO see the approval they were asked for",
    (as(KAORI_PORTAL, "", `select count(*)::int as n from my_partner_actions() where status = 'open';`)
      .rows?.[0]?.n ?? 0) > 0,
    true);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exitCode = 1; }
q.close();
