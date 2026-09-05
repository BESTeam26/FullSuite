-- =============================================================================
-- 0063 — Grant hygiene and organization-operated submissions
--
-- Found by the RLS matrix (phases 23–24, run 2026-09-05) and by inspection of
-- the live catalogue. Three corrections, each evidence-based:
--
-- 1. dispute_rounds had no UPDATE policy, yet open_dispute_round() (invoker
--    rights) closes the previous round on a cycle reset. Under RLS that update
--    matched 0 rows and raised nothing: resets never closed the prior round.
--    The policy follows the same gate the function already enforces.
--
-- 2. funding_deals INSERT/UPDATE admitted only BES staff (0044), while every
--    later funding surface (stage moves, offers, closings, funding) lets the
--    organization operate its own file through file_reviewer(). Submissions
--    now use that same gate: organization admins of the file's organization,
--    or BES staff in scope. Delete stays with agency admins. Without this the
--    status writes inside set_offer_status()/confirm_funding() matched 0 deal
--    rows for organization users, so the deal's status went stale silently.
--
-- 3. Supabase's default privileges give `authenticated` INSERT/SELECT/UPDATE/
--    DELETE (and MAINTAIN) on every new table. Migrations here revoked from
--    `public` and `anon` and granted explicitly — but never revoked from
--    `authenticated`, so 47 tables carried UPDATE or DELETE grants that no
--    policy permits. RLS made those grants inert (0 rows, no error), which is
--    why nothing leaked; but "append-only" must mean no grant, not a grant
--    that happens to match nothing. Revoke every UPDATE/DELETE grant that has
--    no matching policy, revoke the privileges the application never uses,
--    and change the defaults so a future table starts at SELECT/INSERT and
--    must be granted deliberately (a forgotten grant fails loudly in the
--    matrix, which is the safe direction).
-- =============================================================================

-- 1. Rounds may be closed by whoever may build letters for the client --------
create policy dispute_rounds_update on public.dispute_rounds for update to authenticated
  using (public.credit_client_writable(client_id))
  with check (public.credit_client_writable(client_id));

-- 2. Submissions follow the file ----------------------------------------------
drop policy if exists funding_deals_insert on public.funding_deals;
drop policy if exists funding_deals_update on public.funding_deals;
create policy funding_deals_insert on public.funding_deals for insert to authenticated
  with check (public.file_reviewer(file_id));
create policy funding_deals_update on public.funding_deals for update to authenticated
  using (public.file_reviewer(file_id))
  with check (public.file_reviewer(file_id));

-- 3. Grant hygiene ------------------------------------------------------------
-- Privileges the application never exercises through the API role.
revoke truncate, references, trigger on all tables in schema public from authenticated, anon;
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from authenticated, anon';
  end if;
end $$;

-- UPDATE / DELETE grants with no policy that could ever allow them.
do $$
declare r record;
begin
  for r in
    select g.table_name, g.privilege_type
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where g.grantee = 'authenticated'
       and g.table_schema = 'public'
       and g.privilege_type in ('UPDATE', 'DELETE')
       and c.relkind in ('r', 'p', 'v')
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = g.table_name
            and (p.cmd = 'ALL' or p.cmd = g.privilege_type))
  loop
    execute format('revoke %s on public.%I from authenticated', r.privilege_type, r.table_name);
  end loop;
end $$;

-- New tables start at SELECT/INSERT for the API role; UPDATE/DELETE are granted per table, on purpose.
alter default privileges for role postgres in schema public revoke update, delete on tables from authenticated;
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'alter default privileges for role postgres in schema public revoke maintain on tables from authenticated';
  end if;
end $$;
