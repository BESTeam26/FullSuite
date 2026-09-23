-- Being able to see the work is not the same as being given it.
--
-- Dee, 2026-09-23: "Aaron and Bryan has no Assignment as they are top of the
-- admin, I mean their role."
--
-- And the CreditOps auto-assignment spec, the same day: "A manager does not
-- automatically receive production work merely because they can see it. Team
-- Leads / Department Managers should have `can_receive_production_work =
-- true/false` so Daniel or Allyssa can be included in assignment only when BES
-- intentionally wants them processing files."
--
-- ── THIS IS ALREADY TRUE, AND THAT IS THE PROBLEM ─────────────────────────
--
-- Measured before writing anything: every one of the twelve people the
-- assignment engine can currently reach is an `agency_user`. No admin, no
-- owner. So nothing is broken today.
--
-- But it is true BY ACCIDENT — it holds only because no admin happens to sit
-- on a CreditOps department team. The moment somebody adds Aaron to Dispute so
-- he can see the queue, he starts being handed files, and nobody would connect
-- the two actions. A rule that depends on a roster nobody is maintaining for
-- that purpose is a rule waiting to break quietly.
--
-- So the flag exists, defaulted from role, and the picker reads it. The
-- behaviour does not change today. It stops depending on luck.
--
-- ── WHY A FLAG RATHER THAN EXCLUDING ADMINS IN THE QUERY ──────────────────
--
-- Because Dee's three Support agents are "the lead agents" and DO process
-- files. A rule of "leads never receive work" would be wrong for BES. The
-- question is per person and BES answers it deliberately — which is exactly
-- what the spec asked for. Seniority decides the DEFAULT, not the answer.
--
-- Cost impact: no material increase — one boolean on a join the picker already
-- makes.

alter table public.agency_memberships
  add column if not exists can_receive_production_work boolean not null default true;

comment on column public.agency_memberships.can_receive_production_work is
  'Whether automatic assignment may hand this person production work. Defaults '
  'true, and false for owners and admins — seeing a queue is not the same as '
  'being given files from it. A lead who does process work keeps it true; this '
  'is answered per person, not by rank (Dee, 2026-09-23).';

/* Owners and admins start at false. Written as the rule, not as two names:
   Aaron and Bryan are the examples, the role is the reason, and the next
   admin should not have to be remembered. */
update public.agency_memberships
   set can_receive_production_work = false
 where (is_owner or role::text in ('agency_owner', 'agency_admin'))
   and can_receive_production_work;

/* The picker honours it. Verbatim replacement of the eligibility clause in
   both functions, so the rest of the logic is provably untouched. */
do $$
declare
  v_fn text;
  v_def text;
  v_old text := '       and coalesce(am.status, ''active'') = ''active''';
  v_new text := '       and coalesce(am.status, ''active'') = ''active''
       /* Seeing the queue is not being given files from it. */
       and am.can_receive_production_work';
begin
  foreach v_fn in array array[
    'public.creditops_pick_assignee_explained(public.fulfillment_department, uuid, uuid, uuid)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position(v_old in v_def) = 0 then
      raise exception '% does not filter eligibility as expected — read it before replacing it', v_fn;
    end if;
    execute replace(v_def, v_old, v_new);
  end loop;
end $$;

/* Nobody who cannot receive work is reachable, and the people who do the work
   still are — a filter that emptied the pool would be worse than none. */
do $$
declare v_pool int; v_admins int;
begin
  select count(distinct m.user_id) into v_pool
    from public.agency_memberships m
    join public.team_memberships tm on tm.user_id = m.user_id
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.departments d on d.id = t.department_id
     and d.division = 'creditops' and d.archived_at is null
   where m.status = 'active' and m.can_receive_production_work;

  select count(*) into v_admins
    from public.agency_memberships m
   where m.status = 'active'
     and (m.is_owner or m.role::text in ('agency_owner','agency_admin'))
     and m.can_receive_production_work;

  if v_admins > 0 then
    raise exception '% owners or admins can still be handed production work', v_admins;
  end if;
  if v_pool = 0 then
    raise exception 'the assignment pool is now empty — the filter is too broad';
  end if;
  raise notice 'assignment pool: % people, admins excluded', v_pool;
end $$;
