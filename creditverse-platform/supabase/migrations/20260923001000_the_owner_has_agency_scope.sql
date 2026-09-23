-- An owner's reach matches the fact that they are an owner.
--
-- Dee, 2026-09-23, asked which way to reconcile Aaron's row and answering
-- without ambiguity: "Aaron has access to everything, I repeat, everything,
-- he's an owner."
--
-- aaron@blessedempireservices.com was agency_admin with is_owner = true and
-- scope = 'assigned' — owner-gated capabilities, which include the money ones,
-- with an agent's data reach. The security gate has carried a standing
-- invariant that no owner or admin sits on a narrower scope, and this was the
-- one row failing it. The two possible repairs were opposites — widen the
-- scope, or clear the owner flag — which is why it was raised rather than
-- guessed at.
--
-- This WIDENS a named person's access, on Dee's explicit instruction and
-- nothing else.
--
-- Written as the rule, not as the name. Hardcoding a person into
-- authorization is the thing Dee has ruled out repeatedly, and it would also
-- leave the next owner in the same state: every ACTIVE OWNER gets agency
-- scope, so the invariant is satisfied by anyone the flag is set on, now or
-- later. The invitation path already derives the scope from the role
-- (20260922026000); this closes the rows that predate it.
--
-- Cost impact: no material increase.

update public.agency_memberships m
   set scope = 'agency'
 where m.status = 'active'
   and (m.is_owner or m.role in ('agency_owner', 'agency_admin'))
   and m.scope is distinct from 'agency';

/* The invariant itself, asserted rather than assumed — the same one the gate
   checks, so a row that slips through fails here instead of a fortnight later
   in a 75-minute run. */
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.agency_memberships m
   where m.status = 'active'
     and (m.is_owner or m.role in ('agency_owner', 'agency_admin'))
     and m.scope is distinct from 'agency';
  if v_bad > 0 then
    raise exception '% active owners or admins are still on a narrower scope', v_bad;
  end if;
end $$;
