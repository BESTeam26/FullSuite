-- 0210 — The organization Dee described, as seats rather than as names.
--
-- ---------------------------------------------------------------------------
-- WHY EVERY SEAT BELOW IS VACANT
--
-- Dee named the team in §12–§14: Daniel, Dan, Julius, Alvaro, Ally, Rowell,
-- Laz, Angelo. NONE of them exists as a profile — the only real accounts are
-- Dee, Dian and Aaron. Only first names were given, and no email addresses.
--
-- §85 is unambiguous: "When real BES People are added: use verified real
-- employee email only. If missing: mark INVITE EMAIL REQUIRED. Do not invent
-- an email."
--
-- So this creates the STRUCTURE and leaves the seats vacant, which is exactly
-- what §7 says a vacancy is for. Each one records the intended occupant's
-- first name in its description — a note for Dee to match against, not an
-- identity link, because §5 says a person's identity is never stored in the
-- position. When Dee supplies a verified email, the person is invited and
-- assigned to the seat that is already waiting for them, and nothing here
-- changes.
--
-- The two seats that ARE filled are Dee's own, and they are §8's worked
-- example rather than my invention: CEO held permanently by Dee, CFO
-- permanently VACANT with Dee acting in it. When a CFO is hired the acting
-- coverage ends and Dee stays CEO — no restructuring.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT SET
--
-- Reporting lines are wired only where Dee's own text states them — §9's
-- "Junior Processor reports to Processing Team Lead", and CFO reporting to
-- CEO. Every other `reports_to_position_id` is left NULL rather than invented,
-- because a made-up hierarchy is harder to notice and correct than a missing
-- one. Agency Settings → Organization Structure sets them (§15).
-- ---------------------------------------------------------------------------

-- ── Departments Dee named that did not exist ────────────────────────────
insert into public.departments (agency_id, division, division_id, key, name, sort)
select v.agency_id, v.service, v.id, x.key, x.name, x.sort
  from public.divisions v,
       (values ('client_success', 'Client Success', 40)) as x(key, name, sort)
 where v.service = 'creditops'
   and not exists (select 1 from public.departments d
                    where d.division_id = v.id and d.key = x.key);

insert into public.departments (agency_id, division, division_id, key, name, sort)
select v.agency_id, v.service, v.id, x.key, x.name, x.sort
  from public.divisions v,
       (values ('dedicated_support', 'Dedicated Support', 5),
               ('sales',             'Sales', 6),
               ('appointment_setting','Appointment Setting', 7)) as x(key, name, sort)
 where v.service = 'talentops'
   and not exists (select 1 from public.departments d
                    where d.division_id = v.id and d.key = x.key);

/* Dee's own wording for two that exist under shorter names. The `key` and the
   `division` enum — the parts anything reads — are untouched. */
update public.departments d set name = 'Complaints & Mailing'
 where d.key = 'complaints' and d.name = 'Complaints';
update public.departments d set name = 'Training & Development'
 where d.key = 'training' and d.name = 'Training';

