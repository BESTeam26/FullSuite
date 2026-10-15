/**
 * Dee, 2026-10-15: "All support sent them to Kaori for now. Everyone
 * reports to Dee for now. We removed all other team as we have slow season."
 * Then: "All dispute sent to Dan and Daniel. All complaints sent to Ivan."
 *
 * So:
 *   1. The Support department assigns automatically (it was team-lead mode,
 *      which opened every Support file unassigned for a lead to hand out).
 *      Kaori is the only active non-lead member of Client Success / Support,
 *      so the picker lands on her.
 *   2. Danicko and Daniel are members, not leads: Dee leads every CreditOps
 *      team already, and a second lead on the same team routes a person's
 *      EOD sideways instead of to Dee. Daniel's two department-manager seats
 *      end today (history kept) for the same reason.
 *   3. Every Support file left unassigned by the old mode is routed again
 *      through the one engine, which now assigns it.
 *
 * One transaction. Dry run by default; `--commit` makes it real.
 */
import { createSyncQuery, readProjectRef, readAccessToken } from "./lib/sync-query.mjs";

const { query: q, close } = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });
const COMMIT = process.argv.includes("--commit");
const dee = q(`select id from public.profiles where email = 'dee@blessedempireservices.com'`)[0].id;
const people = Object.fromEntries(q(`select full_name, id from public.profiles where full_name in ('Danicko Carl P. Macasiab','Daniel Charles P. Macasiab','Naima Kaori A. Gallardo')`).map((r) => [r.full_name.split(" ")[0], r.id]));

const sql = `begin;
  set local role postgres;
  update public.departments set assignment_mode = 'auto_equal'
   where division = 'creditops' and key = 'support' and archived_at is null;
  update public.team_memberships set is_lead = false
   where user_id in ('${people.Danicko}', '${people.Daniel}') and is_lead;
  -- seat_is_live reads effective_to >= today as still live, so ended seats end yesterday
  update public.management_seats set effective_to = current_date - 1
   where user_id = '${people.Daniel}' and seat = 'department_manager' and effective_to is null;
  -- Bryan: Dee says he is deactivated; the database still had him active
  set local role authenticated; set local request.jwt.claims = '{"sub":"${dee}","role":"authenticated"}';
  select public.set_agency_member_status((select id from public.agency_memberships where user_id = (select id from public.profiles where full_name = 'Bryan Breva')), 'inactive');
  set local role postgres;
  -- "everyone reports to Dee": a seat held by somebody no longer active routes nobody's report anywhere
  update public.management_seats s set effective_to = current_date - 1
    from public.agency_memberships m
   where m.user_id = s.user_id and m.status <> 'active' and s.effective_to is null;
  -- the two clients Add Client put on the Admin Team today: no team, like the other 1,451
  update public.fulfillment_clients set team_id = null
   where id in ('d5ca5628-12ab-405e-9799-997f25bde85e', 'af13aa4c-6a92-496a-a21a-89c263b63e14');
  -- re-route every actionable Support / Dispute / Complaints file left unassigned, as Dee
  -- (the engine is internal — not callable by a signed-in user — so it runs here with Dee's claims)
  select set_config('request.jwt.claims', '{"sub":"${dee}","role":"authenticated"}', true);
  select count(*) as rerouted from (
    select public.creditops_route_client(c.id, null)
      from public.fulfillment_clients c
      join public.creditops_status_routing r on r.status = c.status and r.kind = 'actionable'
       and r.department in ('Support', 'Dispute', 'Complaints')
      join public.client_department_statuses s on s.client_id = c.id and s.department = r.department and s.assignee_id is null
       and public.creditops_status_is_actionable(s.department, s.status)
     where c.archived_at is null and coalesce(c.lifecycle, 'active') = 'active' and not coalesce(c.is_fixture, false)) x;
  select 'support mode' as what, assignment_mode as value from public.departments where key = 'support' and division = 'creditops'
  union all select 'leads on CreditOps teams', string_agg(distinct p.full_name, ', ')
    from public.team_memberships tm join public.profiles p on p.id = tm.user_id join public.teams t on t.id = tm.team_id
   where tm.is_lead and t.archived_at is null and t.name like 'CreditOps%'
  union all select 'Daniel live seats', count(*)::text from public.management_seats where user_id = '${people.Daniel}' and effective_to is null
  union all select 'live seats held by inactive people', count(*)::text from public.management_seats s join public.agency_memberships m on m.user_id = s.user_id where m.status <> 'active' and public.seat_is_live(s.effective_from, s.effective_to)
  union all select 'Bryan', m.status from public.agency_memberships m join public.profiles p on p.id = m.user_id where p.full_name = 'Bryan Breva'
  union all select 'clients on Admin Team', count(*)::text from public.fulfillment_clients where team_id = '185bd34f-6d6c-4571-a48b-b149bef58308' and archived_at is null
  union all select 'Support files now with Kaori', count(*)::text from public.client_department_statuses s
   where s.department = 'Support' and s.assignee_id = '${people.Naima}' and public.creditops_status_is_actionable(s.department, s.status)
  union all select 'Dispute files with Danicko / Daniel', (select count(*) filter (where s.assignee_id = '${people.Danicko}') || ' / ' || count(*) filter (where s.assignee_id = '${people.Daniel}')
    from public.client_department_statuses s where s.department = 'Dispute' and public.creditops_status_is_actionable(s.department, s.status))
  union all select 'Complaints files with Ivan', count(*)::text from public.client_department_statuses s
   where s.department = 'Complaints' and s.assignee_id = (select id from public.profiles where full_name like 'Ivan L.%') and public.creditops_status_is_actionable(s.department, s.status)
  union all select 'Dispute/Complaints still unassigned', count(*)::text from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id and c.archived_at is null and not coalesce(c.is_fixture, false)
   where s.department in ('Dispute','Complaints') and s.assignee_id is null and public.creditops_status_is_actionable(s.department, s.status)
  union all select 'Support files still unassigned', count(*)::text from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id and c.archived_at is null and not coalesce(c.is_fixture, false)
   where s.department = 'Support' and s.assignee_id is null and public.creditops_status_is_actionable(s.department, s.status)
  union all select 'Danicko EOD goes to', (select coalesce(p.full_name, r.reason) from public.eod_route_up_for('${people.Danicko}') r left join public.profiles p on p.id = r.lead_id limit 1)
  union all select 'Daniel EOD goes to', (select coalesce(p.full_name, r.reason) from public.eod_route_up_for('${people.Daniel}') r left join public.profiles p on p.id = r.lead_id limit 1)
  union all select 'Kaori EOD goes to', (select coalesce(p.full_name, r.reason) from public.eod_route_up_for('${people.Naima}') r left join public.profiles p on p.id = r.lead_id limit 1);
  ${COMMIT ? "commit;" : "rollback;"}`;

console.log(COMMIT ? "COMMITTED" : "DRY RUN (rolled back)");
for (const r of q(sql)) console.log(JSON.stringify(r));
close();
