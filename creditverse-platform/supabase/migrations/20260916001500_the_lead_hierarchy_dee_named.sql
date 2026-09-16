-- The reporting line, as Dee set it on 2026-09-16.
--
--   TalentOps Team lead is Allyssa
--   Support Department is Allyssa
--   Complaints is part of dispute so it's Daniel
--   CRM TL is Rowell
--   All TLs will report to Bryan
--   Team Ally - Allyssa
--   Team Daniel - Daniel
--
-- ── THE SECOND LEVEL NEEDS NO NEW CONCEPT ──────────────────────────────────
--
-- "All TLs report to Bryan" sounds like a hierarchy the model does not have,
-- and it already does. There is a `Team Leads` team; put the leads on it and
-- make Bryan its lead, and `eod_route_for` resolves each of them to Bryan by
-- exactly the rule it uses for everybody else — Employee → Team Membership →
-- Team Lead. No manager column, no second hierarchy, nothing named after a
-- person.
--
-- It also stays correct when the people change: whoever leads `Team Leads`
-- receives the leads' reports, and whoever is on it sends theirs there.
--
-- Rowell currently LEADS `Team Leads`. He is a team lead who now reports to
-- Bryan, so he becomes a member of it rather than its lead. Nothing else about
-- his CRM leadership changes.
--
-- ── WHAT THIS MIGRATION CANNOT DO ──────────────────────────────────────────
--
-- Allyssa and Daniel have not accepted their invitations, so they have no
-- profile row and `team_memberships.user_id` is a foreign key to one. Their
-- half of this is set on their INVITATIONS instead, so acceptance applies it,
-- and the rest is listed in the report rather than pretended at. Creating
-- placeholder accounts to make the diagram look finished would put two people
-- in the roster who cannot sign in.

-- ── Bryan receives the leads ───────────────────────────────────────────────

do $$
declare
  v_leads_team uuid := '744078cd-826c-4f68-ad50-fba3774becaf';  -- Team Leads
  v_bryan uuid;
  v_rowell uuid;
begin
  /* Resolved from the canonical membership, not from a name in this file:
     the ONLY administrator holding the explicit payroll grant is Bryan, which
     is a fact about the database rather than about the string "Bryan". If that
     ever matches nobody, the block does nothing rather than guessing. */
  select m.user_id into v_bryan
    from public.agency_memberships m
    join public.agency_member_permissions amp
      on amp.membership_id = m.id and amp.key = 'payroll.manage' and amp.allowed
   where m.role = 'agency_admin' and m.status = 'active'
   limit 1;

  select tm.user_id into v_rowell
    from public.team_memberships tm
   where tm.team_id = v_leads_team and tm.is_lead
   limit 1;

  if v_bryan is null then
    raise notice 'No administrator holds payroll.manage; the Team Leads lead was not changed.';
    return;
  end if;

  /* Bryan leads. */
  insert into public.team_memberships (team_id, user_id, is_lead)
  values (v_leads_team, v_bryan, true)
  on conflict (team_id, user_id) do update set is_lead = true;

  /* The previous lead stays ON the team, as a member — he is a team lead who
     now reports to Bryan, which is exactly what membership here means. */
  if v_rowell is not null and v_rowell <> v_bryan then
    update public.team_memberships
       set is_lead = false
     where team_id = v_leads_team and user_id = v_rowell;
  end if;
end $$;

-- ── What acceptance should do for the two who have not accepted ────────────

/*
 * An invitation carries ONE lead team, so each of these names the team whose
 * absence would leave the most people unrouted. The remaining leaderships are
 * added after they accept; the report says which.
 *
 * Allyssa: TalentOps Team. Alliana and JM are on it with no lead at all, so it
 * is the gap that costs the most. Her Client Success / Support leadership is
 * already on the invitation as the team she JOINS.
 *
 * Daniel: Complaints & Mailing. Ivan and Archie are on it with no lead, and
 * Dee's instruction is explicit that Complaints belongs to him through Dispute.
 * He still joins Dispute Processing, which he also leads.
 */
update public.invitations
   set lead_team_id = '3e190c77-a8ba-4f1a-85d1-5fc2a8467b01'   -- TalentOps Team
 where email = 'alyssamores.bes@gmail.com' and accepted_at is null;

update public.invitations
   set lead_team_id = 'bdba8813-b8b7-4b07-901d-b597ea163932'   -- Complaints & Mailing
 where email = 'dmacasiab.bes@gmail.com' and accepted_at is null;
