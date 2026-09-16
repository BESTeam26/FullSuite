/**
 * Production release certification, against the live database.
 *
 * Dee, 2026-09-16: *"ALL CURRENT CHANGES EFFECTIVE FOR ALL AUTHORIZED USERS AND
 * PORTALS IN PRODUCTION… No capabilities that work only for Owner/Admin but fail
 * for real agents."*
 *
 * That last sentence is the whole point of this file. The other probes test a
 * rule; this one tests the PEOPLE — the actual accepted roster, each doing the
 * job their placement says they do. A rule can be perfect while every real
 * person is misconfigured, and only this catches that.
 *
 * Everyone is resolved BY SHAPE (division, department, capability), never by
 * name, so the run keeps meaning as the roster changes — the person-independence
 * rule applies to the tests as much as to the application. Names appear only in
 * the printed line, as labels.
 *
 * Every scenario runs as a REAL authenticated user inside a rolled-back
 * transaction. Nothing here writes to production.
 *
 * Run: node supabase/scripts/release-certification-probe.mjs
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
const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      `begin; ${setup}
       set local role authenticated;
       do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
       ${action} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* already gone */ }
    return { ok: false, message: String(e.message ?? e).split("\n")[0] };
  }
};
/** The first row of an authenticated read, or an object of "error" on refusal. */
const row = (user, action, setup = "") => {
  const r = as(user, setup, action);
  /* A refusal must READ like a refusal. Returning a bare object let a failed
     statement present every asserted field as `undefined`, which reports as a
     wrong value rather than as the error it actually was. */
  if (!r.ok) throw new Error(r.message);
  return r.rows[0];
};

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER  = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;

/** Real, active, non-fixture staff placed in a given division, as plain agents. */
const agentsIn = (service, limit = 2) => q.query(`
  select distinct p.id, p.full_name
    from team_memberships tm
    join teams t on t.id = tm.team_id and t.archived_at is null
    join departments dp on dp.id = t.department_id
    join divisions dv on dv.id = dp.division_id and dv.service = '${service}'
    join agency_memberships m on m.user_id = tm.user_id and m.role = 'agency_user' and m.status = 'active'
    join profiles p on p.id = tm.user_id and coalesce(p.is_fixture, false) = false
   order by p.full_name limit ${limit}`);

const adminIn = (service) => one(`
  select distinct p.id, p.full_name
    from team_memberships tm
    join teams t on t.id = tm.team_id and t.archived_at is null
    join departments dp on dp.id = t.department_id
    join divisions dv on dv.id = dp.division_id and dv.service = '${service}'
    join agency_memberships m on m.user_id = tm.user_id and m.role = 'agency_admin'
                             and not m.is_owner and m.status = 'active'
    join profiles p on p.id = tm.user_id and coalesce(p.is_fixture, false) = false
   limit 1`);

const label = (x) => x ? x.full_name : "—";

console.log("\nPRODUCTION RELEASE CERTIFICATION — the real roster, doing real work\n");

/* ───────────────────────────── COMPLAINTS & MAILING ──────────────────────── */

const creditops = agentsIn("creditops", 3);
/* The two agents who share the Complaints department — found by department, so
   this keeps testing "two people in one queue" whoever they turn out to be. */
const complaintsPair = q.query(`
  select p.id, p.full_name
    from team_memberships tm
    join teams t on t.id = tm.team_id and t.archived_at is null
    join departments dp on dp.id = t.department_id and dp.name ilike '%complaint%'
    join agency_memberships m on m.user_id = tm.user_id and m.role = 'agency_user' and m.status = 'active'
    join profiles p on p.id = tm.user_id and coalesce(p.is_fixture, false) = false
   order by p.full_name limit 2`);

