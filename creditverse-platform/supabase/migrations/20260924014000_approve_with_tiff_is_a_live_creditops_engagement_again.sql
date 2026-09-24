-- Approve with Tiff is a live CreditOps engagement again.
--
-- Dee, 2026-09-24: "why I don't see Approve with Tiff on my CreditOps partner
-- list?"
--
-- Because BES's engagement to fulfil CreditOps for them has been `paused`
-- since 2026-09-11, and by rule 16 a partner is in the operating tree only
-- while a LIVE engagement exists. The tree was right. The record was stale.
--
-- ── IT IS NOT JUST A MISSING FOLDER ───────────────────────────────────────
--
-- `bes_engaged_with()` gates the client rows themselves, so with the
-- engagement paused the 71 clients just imported were invisible to the people
-- meant to work them. Measured before this migration:
--
--   Dee Gallardo    71 clients visible   (agency admin, sees everything)
--   Jet Manugas      5 clients visible   (only those assigned directly)
--   Ivan Olympia     5 clients visible   (only those assigned directly)
--
-- Sixty-six files that nobody but an administrator could open, on the day the
-- team was asked to start testing with them. That is the authorization model
-- doing exactly what it should, on a fact about the world that was no longer
-- true.
--
-- ── WHAT THIS GRANTS, SAID PLAINLY ────────────────────────────────────────
--
-- Activating the engagement gives BES staff authority over this partner's
-- CreditOps files, narrowed as always by `in_scope()`, the department queues
-- and each person's own assignments. It grants nothing outside CreditOps and
-- nothing to anybody outside BES. `authorized_team` stays null, which means
-- the whole CreditOps division rather than one team — the same as every other
-- live partner here.
--
-- The dates are left alone: `effective_from` stays 2026-09-09, when the
-- relationship actually began, because changing it would rewrite history to
-- make this migration look tidy.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_id uuid;
  v_before text;
begin
  select e.id, e.status::text into v_id, v_before
    from public.fulfillment_engagements e
    join public.outsourcing_groups g on g.id = e.outsourcing_group_id
   where g.name = 'Approve with Tiff' and e.service::text = 'creditops';

  if v_id is null then
    raise exception 'no CreditOps engagement for Approve with Tiff — create it, do not guess';
  end if;
  if v_before = 'active' then
    raise notice 'already active; nothing to do';
    return;
  end if;
  if v_before <> 'paused' then
    /* Ended or completed is a different decision with a different meaning,
       and resuming one silently would be inventing a contract. */
    raise exception 'the engagement is %, not paused — that is Dee''s call, not a repair', v_before;
  end if;

  update public.fulfillment_engagements
     set status = 'active', updated_at = now()
   where id = v_id;

  raise notice 'engagement % : % → active', v_id, v_before;
end $$;

/* The people who work these files can now see them. Asserted as the agents
   themselves, because a count taken as the owner proves nothing about what an
   agent sees (rule 20b). */
do $$
declare
  v_group uuid;
  r record;
  v_seen int;
begin
  select id into v_group from public.outsourcing_groups where name = 'Approve with Tiff';

  for r in
    select m.user_id, p.full_name
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
      join public.team_memberships tm on tm.user_id = m.user_id
      join public.teams t on t.id = tm.team_id and t.archived_at is null
      join public.departments d on d.id = t.department_id and d.division = 'creditops'
     where m.status = 'active' and coalesce(p.is_fixture, false) = false
     group by m.user_id, p.full_name
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    /* `bes_engaged_with` takes an ORGANIZATION; the partner-group question is
       `bes_may_fulfil(org, group, service)` with a null organization. Asking
       the wrong one returns false for every group and would have failed this
       guard on a correct migration. */
    if not public.bes_may_fulfil(null, v_group, 'creditops') then
      raise exception 'the engagement is still not live for %', r.full_name;
    end if;
    select count(*) into v_seen from public.fulfillment_clients
     where outsourcing_group_id = v_group;
    if v_seen < 60 then
      raise exception '% can still only see % of the partner''s clients', r.full_name, v_seen;
    end if;
    raise notice '% sees % clients', r.full_name, v_seen;
  end loop;
  perform set_config('request.jwt.claims', null, true);
end $$;

commit;
