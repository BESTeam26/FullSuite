/**
 * The CreditOps day, walked as every ACTIVE agent on the live roster.
 *
 * Dee, 2026-10-15: "I need all CreditOps working and functioning correctly
 * for all agents active … ensure all working functions are LOCKED and don't
 * make them not working again." The RLS matrix proves the rules with
 * fixtures; this walks the real people, with the real partners, through the
 * writes an agent makes in a day — open a file, change its credit status,
 * set their own department status, log production, hand off, post a note,
 * attach a file, edit contact details, clock in, submit an End of Day, and
 * add a client on each partner they serve. Every write is rolled back; the
 * live data is never changed.
 *
 * Fails loudly (exit 1) on the first refusal, naming the person and the
 * step, so a change that breaks one agent's workflow cannot ship. Part of
 * `npm run gate`.
 *
 *   node supabase/scripts/creditops-agent-walk.mjs
 */
import { createSyncQuery, readProjectRef, readAccessToken } from "./lib/sync-query.mjs";

const { query: q, close } = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

const AG = q(`select id from public.agencies where name = 'Blessed Empire Services'`)[0].id;
const DEPT_FOR_KEY = { dispute: "Dispute", support: "Support", client_success: "Support", complaints: "Complaints", bureau_calling: "Bureau Calling", onboarding: "Onboarding" };
const HANDOFF_TARGET = { Dispute: ["Support", "SUPPORT NEW"], Support: ["Complaints", "LETTERS PENDING"], Complaints: ["Support", "SUPPORT NEW"], "Bureau Calling": ["Support", "SUPPORT NEW"], Onboarding: ["Dispute", "READY FOR PROCESSING"] };

/* Active, non-fixture agents (agency_user) with a CreditOps team. */
const agents = q(`
  select distinct on (p.id) p.id, p.full_name, t.id as team_id, d.key as dept_key
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id and coalesce(p.is_fixture, false) = false
    join public.team_memberships tm on tm.user_id = p.id
    join public.teams t on t.id = tm.team_id and t.archived_at is null and not t.is_fixture
    join public.departments d on d.id = t.department_id and d.division = 'creditops'
   where m.status = 'active' and m.role = 'agency_user'
   order by p.id, tm.is_lead desc, t.name`);
const partners = q(`select id, name from public.outsourcing_groups where lifecycle = 'active' and not coalesce(is_fixture, false)
  and exists (select 1 from public.fulfillment_clients c where c.outsourcing_group_id = outsourcing_groups.id and c.archived_at is null) order by name`);

let failures = 0, checks = 0;
const eastern = `(now() at time zone 'America/New_York')::date`;
for (const a of agents) {
  const dept = DEPT_FOR_KEY[a.dept_key] ?? "Support";
  const [other, otherStatus] = HANDOFF_TARGET[dept];
  const file = q(`select s.client_id, s.status from public.client_department_statuses s join public.fulfillment_clients c on c.id = s.client_id
    where s.assignee_id = '${a.id}' and s.department = '${dept}' and public.creditops_status_is_actionable(s.department, s.status)
      and c.archived_at is null and not coalesce(c.is_fixture, false) order by s.updated_at desc limit 1`)[0];
  const steps = {};
  if (file) {
    const c = file.client_id;
    Object.assign(steps, {
      "open the file (department rows)": `select count(*) from public.client_department_statuses where client_id = '${c}'`,
      "read its activity": `select count(*) from public.activity_events where entity_id = '${c}'`,
      "change the credit status": `update public.fulfillment_clients set status = 'Ready for Credit Review' where id = '${c}' returning id`,
      "set own department status with a note": `select public.set_client_department_status('${c}', '${dept}', '${file.status}', '${a.id}', 'walk')`,
      "log production": `insert into public.production_logs (request_id, agency_id, employee_id, service, division_id, department_key, client_id, production_unit_type, production_unit_quantity, actions, work_notes, work_date)
        values (gen_random_uuid(), '${AG}', '${a.id}', 'creditops', 'creditops', '${dept}', '${c}', '${dept}', 1, array['Client File Reviewed'], 'walk', ${eastern}) returning id`,
      "hand off to another department": `select public.handoff_client_departments('${c}', '${dept}', array['${other}']::public.fulfillment_department[], array['${otherStatus}'], 'walk')`,
      "post an internal note": `insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name, action, detail, visibility)
        values ('${AG}', null, 'fulfillment_client', '${c}', '${a.id}', 'walk', 'Internal note', 'walk', 'bes_internal') returning id`,
      "attach a screenshot (storage + file row)": `insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('bes-files', 'clients/${c}/1-walk.png', '${a.id}', '${a.id}', '{}');
        insert into public.files (entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by, agency_id)
        values ('fulfillment_client', '${c}', 'bes-files', 'clients/${c}/1-walk.png', 'walk.png', 'image/png', 1, '${a.id}', '${AG}') returning id`,
      "edit contact details": `update public.fulfillment_clients set phone = '+10000000000' where id = '${c}' returning id`,
    });
  } else {
    steps["has a file in their queue"] = `select 1/0`;
  }
  Object.assign(steps, {
    "clock in (or is already clocked in)": `insert into public.time_entries (agency_id, employee_id, division_id, work_date, started_at, kind)
      select '${AG}', '${a.id}', 'creditops', ${eastern}, now(), 'work'
       where not exists (select 1 from public.time_entries t where t.employee_id = '${a.id}' and t.ended_at is null)`,
    "submit End of Day": `insert into public.eod_submissions (agency_id, employee_id, work_date, state, submitted_at, submitted_by)
      values ('${AG}', '${a.id}', ${eastern}, 'submitted', now(), '${a.id}')
      on conflict (employee_id, work_date) do update set submitted_at = now(), submitted_by = excluded.submitted_by, state = 'submitted' returning id`,
  });
  for (const g of partners) {
    steps[`add a client on ${g.name}`] = `insert into public.fulfillment_clients (agency_id, name, email, mode, outsourcing_group_id, auto_sync, status, round, team_id, created_by)
      values ('${AG}', '[walk]', 'walk-${Date.now()}@example.test', 'outsourcing_only', '${g.id}', false, 'New Client', 'Pre-Round', '${a.team_id}', '${a.id}') returning id`;
  }
  const bad = [];
  for (const [label, sql] of Object.entries(steps)) {
    checks += 1;
    try {
      q(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${a.id}","role":"authenticated"}'; ${sql}; rollback;`);
    } catch (e) {
      failures += 1;
      bad.push(`  ✗ ${label}: ${(e.message.match(/ERROR:\s*([^\n]{0,140})/) || [, e.message.slice(0, 140)])[1]}`);
    }
  }
  console.log(`${bad.length === 0 ? "✓" : "✗"} ${a.full_name} (${dept})${bad.length ? "\n" + bad.join("\n") : ""}`);
}
console.log(`\n${checks - failures}/${checks} checks passed across ${agents.length} active agents and ${partners.length} partners`);
close();
process.exit(failures === 0 ? 0 : 1);
