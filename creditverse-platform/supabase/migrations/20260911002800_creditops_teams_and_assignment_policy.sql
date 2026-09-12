-- =============================================================================
-- One Support department, five real CreditOps teams, and an assignment policy
-- that lives on the department rather than in React.
--
-- Dee, 2026-09-11: "Client Success and Support are the same operational
-- department for CreditOps… Do not create duplicate Support workstreams…
-- The operational name I want in the UI is: Client Success / Support."
--
-- ── WHICH ROW WAS ALREADY AUTHORITATIVE ─────────────────────────────────────
--
-- Inspected before touching anything. `support` wins on every count that
-- matters to the work model:
--
--   client_department_statuses   3 rows on 'Support', 0 on Client Success
--   production_logs              2 rows on 'Support'
--   sla_policies                 1 policy on 'Support'
--   teams                        1 team pointing at `support`
--   positions                    4 job titles pointing at `client_success`
--
-- So `support` becomes the one CreditOps work department and takes the
-- operational name; `client_success` was only ever an HR label, and its four
-- positions move across before it is retired.
--
-- ── ARCHIVED, NOT DELETED ───────────────────────────────────────────────────
--
-- The redundant row is archived. It disappears from every picker and every
-- list — which is what Dee asked for, no duplicate department in the UI — and
-- any historical reference still resolves to a real row instead of a dangling
-- id (rule 11: archive/void over delete where history matters). Deleting it
-- would buy nothing and cannot be undone.
--
-- The `fulfillment_department` ENUM label stays 'Support'. It is written into
-- three tables of live operational rows; renaming an enum label that data is
-- filed under is a rewrite of history for a display string. The UI name comes
-- from the department row, which is exactly what a department row is for.
-- =============================================================================

-- ── 1. Move what pointed at the duplicate ───────────────────────────────────
update public.positions p
   set department_id = (select id from public.departments where key = 'support' and division = 'creditops')
 where p.department_id = (select id from public.departments where key = 'client_success' and division = 'creditops');

update public.teams t
   set department_id = (select id from public.departments where key = 'support' and division = 'creditops')
 where t.department_id = (select id from public.departments where key = 'client_success' and division = 'creditops');

update public.channels c
   set department_id = (select id from public.departments where key = 'support' and division = 'creditops')
 where c.department_id = (select id from public.departments where key = 'client_success' and division = 'creditops');

update public.announcements a
   set department_id = (select id from public.departments where key = 'support' and division = 'creditops')
 where a.department_id = (select id from public.departments where key = 'client_success' and division = 'creditops');

-- ── 2. One department, under the name Dee uses out loud ─────────────────────
update public.departments
   set name = 'Client Success / Support'
 where key = 'support' and division = 'creditops';

update public.departments
   set archived_at = now()
 where key = 'client_success' and division = 'creditops' and archived_at is null;

-- ── 3. The assignment policy, as a property of the department ───────────────
/**
 * How a department chooses the individual who owns an actionable file.
 *
 * Dee: "Make this policy configurable rather than scattering special-case
 * code throughout the application." So it is a column on the canonical
 * department row — one place the engine reads, and one place to change when
 * Support ever stops being the exception.
 *
 *   auto_equal  the eligible active team member with the fewest ACTIVE
 *               ACTIONABLE files, ties broken deterministically
 *   team_lead   the department owns the work; the individual stays unassigned
 *               until the Team Lead assigns it
 */
alter table public.departments
  add column if not exists assignment_mode text not null default 'auto_equal'
  check (assignment_mode in ('auto_equal', 'team_lead'));

comment on column public.departments.assignment_mode is
  'How the routing engine picks an individual for actionable work in this department. auto_equal: fewest active actionable files among eligible active team members. team_lead: department assigned, individual left unassigned for the Team Lead (Dee, 2026-09-11 — Client Success / Support is client-facing and stays deliberate).';

update public.departments set assignment_mode = 'team_lead'
 where division = 'creditops' and key = 'support';
update public.departments set assignment_mode = 'auto_equal'
 where division = 'creditops' and key in ('onboarding', 'dispute', 'complaints', 'bureau_calling');

-- ── 4. The five real teams ──────────────────────────────────────────────────
/**
 * Created empty, on purpose. Dee: "Do NOT invent members. I will add Team
 * Leads and Team Members myself through the Teams UI."
 *
 * Inventing a membership would attribute real client work to somebody who was
 * never asked to do it (rule 4), and the engine is built to behave correctly
 * with an empty team — the work stays Assignment Required rather than landing
 * on whoever happened to be first in the table.
 *
 * Matched on (agency, department, name) so a re-run adopts the existing row
 * rather than creating a second team for the same department.
 */
insert into public.teams (agency_id, department_id, name, description, sort)
select a.id, d.id, v.team_name,
       'CreditOps ' || d.name || ' — routing and automatic assignment read this team''s membership.',
       v.sort
  from public.agencies a
  cross join (values
    ('onboarding',     'CreditOps Onboarding Team',              10),
    ('dispute',        'CreditOps Dispute Processing Team',      20),
    ('support',        'CreditOps Client Success / Support Team',30),
    ('complaints',     'CreditOps Complaints & Mailing Team',    40),
    ('bureau_calling', 'CreditOps Bureau Calling Team',          50)
  ) as v(dept_key, team_name, sort)
  join public.departments d
    on d.key = v.dept_key and d.division = 'creditops' and d.archived_at is null
 where not exists (
   select 1 from public.teams t
    where t.agency_id = a.id and t.department_id = d.id and t.name = v.team_name
 );
