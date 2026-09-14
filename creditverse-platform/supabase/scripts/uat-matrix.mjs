/**
 * What every real employee can actually reach, right now.
 *
 * Dee, 2026-09-13, on activation: *"Re-run the real-user authorization matrix
 * after meaningful acceptance batches… The most valuable test now is Daniel,
 * Allyssa, James, Alliana actually logging in and trying to do their jobs."*
 *
 * So this is a REPORT, not a probe. It asserts nothing and expects nothing —
 * it reads what the database grants each person and prints it beside their
 * placement, so a wrong answer is obvious and its cause is on the same line.
 *
 * There are no names in it. Everybody with an active agency membership is
 * measured, so it covers whoever has accepted by the time it runs.
 *
 * Every read runs as that REAL authenticated user inside a transaction that is
 * rolled back. Nothing is changed by running it.
 *
 * Run: node supabase/scripts/uat-matrix.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

const people = q.query(`
  select p.id, coalesce(nullif(trim(p.full_name),''), p.email::text) as name,
         m.role::text as role, m.is_owner
    from public.profiles p
    join public.agency_memberships m on m.user_id = p.id
   where coalesce(p.is_fixture, false) = false and m.status = 'active'
   order by m.is_owner desc, m.role, name`);

const placement = (id) => ({
  divisions: q.query(`select distinct dv.service::text as s from public.team_memberships tm
      join public.teams t on t.id = tm.team_id and t.archived_at is null
      join public.departments dp on dp.id = t.department_id
      join public.divisions dv on dv.id = dp.division_id
     where tm.user_id = '${id}' order by 1`).map((r) => r.s),
  departments: q.query(`select distinct dp.name from public.team_memberships tm
      join public.teams t on t.id = tm.team_id and t.archived_at is null
      join public.departments dp on dp.id = t.department_id
     where tm.user_id = '${id}' order by 1`).map((r) => r.name),
  teams: q.query(`select t.name, tm.is_lead from public.team_memberships tm
      join public.teams t on t.id = tm.team_id and t.archived_at is null
     where tm.user_id = '${id}' order by t.name`)
    .map((r) => r.is_lead ? `${r.name} (LEAD)` : r.name),
  partners: q.query(`select distinct g.name from public.partner_assignments a
      join public.outsourcing_groups g on g.id = a.group_id
     where a.user_id = '${id}' and a.ended_on is null order by 1`).map((r) => r.name),
});

/** What the database actually grants, asked as them. */
const reach = (id) => {
  try {
    return q.query(`begin; set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${id}","role":"authenticated"}', true); end $c$;
      select
        (select count(*)::int from public.fulfillment_clients)          as clients,
        (select count(*)::int from public.client_department_statuses)   as queue,
        (select string_agg(distinct department::text, ', ' order by department::text)
           from public.client_department_statuses)                      as queue_departments,
        (select count(*)::int from public.work_items)                   as work,
        (select count(*)::int from public.work_items where assigned_to = auth.uid()) as my_work,
        (select count(*)::int from public.funding_clients)              as funding,
        (select count(*)::int from public.crm_projects)                 as crm,
        (select count(*)::int from public.workspaces where module = 'talentops')      as talentops_ws,
        (select count(*)::int from public.workspaces where module = 'sales_marketing') as marketing_ws,
        public.agency_can('creditops.clients.view')   as cap_creditops,
        public.agency_can('talentops.view')           as cap_talentops,
        public.agency_can('crm.projects.view')        as cap_crm,
        public.agency_can('marketing.workspace.view') as cap_marketing,
        public.agency_can('ops.manage')               as cap_manage,
        public.agency_can('partners.invoices.view')   as m_invoices,
        public.agency_can('partners.payments.record') as m_payments,
        public.agency_can('expenses.view')            as m_expenses,
        public.agency_can('finance.dashboard.view')   as m_findash,
        public.agency_can('payroll.view')             as m_payroll;
      rollback`)[0];
  } catch (e) {
    try { q.query("rollback;"); } catch { /* gone */ }
    return { error: String(e.message).slice(0, 60) };
  }
};

console.log(`\nUAT authorization matrix — ${people.length} active people, ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z\n`);

const moneyHolders = [];
for (const u of people) {
  const p = placement(u.id);
  const r = reach(u.id);
  const tag = u.is_owner ? "OWNER" : u.role === "agency_admin" ? "ADMIN" : "USER";

  console.log(`  ${u.name}  [${tag}]`);
  console.log(`     division    ${p.divisions.join(", ") || "—"}`);
  console.log(`     department  ${p.departments.join(", ") || "—"}`);
  console.log(`     team        ${p.teams.join(", ") || "—"}`);
  console.log(`     partners    ${p.partners.join(", ") || "—"}`);
  if (r.error) { console.log(`     ERROR       ${r.error}\n`); continue; }
  console.log(`     reaches     clients ${r.clients} · queue ${r.queue}${r.queue_departments ? ` (${r.queue_departments})` : ""} · work ${r.work} · mine ${r.my_work}`);
  console.log(`                 funding ${r.funding} · crm ${r.crm} · talentops ws ${r.talentops_ws} · marketing ws ${r.marketing_ws}`);
  const caps = [
    r.cap_creditops && "creditops", r.cap_talentops && "talentops", r.cap_crm && "crm",
    r.cap_marketing && "marketing", r.cap_manage && "ops.manage",
  ].filter(Boolean);
  console.log(`     may         ${caps.join(" · ") || "—"}`);
  /* Named individually. "Financial access: granted" is the kind of summary
     that reads as an alarm when the truth is one explicit, intended grant. */
  const held = [
    r.m_invoices && "partner invoices", r.m_payments && "record payments",
    r.m_expenses && "expenses", r.m_findash && "finance dashboard",
    r.m_payroll && "payroll",
  ].filter(Boolean);
  if (held.length === 0) {
    console.log("     money       denied");
  } else {
    /* Owner-gated keys reach a non-owner ONLY through an explicit per-member
       grant, so showing the source is what separates "as designed" from
       "how did that happen". */
    const explicit = q.query(`select amp.key from public.agency_member_permissions amp
        join public.agency_memberships m on m.id = amp.membership_id
       where m.user_id = '${u.id}' and amp.allowed
         and amp.key in ('partners.invoices.view','partners.payments.record',
                         'expenses.view','finance.dashboard.view','payroll.view','payroll.manage')
       order by 1`).map((x) => x.key);
    const via = u.is_owner ? "owner" : explicit.length ? `explicit grant: ${explicit.join(", ")}` : "NO EXPLICIT GRANT — investigate";
    console.log(`     money       ${held.join(", ")}   [${via}]`);
    moneyHolders.push(`${u.name} (${tag}) — ${held.join(", ")}`);
  }
  console.log();
}

/* The money boundary is the one line worth restating every run: the Owner has
   it, and anybody else only by an explicit Owner grant. Admin alone is not
   financial access, and a surprise here is the most expensive kind. */
console.log("  Financial access");
if (!moneyHolders.length) console.log("    nobody");
for (const m of moneyHolders) console.log(`    ${m}`);

const empty = q.query(`
  select t.name from public.teams t
   where t.archived_at is null and coalesce(t.is_fixture, false) = false
     and not exists (select 1 from public.team_memberships m where m.team_id = t.id)
   order by 1`);
if (empty.length) {
  /* Bureau Calling and Onboarding are intentionally unstaffed (Dee,
     2026-09-13). Listed, never "fixed" by assigning somebody at random. */
  console.log(`  Teams with nobody on them: ${empty.map((t) => t.name).join(", ")}`);
}
console.log();
