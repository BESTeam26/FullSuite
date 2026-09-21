-- Aaron is an owner, which is the fact the exemption rule needs.
--
-- Dee, 2026-09-20: "Aaron is my husband and co founder, he sees everything."
-- Dee, 2026-09-21: "Aaron and Dee are Executive… Husband and wife, both owners
-- of the platform."
--
-- Deriving workforce exemption from `is_owner` (20260921004000) exposed that
-- Aaron was not flagged as one. His exemption was therefore a leftover from
-- the name-matching it replaced — correct today, and silently wrong the moment
-- anybody rebuilt it from the rule.
--
-- This also changes HOW he holds the money capabilities rather than WHETHER.
-- He already held all nine by explicit grant (20260920002500); as an owner he
-- holds them by ownership. The explicit grants stay: they are the record of a
-- deliberate decision, and removing them would make the history read as if
-- nobody had ever made it.

do $$
declare v_n int;
begin
  update public.agency_memberships m
     set is_owner = true
    from public.profiles p
   where p.id = m.user_id and m.status = 'active'
     and p.email = 'aaron@blessedempireservices.com'
     and not m.is_owner;
  get diagnostics v_n = row_count;
  raise notice 'Owners added: %', v_n;

  if v_n = 0 then
    raise notice 'No change — either already an owner, or that address is not on the roster.';
  end if;
end $$;
