-- =============================================================================
-- One `invite_agency_member`, not two.
--
-- Dee, live, 2026-09-13, trying to invite somebody:
--   "Could not choose the best candidate function between:
--    invite_agency_member(p_email, p_role, p_profile, p_lead_team, p_modules)
--    invite_agency_member(p_email, p_role, p_profile, p_lead_team, p_modules,
--                         p_team, p_full_name)"
--
-- Adding the team and the name gave the function DEFAULTS, and a defaulted
-- parameter creates an OVERLOAD rather than replacing the original. Both
-- signatures then matched a five-argument call and Postgres refused to choose
-- — so nobody could be invited at all.
--
-- This is the second time this exact trap has cost live functionality
-- (`creditops_route_client`, 2026-09-12). The rule, written down properly this
-- time: adding a defaulted parameter to an existing function is a REPLACEMENT
-- only if the old signature is dropped in the same migration.
--
-- The seven-argument form is the one that stays: the team and the lead
-- designation travel on the invitation so acceptance can build the whole
-- person — identity, capabilities, module access, team membership, lead
-- designation — in one atomic step.
-- =============================================================================

drop function if exists public.invite_agency_member(text, public.agency_role, public.access_profile, uuid, text[]);

/* Proof, not assumption: if anything still resolves to two candidates the
   next caller gets the same refusal, so fail the migration instead. */
do $$
declare n int;
begin
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'invite_agency_member';
  if n <> 1 then
    raise exception 'invite_agency_member has % signatures; exactly one is required', n;
  end if;
end $$;
