-- Team leads and department managers take files. Division managers do not.
--
-- Dee, 2026-09-23, refining the line drawn in 20260923012000: "Team lead can
-- be assigned tasks, not the division managers. Team leads and department
-- managers can receive tasks."
--
-- The previous migration defaulted owners and admins to false, which was
-- right but not the whole rule. Checked against the live seats, exactly one
-- row disagreed with what Dee has now said:
--
--   chief_operations      aaron                     false   ✓ already
--   department_manager    alyssamores               true    ✓ correct — she works files
--   department_manager    dmacasiab                 true    ✓ correct
--   division_manager      rowellchristianpena       false   ✓ already, via admin role
--   division_manager      bes.manager               TRUE    ✗ the one to change
--   managing_partner      lordvrye                  false   ✓ already, via admin role
--
-- So this changes one person, and — more usefully — writes the rule down so
-- the next division manager starts in the right place instead of inheriting
-- the general default.
--
-- ── WHY THE LINE SITS THERE ───────────────────────────────────────────────
--
-- It follows the work, not the rank. A department manager runs ONE department
-- and processes its files alongside the team — Alyssa is one of the three
-- Support agents Dee named. A division manager runs several departments and
-- would be pulled across all of them, which is the context-switching the
-- partner batching exists to prevent.
--
-- TEAM LEADS ARE NOT TOUCHED. `team_memberships.is_lead` is a relationship,
-- not a rank (rule 20b), and a lead is an ordinary `agency_user` who already
-- defaults to true. Dee's "team lead can be assigned tasks" is already the
-- behaviour; nothing is needed to keep it, and writing a rule for it would
-- invent a rank the model deliberately does not have.
--
-- Any of these stays a per-person answer BES can change in either direction.
-- Seniority decides the default, not the answer.
--
-- Cost impact: no material increase.

update public.agency_memberships m
   set can_receive_production_work = false
 where m.status = 'active'
   and m.can_receive_production_work
   and exists (
     select 1 from public.management_seats s
      where s.user_id = m.user_id
        and s.seat::text in ('division_manager', 'chief_operations')
        and public.seat_is_live(s.effective_from, s.effective_to)
   );

do $$
declare v_bad text; v_keep text;
begin
  select string_agg(distinct p.email, ', ') into v_bad
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
    join public.management_seats s on s.user_id = m.user_id
   where m.status = 'active' and m.can_receive_production_work
     and s.seat::text in ('division_manager', 'chief_operations')
     and public.seat_is_live(s.effective_from, s.effective_to);
  if v_bad is not null then
    raise exception 'division managers can still be handed files: %', v_bad;
  end if;

  /* And the other half of Dee's sentence, which is the easier one to break by
     over-reaching: a department manager must STILL be able to receive work. */
  select string_agg(distinct p.email, ', ') into v_keep
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
    join public.management_seats s on s.user_id = m.user_id
   where m.status = 'active'
     and s.seat::text = 'department_manager'
     and public.seat_is_live(s.effective_from, s.effective_to)
     and not m.can_receive_production_work
     and not (m.is_owner or m.role::text in ('agency_owner','agency_admin'));
  if v_keep is not null then
    raise exception 'department managers were wrongly excluded: %', v_keep;
  end if;
end $$;