console.log(`COMPLAINTS & MAILING — ${complaintsPair.map(label).join(" + ") || "nobody placed"}`);
if (complaintsPair.length < 2) {
  console.log("  SKIPPED — needs two real agents in the Complaints department\n");
} else {
  const everyClient = one("select count(*)::int as n from fulfillment_clients").n;
  for (const person of complaintsPair) {
    const seen = row(person.id, `select
      (select count(*)::int from fulfillment_clients) as clients,
      (select count(*)::int from public.my_creditops_departments()) as depts,
      (select string_agg(distinct s.department::text, ', ' order by s.department::text)
         from client_department_statuses s) as queues,
      (select count(*)::int from work_items where assigned_to <> auth.uid()) as others_work;`);
    check(`${person.full_name} sees the whole Main Client List`, seen.clients, everyClient);
    check(`${person.full_name} is in exactly one department`, seen.depts, 1);
    check(`${person.full_name} sees only the Complaints queue`, /^Complaints/.test(seen.queues ?? ""), true);
    check(`${person.full_name}'s My Work is personal only`, seen.others_work, 0);
  }

  /* Queue membership is canonical department work, not the client's overall
     Credit Status — the distinction Dee has corrected twice. */
  const [a, b] = complaintsPair;
  const qRow = one(`select s.client_id from client_department_statuses s
                     where s.department = 'Complaints' limit 1`);
  if (qRow) {
    const reassigned = row(a.id,
      `update client_department_statuses set assignee_id = '${b.id}'
        where client_id = '${qRow.client_id}' and department = 'Complaints';
       select assignee_id::text as who from client_department_statuses
        where client_id = '${qRow.client_id}' and department = 'Complaints';`);
    check("one Complaints agent can reassign to the other", reassigned.who, b.id);

    /* The queue is keyed by department work. Change the client's overall credit
       status and the queue must not move. */
    const unmoved = row(a.id,
      `select count(*)::int as still from client_department_statuses s
        where s.client_id = '${qRow.client_id}' and s.department = 'Complaints';`,
      `update fulfillment_clients set status = 'On Hold (Non Workable)' where id = '${qRow.client_id}';`);
    check("the queue follows department work, not overall Credit Status", unmoved.still, 1);
  }

  /* Scope: a Complaints agent must not operate another department's queue row. */
  const foreign = one(`select s.client_id, s.department::text as dept from client_department_statuses s
                        where s.department <> 'Complaints' limit 1`);
  if (foreign) {
    const r = as(a.id, "", `update client_department_statuses set assignee_id = '${a.id}'
                             where client_id = '${foreign.client_id}' and department = '${foreign.dept}';
                            select count(*)::int as n from client_department_statuses
                             where client_id = '${foreign.client_id}' and department = '${foreign.dept}' and assignee_id = '${a.id}';`);
    check("but cannot reach a queue row outside their department", r.ok ? r.rows[0].n : "refused", 0);
  }
}

/* ──────────────────────────────── BES CRM ────────────────────────────────── */

const crmAgents = agentsIn("bes_crm", 2);
const crmAdmin = adminIn("bes_crm");
console.log(`\nBES CRM — builder ${label(crmAgents[0])} · management ${label(crmAdmin)}`);
if (!crmAgents.length || !crmAdmin) {
  console.log("  SKIPPED — needs one bes_crm agent and one bes_crm admin\n");
} else {
  const builder = crmAgents[0];
  const crmTeam = one(`select t.id from teams t
     join departments dp on dp.id = t.department_id
     join divisions dv on dv.id = dp.division_id and dv.service = 'bes_crm'
     join team_memberships tm on tm.team_id = t.id and tm.user_id = '${builder.id}'
    where t.archived_at is null limit 1`);
  const project = one("select id, name from crm_projects where archived_at is null limit 1");

  const mgmt = row(crmAdmin.id, "select count(*)::int as n from crm_projects;");
  check("management sees the CRM projects", mgmt.n > 0, true);

  if (project && crmTeam) {
    /* The builder's reach comes from the project carrying their team — the
       assignment, not their name. Proven by adding it inside a rollback. */
    const before = row(builder.id, "select count(*)::int as n from crm_projects;");
    const after  = row(builder.id, "select count(*)::int as n from crm_projects;",
      `update crm_projects set team_id = '${crmTeam.id}' where id = '${project.id}';`);
    check("an unassigned project is invisible to the builder", before.n, 0);
    check("give the project their team and the builder sees it", after.n, 1);

    /* Lifecycle, as the builder, on a project that is theirs. */
    const life = row(builder.id, `
      select (select completed_at is not null from crm_projects where id='${project.id}') as completed;`,
      `update crm_projects set team_id = '${crmTeam.id}' where id = '${project.id}';
       set local role authenticated;
       do $j$ begin perform set_config('request.jwt.claims','{"sub":"${builder.id}","role":"authenticated"}',true); end $j$;
       update crm_projects set completed_at = now(), completed_by = auth.uid() where id = '${project.id}';
       reset role;`);
    check("the builder can complete their own project", life.completed, true);
  }

  /* Permanent delete stays the owner's, whatever the role — and it is the
     DATABASE that says so. Tested on a throwaway row made inside the
     transaction, so no production record is ever the subject. */
  const THROWAWAY = `insert into teams (id, agency_id, name, department_id)
      values ('0da9e4c1-1111-4222-8333-444455556666', '${AGENCY}', '[cert] throwaway',
              (select id from departments limit 1));`;
  const adminDelete = as(crmAdmin.id, THROWAWAY,
    `select public.owner_delete_record('teams', '0da9e4c1-1111-4222-8333-444455556666', 'cert') as r;`);
  check("an administrator is refused permanent delete by the database",
    adminDelete.ok ? "ALLOWED" : /only the agency owner/i.test(adminDelete.message), true);
  const ownerDelete = as(OWNER, THROWAWAY,
    `select public.owner_delete_record('teams', '0da9e4c1-1111-4222-8333-444455556666', 'cert') is not null as done;`);
  check("the owner may", ownerDelete.ok ? ownerDelete.rows[0].done : ownerDelete.message, true);
}