-- ── The seats ───────────────────────────────────────────────────────────
--
-- Idempotent on (agency, division, department, title), which is the unique
-- index, so re-running this migration creates nothing.
do $$
declare
  v_agency uuid;
  v_leadership uuid;
  v_ceo uuid;
  r record;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  if v_agency is null then return; end if;

  select id into v_leadership from public.divisions
   where agency_id = v_agency and tier = 'leadership' limit 1;

  /* ── Company Leadership (§4, §8) ─────────────────────────────────── */
  insert into public.positions (agency_id, division_id, title, description, sort)
  values (v_agency, v_leadership, 'Chief Executive Officer', 'Owner and chief executive.', 10)
  on conflict do nothing;

  select id into v_ceo from public.positions
   where agency_id = v_agency and title = 'Chief Executive Officer' limit 1;

  insert into public.positions (agency_id, division_id, title, description, reports_to_position_id, sort)
  values (v_agency, v_leadership, 'Chief Financial Officer',
          'Vacant. Covered by the CEO until filled.', v_ceo, 20)
  on conflict do nothing;

  /* Dee holds CEO permanently and covers CFO — §8's example, with Dee's own
     real account and no invented person anywhere. */
  insert into public.position_assignments (agency_id, position_id, user_id, assignment_type, note)
  select v_agency, p.id, pr.id, 'permanent', 'Owner.'
    from public.positions p, public.profiles pr
   where p.agency_id = v_agency and p.title = 'Chief Executive Officer'
     and pr.email = 'dee@blessedempireservices.com'
  on conflict do nothing;

  insert into public.position_assignments (agency_id, position_id, user_id, assignment_type, note)
  select v_agency, p.id, pr.id, 'acting', 'Acting until a CFO is appointed.'
    from public.positions p, public.profiles pr
   where p.agency_id = v_agency and p.title = 'Chief Financial Officer'
     and pr.email = 'dee@blessedempireservices.com'
  on conflict do nothing;

  /* ── Everything else, from Dee's §12–§14 ─────────────────────────── */
  for r in
    select * from (values
      -- department key,        team name,      title,                                headcount, sort, intended
      ('dispute',            'Team Daniel',  'Processing Team Lead',                  1, 10, 'Daniel'),
      ('dispute',            'Team Daniel',  'Lead Processor',                        1, 20, 'Dan'),
      ('dispute',            'Team Daniel',  'Junior Processor',                      2, 30, 'Julius and Alvaro'),
      ('complaints',         null,           'Complaints & Mailing Specialist',       1, 10, null),
      ('bureau_calling',     null,           'Bureau Calling Specialist',             1, 10, null),
      ('client_success',     'Team Ally',    'Client Success Lead',                   1, 10, 'Ally'),
      ('client_success',     null,           'Onboarding Specialist',                 1, 20, null),
      ('client_success',     null,           'Client Support Specialist',             1, 30, null),
      ('client_success',     null,           'Credit Updates Specialist',             1, 40, null),
      ('dedicated_support',  null,           'Dedicated Support Agent',               1, 10, null),
      ('sales',              null,           'Sales Representative',                  1, 10, null),
      ('appointment_setting',null,           'Appointment Setter',                    1, 10, null),
      ('recruitment',        null,           'Recruiter',                             1, 10, null),
      ('training',           null,           'Training Specialist',                   1, 10, null),
      ('staff_management',   'Team Leads',   'Staff Manager',                         1, 10, null),
      ('ghl_crm_ops',        null,           'Operations Manager / Team Lead',        1, 10, 'Rowell'),
      ('ghl_crm_ops',        null,           'Automation & Workflow Specialist',      1, 20, 'Laz'),
      ('websites_funnels',   null,           'Website & Funnel Specialist',           1, 10, 'Angelo'),
      ('crm_support',        null,           'CRM Support Specialist',                1, 10, null)
    ) as x(dept_key, team_name, title, headcount, sort, intended)
  loop
    insert into public.positions
      (agency_id, division_id, department_id, team_id, title, description, headcount, sort)
    select v_agency, d.division_id, d.id,
           (select t.id from public.teams t
             where t.agency_id = v_agency and t.name = r.team_name and t.archived_at is null),
           r.title,
           case when r.intended is null then null
                else 'Intended for ' || r.intended || ' — INVITE EMAIL REQUIRED.' end,
           r.headcount, r.sort
      from public.departments d
     where d.agency_id = v_agency and d.key = r.dept_key and d.archived_at is null
    on conflict do nothing;
  end loop;

  /* §9's stated line, and only that one. */
  update public.positions p
     set reports_to_position_id = (select l.id from public.positions l
                                    where l.agency_id = v_agency and l.title = 'Processing Team Lead')
   where p.agency_id = v_agency
     and p.title in ('Lead Processor', 'Junior Processor')
     and p.reports_to_position_id is null;
end $$;

comment on column public.positions.description is
  'Free text about the SEAT. Where a real person is intended but has no verified email yet, this records their first name and "INVITE EMAIL REQUIRED" — a note to match against, never an identity link (Dee, §5 with §85).';
