-- 0126 — a SECURITY DEFINER function must never be executable by PUBLIC.
--
-- 0124 revoked `ai_spend_today` from `authenticated` and it stayed reachable,
-- because it had never been revoked from PUBLIC — and `authenticated`
-- inherits PUBLIC. The original migration revoked `ai_reserved_credits` from
-- public/anon on the line above and granted `ai_spend_today` to authenticated
-- on the line below; the revoke simply named the wrong function.
--
-- This is the second time in this build that a function was reachable through
-- two independent grants (the first is recorded in CLAUDE.md, migrations
-- 0003/0004: Supabase's grant to `anon` and Postgres's default grant to
-- PUBLIC). Revoking one leaves the door open.
--
-- So rather than fixing the one function, this closes the class: every
-- SECURITY DEFINER function in `public` loses PUBLIC and `anon` execute. A
-- DEFINER function runs with its owner's rights, and there is no case in this
-- platform where that should be reachable by an unauthenticated caller.
-- Functions that authenticated users legitimately call keep their explicit
-- grant, which this does not touch.

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', fn.sig);
  end loop;
end $$;

-- And the specific one that started this: internal, called only by ai_reserve.
comment on function public.ai_spend_today(uuid) is
  'INTERNAL. Called by ai_reserve. Takes an organization id, so it must not be reachable by a browser — it was, through PUBLIC, until 0126.';