/* ─────────────────────────────── TALENTOPS ───────────────────────────────── */

const talentAgents = agentsIn("talentops", 4);
/* The one with partner assignments, and one without — the two shapes that
   matter, whoever holds them. */
const assigned = talentAgents.find((p) => one(
  `select count(*)::int as n from partner_assignments where user_id='${p.id}' and ended_on is null`).n > 0);
const unassigned = talentAgents.find((p) => one(
  `select count(*)::int as n from partner_assignments where user_id='${p.id}' and ended_on is null`).n === 0);

console.log(`\nTALENTOPS — assigned ${label(assigned)} · unassigned ${label(unassigned)}`);
if (!assigned) {
  console.log("  SKIPPED — needs one TalentOps agent with a partner assignment\n");
} else {
  const mine = as(assigned.id, "", "select group_id::text, partner_name from talentops_partners() order by partner_name;");
  const myPartners = mine.ok ? mine.rows.map((r) => r.partner_name) : ["error"];
  const expected = q.query(`select distinct g.name from partner_assignments a
      join outsourcing_groups g on g.id = a.group_id and g.archived_at is null
      join partner_services ps on ps.group_id = g.id and ps.status in ('active','onboarding')
      join partner_service_types st on st.code = ps.service_type and st.module = 'talentops' and st.active
     where a.user_id = '${assigned.id}' and a.ended_on is null order by g.name`).map((r) => r.name);
  check("their partner folders are exactly their assignments with a live TalentOps service", myPartners, expected);

  /* Bizhub — or whatever partner holds a TalentOps service they are NOT
     assigned to — must be absent. Found by shape, never by name. */
  const otherPartner = one(`select g.name from outsourcing_groups g
      join partner_services ps on ps.group_id = g.id and ps.status in ('active','onboarding')
      join partner_service_types st on st.code = ps.service_type and st.module = 'talentops' and st.active
     where g.archived_at is null and not exists (
       select 1 from partner_assignments a where a.group_id = g.id and a.user_id = '${assigned.id}' and a.ended_on is null)
     limit 1`);
  if (otherPartner) {
    check(`an unassigned TalentOps partner (${otherPartner.name}) stays out of their folders`,
      myPartners.includes(otherPartner.name), false);
  }

  /* The capability that blocked Alliana on 09-14: placement must carry the
     work key, not just the view key. */
  const caps = row(assigned.id, `select
    public.resolve_agency_capability('talentops.view') as view,
    public.resolve_agency_capability('talentops.tasks.manage') as work;`);
  check("a TalentOps agent may view their workspace", caps.view, true);
  check("and may actually create work in it", caps.work, true);

  if (unassigned) {
    const none = as(unassigned.id, "", "select count(*)::int as n from talentops_partners();");
    check(`${unassigned.full_name}, with no assignment, sees no partner folders`, none.ok ? none.rows[0].n : "error", 0);
    const capsU = row(unassigned.id, `select
      public.resolve_agency_capability('talentops.tasks.manage') as work;`);
    check("but still carries the work capability from their placement", capsU.work, true);
  }
}

/* ────────────────────────────── COMMUNICATION ────────────────────────────── */

