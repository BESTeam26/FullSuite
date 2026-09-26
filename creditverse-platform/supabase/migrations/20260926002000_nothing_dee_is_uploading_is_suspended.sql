-- Nothing Dee is uploading is suspended.
--
-- Dee, 2026-09-26: "NOTHING FROM WHAT I AM UPLOADING IS SUSPENDED. REMOVE
-- THEM ALL FROM SUSPENSION. Make them Active, ensure they appear in the
-- CreditOps Partner List."
--
-- ── AND A SECOND SOURCE OF TRUTH, WHICH IS WHY SHE SAW IT ─────────────────
--
-- Kevin Hernandez still read "Suspended" in her partner list although his
-- suspension was lifted yesterday. `partner_is_suspended()` reads
-- `partner_suspensions`; the partner list reads `outsourcing_groups.status`.
-- Two places hold the same fact and nothing kept them together, so my lift
-- updated one and left the other saying the opposite.
--
-- A trigger now keeps the column following the table, which is the right way
-- round: the suspension RECORD is the fact, with its reason, its date and
-- who lifted it. The column is a label, and a label that can disagree with
-- the thing it labels is worse than no label.
--
-- ── WHAT IS CLEARED ───────────────────────────────────────────────────────
--
-- Every partner Dee is uploading — the ones carrying a ClickUp list link.
-- Business Made Fair is the only one still suspended: lifted, set Active,
-- its CreditOps engagement resumed from `paused`, and assigned to the three
-- staffed CreditOps teams so somebody other than an administrator can open
-- the files.
--
-- ── WHAT IS NOT, AND WHY ──────────────────────────────────────────────────
--
-- [TEST] Suspension is the fixture the security matrix suspends things
-- with. Lifting it would leave nothing testing that a suspended partner's
-- files stay out of the queues — which is the rule protecting Dee from
-- working for somebody who is not paying.
--
-- K&A Consulting Group is suspended and is NOT one of the uploads. "Nothing
-- from what I am uploading" is the instruction; a partner she has not
-- mentioned is not covered by it, and unsuspending one on my own initiative
-- is a money decision.
--
-- Cost impact: no material increase.

begin;

/* The label follows the record. Both directions: raising a suspension marks
   the partner Suspended, lifting the last live one puts it back to Active. */
create or replace function public.partner_status_follows_suspension()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_group uuid;
begin
  v_group := coalesce(new.group_id, old.group_id);
  update public.outsourcing_groups g
     set status = (case when public.partner_is_suspended(v_group) then 'Suspended' else 'Active' end)::public.outsourcing_group_status,
         updated_at = now()
   where g.id = v_group
     /* Archived and other deliberate states are not ours to overwrite. */
     and g.status::text in ('Active', 'Suspended');
  return null;
end $function$;

drop trigger if exists partner_suspension_sets_status on public.partner_suspensions;
create trigger partner_suspension_sets_status
  after insert or update of lifted_at or delete on public.partner_suspensions
  for each row execute function public.partner_status_follows_suspension();

do $$
declare r record; v_lifted int := 0; v_resumed int := 0; v_teams int := 0;
declare v_owner uuid; t record;
begin
  select user_id into v_owner from public.agency_memberships m
   where m.is_owner and m.status = 'active'
     and exists (select 1 from public.profiles p where p.id = m.user_id
                  and coalesce(p.is_fixture, false) = false)
   limit 1;

  for r in
    select g.id, g.agency_id, g.name
      from public.outsourcing_groups g
     where g.source_list_ref is not null and g.archived_at is null
  loop
    /* Suspensions. */
    update public.partner_suspensions
       set lifted_at = now(),
           lift_reason = 'Not suspended — Dee, 2026-09-26: nothing she is uploading is suspended.'
     where group_id = r.id and lifted_at is null;
    if found then v_lifted := v_lifted + 1; end if;

    /* The label, for any partner whose record and column had already drifted
       apart before the trigger existed. */
    update public.outsourcing_groups
       set status = 'Active'::public.outsourcing_group_status, updated_at = now()
     where id = r.id and status::text = 'Suspended' and not public.partner_is_suspended(r.id);

    /* A paused CreditOps engagement keeps them out of the partner list. */
    update public.fulfillment_engagements
       set status = 'active', effective_to = null, updated_at = now()
     where outsourcing_group_id = r.id and service = 'creditops' and status = 'paused';
    if found then v_resumed := v_resumed + 1; end if;

    /* And a live team, or only administrators can open the files. */
    for t in
      select tm.id from public.teams tm
       join public.departments d on d.id = tm.department_id
      where tm.agency_id = r.agency_id and tm.archived_at is null
        and d.division = 'creditops' and d.archived_at is null
        and d.key in ('dispute', 'support', 'complaints')
    loop
      if not exists (select 1 from public.partner_assignments a
                      where a.group_id = r.id and a.team_id = t.id and a.ended_on is null) then
        insert into public.partner_assignments
          (agency_id, group_id, team_id, assignment_role, started_on, created_by, notes)
        values (r.agency_id, r.id, t.id, 'assigned', current_date, v_owner,
                'Division-wide while no individual owner is named (2026-09-26).');
        v_teams := v_teams + 1;
      end if;
    end loop;
  end loop;

  raise notice '% suspensions lifted, % engagements resumed, % team assignments added',
    v_lifted, v_resumed, v_teams;
end $$;

/* Every uploaded partner is active, unsuspended, live in CreditOps and
   reachable by a real team. Asserted, not assumed. */
do $$
declare v_bad text;
begin
  select string_agg(g.name || ' (' ||
           case when public.partner_is_suspended(g.id) then 'suspended' else '' end ||
           case when g.status::text <> 'Active' then ' status=' || g.status::text else '' end ||
           case when not exists (
             select 1 from public.fulfillment_engagements e
              where e.outsourcing_group_id = g.id and e.service = 'creditops'
                and public.engagement_is_live(e.status, e.effective_from, e.effective_to))
             then ' no live creditops engagement' else '' end ||
           case when not exists (
             select 1 from public.partner_assignments a
              join public.teams t on t.id = a.team_id and t.archived_at is null
             where a.group_id = g.id and a.ended_on is null)
             then ' no live team' else '' end || ')', '; ')
    into v_bad
    from public.outsourcing_groups g
   where g.source_list_ref is not null and g.archived_at is null
     and (public.partner_is_suspended(g.id)
          or g.status::text <> 'Active'
          or not exists (select 1 from public.fulfillment_engagements e
                          where e.outsourcing_group_id = g.id and e.service = 'creditops'
                            and public.engagement_is_live(e.status, e.effective_from, e.effective_to))
          or not exists (select 1 from public.partner_assignments a
                          join public.teams t on t.id = a.team_id and t.archived_at is null
                         where a.group_id = g.id and a.ended_on is null));
  if v_bad is not null then
    raise exception 'still not workable: %', v_bad;
  end if;
end $$;

/* And the fixture that tests suspension is untouched, or the matrix stops
   proving that a suspended partner's files leave the queues. */
do $$
begin
  if not exists (select 1 from public.partner_suspensions s
                  join public.outsourcing_groups g on g.id = s.group_id
                 where g.name = '[TEST] Suspension' and s.lifted_at is null) then
    raise exception 'the suspension fixture was lifted — the matrix can no longer test suspension';
  end if;
end $$;

commit;
