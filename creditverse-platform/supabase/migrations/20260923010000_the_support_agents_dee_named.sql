-- The Support assignments Dee named.
--
-- 2026-09-23, verbatim: "Credit by Nainoa is with Allyssa and Jet Support.
-- Vanquish is with Jet for support. Support has assignment but processing and
-- companies are random. ONLY SUPPORT HAS DEDICATED MEMBERS. Allyssa - BMF, and
-- Nainoa and Selena. Jet - Nainoa and Vanquish. they are the lead agents. most
-- of the Outsourcing falls to nico. The rest unassigned will be assigned to all
-- 3 of them randomly."
--
--   Alyssa Mores   Business Made Fair, Credit by Nainoa, K&A Consulting Group
--   Jet Manugas    Credit by Nainoa, Vanquish Ventures
--   Nico Garcia    the Outsourcing folder, except Business Made Fair
--
-- Everything else is left with no named agent on purpose — that IS "the rest
-- assigned to all 3 of them randomly", because the picker already shares
-- unclaimed work between whoever works the department, and all three are in
-- Client Success.
--
-- ── WHY THIS ONLY AFFECTS SUPPORT, WITHOUT SAYING SO ──────────────────────
--
-- Dee: "only support has dedicated members… processing and companies are
-- random." No rule is needed for that. `creditops_pick_assignee` narrows a
-- partner's named agents to the ones who work the department being assigned,
-- and all three sit in Client Success — which is the Support and Onboarding
-- queues. So a Dispute or Complaints file on Credit by Nainoa finds no named
-- agent who works that queue and falls through to the even spread, exactly as
-- she describes. The behaviour comes from the roster, not from a special case.
--
-- ── TWO READINGS I HAD TO MAKE ────────────────────────────────────────────
--
-- "Selena" is a person, not a company. The only Selena on record is
-- selena@kellyalexanderfinancials.com, so it is read as K&A CONSULTING GROUP.
-- "Most of the Outsourcing falls to nico" is read as the Outsourcing folder
-- minus the one she named for Alyssa. BUSINESS MADE FAIR IS IN THE OUTSOURCING
-- FOLDER, so it would otherwise have gone to Nico — she named it for Alyssa,
-- so it is excluded. Both are flagged to her; either is one row to change.
--
-- Written as `on conflict do nothing` against live rows and started today, so
-- re-running changes nothing and no history is rewritten.
--
-- Cost impact: no material increase.

do $$
declare
  v_agency uuid := (select id from public.agencies order by created_at limit 1);
  v_alyssa uuid := (select id from public.profiles where email = 'alyssamores.bes@gmail.com');
  v_jet    uuid := (select id from public.profiles where email = 'jetmanugas.bes@gmail.com');
  v_nico   uuid := (select id from public.profiles where email = 'nicoangelogarcia.bes@gmail.com');
  v_named  int := 0;
begin
  if v_alyssa is null or v_jet is null or v_nico is null then
    raise exception 'one of the three Support agents was not found by email — check before assuming';
  end if;

  /* The partners Dee named, by name. */
  insert into public.partner_assignments (agency_id, group_id, user_id, assignment_role, started_on)
  select v_agency, g.id, a.user_id, 'support', current_date
    from public.outsourcing_groups g
    join (values
      ('Credit by Nainoa',     v_alyssa),
      ('Credit by Nainoa',     v_jet),
      ('Vanquish Ventures',    v_jet),
      ('Business Made Fair',   v_alyssa),
      ('K&A Consulting Group', v_alyssa)
    ) as a(partner, user_id) on a.partner = g.name
   where g.is_fixture = false
     and not exists (
       select 1 from public.partner_assignments pa
        where pa.group_id = g.id and pa.user_id = a.user_id and pa.ended_on is null);

  get diagnostics v_named = row_count;

  /* Nico takes the Outsourcing folder, except the one Dee named for Alyssa. */
  insert into public.partner_assignments (agency_id, group_id, user_id, assignment_role, started_on)
  select v_agency, g.id, v_nico, 'support', current_date
    from public.outsourcing_groups g
    join public.fulfillment_engagements e
      on e.outsourcing_group_id = g.id and e.service::text = 'creditops'
    join public.module_categories c
      on c.id = e.operational_category_id and c.key = 'outsourcing'
   where g.is_fixture = false
     and g.name <> 'Business Made Fair'
     and not exists (
       select 1 from public.partner_assignments pa
        where pa.group_id = g.id and pa.user_id = v_nico and pa.ended_on is null);

  raise notice 'named assignments added: % (plus Nico''s outsourcing folder)', v_named;
end $$;

/* The point of all this: a named agent must actually be reachable by the
   picker, which needs them on a CreditOps department team. Four agents were
   already named on partner assignments and NONE was on such a team, so that
   branch could never fire. If these three are not either, say so now rather
   than let it silently fall through to round-robin again. */
do $$
declare v_unreachable text;
begin
  select string_agg(distinct p.email, ', ') into v_unreachable
    from public.partner_assignments pa
    join public.profiles p on p.id = pa.user_id
   where pa.ended_on is null
     and p.email in ('alyssamores.bes@gmail.com','jetmanugas.bes@gmail.com','nicoangelogarcia.bes@gmail.com')
     and not exists (
       select 1 from public.team_memberships tm
         join public.teams t on t.id = tm.team_id and t.archived_at is null
         join public.departments d on d.id = t.department_id
          and d.division = 'creditops' and d.archived_at is null
        where tm.user_id = p.id);
  if v_unreachable is not null then
    raise exception 'these named agents are on no CreditOps team, so the assignment would never reach them: %', v_unreachable;
  end if;
end $$;
