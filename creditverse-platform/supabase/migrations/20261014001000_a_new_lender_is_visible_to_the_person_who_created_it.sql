-- A new lender is visible to the person who created it.
--
-- Found 2026-09-30, finished 2026-10-14 (the draft sat in an abandoned
-- worktree and never reached main). Proven again on 2026-10-14 against the
-- live database, as the matrix fixtures, inside rolled-back transactions:
-- `insert into lenders …` succeeds and `insert into lenders … returning id`
-- is refused with "new row violates row-level security policy", for a
-- catalogue lender (BES owner) and an organization lender (organization
-- admin) alike. createLender() inserts with .select("id"), which is
-- INSERT … RETURNING, so no lender could ever be created from the interface —
-- the live database holds zero lenders, programs and policy versions.
--
-- Why: RETURNING makes Postgres check the new row against the SELECT policy
-- too, and that policy was lender_visible(id). lender_visible() is STABLE and
-- finds its answer by reading public.lenders by id. A STABLE function sees the
-- snapshot from before the statement began, so during the insert's own check
-- the row it is asked about does not exist yet, and the answer is always
-- false. The insert policy itself was passing.
--
-- The fix: the rule is asked of the ROW'S OWN columns. lender_row_visible()
-- takes id, organization_id and agency_id from the row being checked and
-- never looks the lender up. lender_visible(uuid) keeps its signature and its
-- callers (contacts, programs, policy versions, product rules — all of which
-- check a parent that already exists) and now delegates to the same function,
-- so the visibility rule is written once.
--
-- The rule is unchanged, clause for clause, from 20260910000100:
--   catalogue lender (organization_id null) → agency staff, or any active
--     organization member
--   organization lender → that organization's members, or a manager of the
--     owning agency
--   any lender → a platform user linked to it through lender_users
--
-- No other policy changes. lender_editable() is left alone: it serves UPDATE
-- (the row already exists in the snapshot) and child-table inserts (the
-- parent lender already exists), so it does not have this failure.

create or replace function public.lender_row_visible(p_lender uuid, p_org uuid, p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select (p_org is null and (public.is_agency_staff()
            or exists (select 1 from public.org_memberships m where m.user_id = auth.uid() and m.archived_at is null)))
      or (p_org is not null and (public.is_org_member(p_org) or public.is_manager_of(p_agency)))
      or exists (select 1 from public.lender_users lu where lu.lender_id = p_lender and lu.user_id = auth.uid())
$function$;

revoke all on function public.lender_row_visible(uuid, uuid, uuid) from public, anon;
grant execute on function public.lender_row_visible(uuid, uuid, uuid) to authenticated;

create or replace function public.lender_visible(p_lender uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (select 1 from public.lenders l
                  where l.id = p_lender
                    and public.lender_row_visible(l.id, l.organization_id, l.agency_id))
$function$;

drop policy if exists lenders_select on public.lenders;
create policy lenders_select on public.lenders for select to authenticated
  using (public.lender_row_visible(id, organization_id, agency_id));
