-- BES HQ's own tiles were counting [TEST] fixtures as the business.
--
-- Dee's home read "4 organizations · 38 live fulfillment engagements" above a
-- Connected Organizations panel saying "0 companies". Both were behaving as
-- written: the LIST filters `is_fixture = false`, the way a customer list
-- should, and the COUNT above it did not. Measured — 6 organizations exist and
-- 1 is real; 19 credit clients and 11 are real; 41 engagements and 34 sit on a
-- real partner or organization.
--
-- Fixture data must not appear in a real operator's view. It did here as a
-- number rather than a row, which is harder to notice and just as wrong: it is
-- the figure Dee would quote.
--
-- ── ONE CALL INSTEAD OF FIVE ──────────────────────────────────────────────
--
-- The dashboard made five separate head-count requests. `funding_files` and
-- `fulfillment_engagements` carry no `is_fixture` of their own, so excluding
-- fixtures from those means reaching through to the funding client, the
-- organization or the outsourcing group — a join, and a join per tile over
-- PostgREST is five round trips turning into more. One function returns all
-- five counts in a single query instead (rule 14).
--
-- SECURITY INVOKER, deliberately: every count stays bounded by the caller's
-- own row policies, exactly as the five separate reads were. A restricted BES
-- user keeps seeing smaller numbers rather than an error, which is the right
-- behaviour for a summary — this changes what is COUNTED, never who may count.
--
-- Cost impact: reduces it. Five requests per dashboard load become one.

create or replace function public.agency_overview_counts()
returns table (
  organizations    int,
  credit_clients   int,
  funding_files    int,
  funded_files     int,
  live_engagements int
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    (select count(*)::int from public.organizations o
      where not o.is_fixture),
    (select count(*)::int from public.fulfillment_clients c
      where not c.is_fixture),
    /* A funding file belongs to a funding CLIENT, which carries the fixture
       flag — the file itself has neither that flag nor an organization. */
    (select count(*)::int from public.funding_files f
      where not exists (select 1 from public.funding_clients fc
                         where fc.id = f.client_id and fc.is_fixture)),
    (select count(*)::int from public.funding_files f
      where f.stage = 'Funded'
        and not exists (select 1 from public.funding_clients fc
                         where fc.id = f.client_id and fc.is_fixture)),
    /* An engagement is real when neither side of it is a fixture. It names a
       SaaS organization or an outsourcing group — exactly one — so both are
       checked and a null side simply does not match. */
    (select count(*)::int from public.fulfillment_engagements e
      where e.status = 'active'
        and not exists (select 1 from public.organizations o
                         where o.id = e.organization_id and o.is_fixture)
        and not exists (select 1 from public.outsourcing_groups g
                         where g.id = e.outsourcing_group_id and g.is_fixture))
$function$;

revoke execute on function public.agency_overview_counts() from public, anon;
grant execute on function public.agency_overview_counts() to authenticated;

comment on function public.agency_overview_counts() is
  'The five figures on BES HQ''s home, counted in one query with [TEST] fixtures '
  'excluded — the lists beneath these tiles already exclude them, and a number '
  'that disagrees with the list under it is the one people quote. SECURITY '
  'INVOKER: still bounded by the caller''s own row policies (2026-09-22).';
