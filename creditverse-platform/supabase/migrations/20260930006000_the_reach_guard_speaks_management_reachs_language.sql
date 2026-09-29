-- The reach guard speaks management_reach's language, not a guess at it.
--
-- 20260930005000 added `creditops_any_reach()` so a viewer who cannot reach
-- CreditOps never pays for the per-row `in_scope` check. Measured after it:
-- JM Navales, executive assistant, still 2,720ms to see zero clients.
--
-- The guard answered TRUE for him. His seat is agency-wide — no division, no
-- department — and the first version read "no scope on the seat" as "reaches
-- everything". `management_reach` does not: an executive assistant's seat
-- carries no operational reach, which is exactly why he sees no clients.
-- The guard was a paraphrase of the rule, and the paraphrase was wrong.
--
-- ── SAY IT IN THE SAME WORDS ─────────────────────────────────────────────
--
-- `in_scope(agency, 'creditops', team, assignee, creator)` is true through
-- one of: is_admin_of(agency) · assignee = viewer · a CreditOps team the
-- viewer is on or leads or manages · management_reach(agency, creditops,
-- team). The guard now IS that disjunction with the row-dependent parts
-- taken over every live CreditOps team — a handful — plus the NULL-team
-- form, which `in_scope` also reaches. No paraphrase: it calls the same
-- functions `in_scope` calls, once.
--
-- The `assignee = viewer` branch is omitted on purpose: branch 2 of the
-- policy admits those rows already, unchanged, so the visible set cannot
-- shrink.
--
-- Proven, this time, on today's data: for every account, the old branch-3
-- expression and the new one are evaluated over the same rows and their id
-- sets compared. Not a count — the sets.
--
-- Cost impact: strictly less work, for the people who should cost the least.

begin;

create or replace function public.creditops_any_reach()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.agency_memberships m
     where m.user_id = auth.uid() and m.status = 'active'
       and (
         public.is_admin_of(m.agency_id)
         or public.management_reach(m.agency_id, 'creditops'::public.fulfillment_service, null)
         or exists (
           select 1
             from public.teams t
             join public.departments d on d.id = t.department_id
            where t.agency_id = m.agency_id and t.archived_at is null
              and d.division = 'creditops' and d.archived_at is null
              and (
                exists (select 1 from public.team_memberships tm
                         where tm.team_id = t.id and tm.user_id = m.user_id)
                or public.is_team_lead_of(t.id)
                or t.department_id in (select public.my_departments())
                or public.management_reach(m.agency_id, 'creditops'::public.fulfillment_service, t.id)
              ))
       )
  )
$$;

comment on function public.creditops_any_reach() is
  'in_scope()''s viewer-dependent disjunction for creditops, evaluated once over '
  'the live CreditOps teams. True iff in_scope could admit a row through '
  'anything other than the viewer being its assignee.';

commit;