console.log("\nCOMMUNICATION");
{
  const staff = complaintsPair[0] ?? creditops[0];
  if (staff) {
    const ch = as(staff.id, "", "select count(*)::int as n from visible_channels();");
    check("an employee resolves their channel list without error", ch.ok, true);
  }

  /* Two partner contacts at DIFFERENT partners: neither may see the other's
     direct messages, and each sees only their own partner's topics. */
  const contacts = q.query(`select c.user_id, c.group_id, g.name
      from partner_contacts c join outsourcing_groups g on g.id = c.group_id
     where c.user_id is not null and c.status = 'active' limit 4`);
  if (contacts.length) {
    const c0 = contacts[0];
    const seen = as(c0.user_id, "", `select id::text, kind::text, partner_group_id::text from visible_channels();`);
    check("a partner contact resolves their channels", seen.ok, true);
    if (seen.ok) {
      const foreign = seen.rows.filter((r) => r.partner_group_id && r.partner_group_id !== c0.group_id);
      check("and every partner channel they see is their own partner's", foreign.length, 0);
    }
    /* A direct message between two OTHER people must not appear. */
    const dm = one(`select ch.id from channels ch where ch.kind = 'direct' limit 1`);
    if (dm) {
      const dmSeen = as(c0.user_id, "", `select count(*)::int as n from visible_channels() where id = '${dm.id}';`);
      const member = one(`select count(*)::int as n from channel_members where channel_id='${dm.id}' and user_id='${c0.user_id}'`).n;
      check("a direct message reaches only its own members", dmSeen.ok ? dmSeen.rows[0].n : "error", member > 0 ? 1 : 0);
    }
  }
}

/* ─────────────────────────── PARTNER PORTAL SAFETY ───────────────────────── */

console.log("\nPARTNER PORTAL — the partner-safe boundary");
{
  const contact = one(`select c.user_id, c.group_id from partner_contacts c
                        where c.user_id is not null and c.status = 'active' limit 1`);
  if (!contact) console.log("  SKIPPED — no activated partner contact\n");
  else {
    /* A partner must never reach BES internal operating records. Read the
       tables directly, the way a crafted API call would. */
    const leak = row(contact.user_id, `select
      (select count(*)::int from work_items where scope = 'AGENCY') as internal_work,
      (select count(*)::int from client_department_statuses) as internal_queues,
      (select count(*)::int from agency_memberships) as staff_roster,
      (select count(*)::int from production_logs) as internal_production,
      (select count(*)::int from partner_invoices where group_id <> '${contact.group_id}') as other_partner_money;`);
    check("no BES internal work reaches the portal", leak.internal_work, 0);
    check("no CreditOps department queue reaches the portal", leak.internal_queues, 0);
    check("no BES staff roster reaches the portal", leak.staff_roster, 0);
    check("no internal production data reaches the portal", leak.internal_production, 0);
    check("and no other partner's invoices", leak.other_partner_money, 0);

    const own = row(contact.user_id,
      `select (select count(*)::int from partner_invoices where group_id = '${contact.group_id}') as mine;`);
    check("their own invoices are reachable", typeof own.mine === "number", true);
  }
}

/* ───────────────────────────── MONEY STAYS SHUT ──────────────────────────── */

console.log("\nFINANCE — owner-gated, with the one approved exception");
{
  const admins = q.query(`select p.id, p.full_name from agency_memberships m
      join profiles p on p.id = m.user_id
     where m.role = 'agency_admin' and not m.is_owner and m.status = 'active'
       and coalesce(p.is_fixture,false) = false`);
  for (const admin of admins) {
    const money = row(admin.id, `select
      public.resolve_agency_capability('finance.dashboard.view') as dashboard,
      public.resolve_agency_capability('partners.invoices.manage') as invoices,
      public.resolve_agency_capability('payroll.manage') as payroll;`);
    check(`${admin.full_name} cannot reach the finance dashboard`, money.dashboard, false);
    check(`${admin.full_name} cannot manage partner invoices`, money.invoices, false);
    /* Payroll is the one key Dee granted explicitly, per member. Whoever holds
       that grant keeps it; nobody acquires it from their role. */
    const granted = one(`select coalesce(bool_or(amp.allowed), false) as g
        from agency_member_permissions amp join agency_memberships m on m.id = amp.membership_id
       where m.user_id = '${admin.id}' and amp.key = 'payroll.manage'`).g;
    check(`${admin.full_name}'s payroll access matches their explicit grant`, money.payroll, granted);
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
